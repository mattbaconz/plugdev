import { access, readdir, stat, unlink, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { plugdevHome } from "../paths.js";
import { warn } from "../util/log.js";
import { Errors } from "../util/errors.js";

interface VersionManifestEntry {
  id: string;
  url: string;
}

export type PrefetchProgress = (
  percent: number | undefined,
  label: string,
) => void;

/** Mojang CDN + common mirrors (tried in order by @xmcl InstallAssetTask). */
export const MINECRAFT_ASSET_HOSTS = [
  "https://bmclapi2.bangbang93.com/assets",
  "https://resources.download.minecraft.net",
] as const;

export function embeddedClientDir(): string {
  return join(plugdevHome(), "minecraft");
}

/** Weak check: version JSON exists (may still have corrupt libraries). */
export async function isEmbeddedClientCached(mcVersion: string): Promise<boolean> {
  const versionJson = join(
    embeddedClientDir(),
    "versions",
    mcVersion,
    `${mcVersion}.json`,
  );
  try {
    await access(versionJson, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const BLOCKING_ROLES = new Set(["library", "minecraftJar", "versionJson"]);

/**
 * True when version JSON exists and diagnose finds no blocking library/jar/json issues.
 * Asset issues alone do not block launch readiness for PlugDev.
 */
export async function isEmbeddedClientReady(mcVersion: string): Promise<boolean> {
  if (!(await isEmbeddedClientCached(mcVersion))) return false;
  try {
    const { diagnose } = await import("@xmcl/core");
    const report = await diagnose(mcVersion, embeddedClientDir());
    return !report.issues.some((i) => BLOCKING_ROLES.has(i.role));
  } catch {
    return false;
  }
}

export function isMissingLibrariesError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { error?: string; message?: string };
  if (e.error === "MissingLibraries") return true;
  return typeof e.message === "string" && e.message.includes("Missing") && e.message.includes("libraries");
}

export function isAssetDownloadError(err: unknown): boolean {
  if (!err) return false;
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/ConnectTimeout|ChecksumNotMatch|UND_ERR_CONNECT_TIMEOUT|resources\.download\.minecraft\.net/i.test(text)) {
    return true;
  }
  if (err instanceof AggregateError) {
    return err.errors.some((e) => isAssetDownloadError(e));
  }
  const nested = (err as { errors?: unknown[] }).errors;
  if (Array.isArray(nested)) return nested.some((e) => isAssetDownloadError(e));
  return false;
}

/** Remove 0-byte / empty-SHA1 asset objects left by failed downloads. */
export async function purgeEmptyAssetObjects(
  gamePath: string = embeddedClientDir(),
): Promise<number> {
  const objectsRoot = join(gamePath, "assets", "objects");
  let removed = 0;
  let dirs: string[];
  try {
    dirs = await readdir(objectsRoot);
  } catch {
    return 0;
  }
  for (const head of dirs) {
    const dir = join(objectsRoot, head);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of files) {
      const file = join(dir, name);
      try {
        const st = await stat(file);
        if (st.size === 0) {
          await unlink(file);
          removed += 1;
        }
      } catch {
        // ignore
      }
    }
  }
  return removed;
}

async function createDownloadDispatcher(): Promise<unknown> {
  const undici = await import("undici");
  const { setMaxListeners } = await import("node:events");
  // @xmcl/installer retries can attach multiple abort listeners per download
  setMaxListeners(32, AbortSignal.prototype);
  const Agent = undici.Agent;
  const interceptors = undici.interceptors;
  // Longer timeouts — Mojang CDN often exceeds undici's 10s default abroad
  return new Agent({
    connections: 8,
    connectTimeout: 60_000,
    headersTimeout: 60_000,
    bodyTimeout: 180_000,
  }).compose(
    interceptors.retry({
      maxRetries: 5,
      methods: ["GET", "HEAD", "OPTIONS", "PUT", "DELETE", "TRACE"],
      statusCodes: [429, 500, 502, 503, 504],
      errorCodes: [
        "ECONNRESET",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ENOTFOUND",
        "EPIPE",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_HEADERS_TIMEOUT",
        "UND_ERR_BODY_TIMEOUT",
        "UND_ERR_SOCKET",
      ],
    }),
    interceptors.redirect({ maxRedirections: 5 }),
  );
}

async function installOptions(): Promise<Record<string, unknown>> {
  return {
    side: "client",
    dispatcher: await createDownloadDispatcher(),
    assetsHost: [...MINECRAFT_ASSET_HOSTS],
  };
}

async function fetchVersionMeta(mcVersion: string): Promise<VersionManifestEntry> {
  const manifestRes = await fetch(
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
  );
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch Minecraft version manifest: ${manifestRes.status}`);
  }
  const manifest = (await manifestRes.json()) as {
    versions: VersionManifestEntry[];
  };
  const versionMeta = manifest.versions.find((v) => v.id === mcVersion);
  if (!versionMeta) {
    throw new Error(`Minecraft version ${mcVersion} not found in manifest`);
  }
  return versionMeta;
}

async function installCore(
  mcVersion: string,
  opts?: { onProgress?: PrefetchProgress },
): Promise<void> {
  opts?.onProgress?.(undefined, `Downloading Minecraft ${mcVersion} (core)…`);
  const versionMeta = await fetchVersionMeta(mcVersion);
  const gamePath = embeddedClientDir();
  await mkdir(gamePath, { recursive: true });
  const options = await installOptions();
  const {
    installVersion,
    installLibraries,
  } = await import("@xmcl/installer");
  const { Version } = await import("@xmcl/core");

  // Version JSON + client JAR (required)
  await installVersion(versionMeta, gamePath, options);
  const resolved = await Version.parse(gamePath, mcVersion);
  opts?.onProgress?.(undefined, `Downloading Minecraft libraries…`);
  await installLibraries(resolved, options);
}

async function installAssetsBestEffort(
  mcVersion: string,
  opts?: { onProgress?: PrefetchProgress },
): Promise<{ ok: boolean; error?: unknown }> {
  const gamePath = embeddedClientDir();
  const options = await installOptions();
  const { installAssets } = await import("@xmcl/installer");
  const { Version } = await import("@xmcl/core");

  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const purged = await purgeEmptyAssetObjects(gamePath);
    if (purged > 0) {
      opts?.onProgress?.(
        undefined,
        `Removed ${purged} empty asset file(s) before retry…`,
      );
    }
    opts?.onProgress?.(
      undefined,
      attempt === 1
        ? `Downloading Minecraft assets…`
        : `Retrying Minecraft assets (${attempt}/${attempts})…`,
    );
    try {
      const resolved = await Version.parse(gamePath, mcVersion);
      await installAssets(resolved, options);
      return { ok: true };
    } catch (err) {
      if (attempt === attempts) return { ok: false, error: err };
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  return { ok: false };
}

async function fullInstall(
  mcVersion: string,
  opts?: { onProgress?: PrefetchProgress; skipAssets?: boolean },
): Promise<void> {
  const gamePath = embeddedClientDir();
  await purgeEmptyAssetObjects(gamePath);

  try {
    await installCore(mcVersion, opts);
  } catch (err) {
    throw Errors.clientDownloadFailed(mcVersion, err);
  }

  if (!opts?.skipAssets) {
    const assets = await installAssetsBestEffort(mcVersion, opts);
    if (!assets.ok) {
      warn(
        "Minecraft assets download timed out or failed — client may miss textures/sounds.",
      );
      warn(
        "Retry later: plugdev cache prefetch --client --force  (or use Prism launcher)",
      );
      // Persist a marker so we can surface this in doctor without failing run
      try {
        await writeFile(
          join(gamePath, "assets", ".plugdev-assets-incomplete"),
          new Date().toISOString(),
          "utf8",
        );
      } catch {
        // ignore
      }
    } else {
      try {
        await unlink(join(gamePath, "assets", ".plugdev-assets-incomplete"));
      } catch {
        // ignore
      }
    }
  }

  if (!(await isEmbeddedClientReady(mcVersion))) {
    throw Errors.clientDownloadFailed(
      mcVersion,
      new Error("Client still not ready after install"),
    );
  }
}

async function repairInstall(
  mcVersion: string,
  opts?: { onProgress?: PrefetchProgress; skipAssets?: boolean },
): Promise<"repaired" | "full"> {
  const { diagnose, Version } = await import("@xmcl/core");
  const gamePath = embeddedClientDir();
  await purgeEmptyAssetObjects(gamePath);
  const report = await diagnose(mcVersion, gamePath);

  const needsFull = report.issues.some(
    (i) => i.role === "versionJson" || i.role === "minecraftJar",
  );
  if (needsFull || !(await isEmbeddedClientCached(mcVersion))) {
    await fullInstall(mcVersion, opts);
    return "full";
  }

  const libIssues = report.issues.filter((i) => i.role === "library");
  if (libIssues.length === 0) {
    // Try assets if incomplete, but don't fail readiness
    const marker = join(gamePath, "assets", ".plugdev-assets-incomplete");
    try {
      await access(marker, constants.F_OK);
      await installAssetsBestEffort(mcVersion, opts);
    } catch {
      // no marker
    }
    return "repaired";
  }

  opts?.onProgress?.(
    undefined,
    `Repairing ${libIssues.length} Minecraft libraries…`,
  );

  const resolved = await Version.parse(gamePath, mcVersion);
  const options = await installOptions();
  const { installLibraries, installResolvedLibraries } = await import(
    "@xmcl/installer"
  );

  const libs = libIssues
    .map((i) => ("library" in i ? i.library : undefined))
    .filter((l): l is NonNullable<typeof l> => l !== undefined);

  try {
    if (libs.length > 0) {
      await installResolvedLibraries(libs, gamePath, options);
    } else {
      await installLibraries(resolved, options);
    }
  } catch (err) {
    throw Errors.clientDownloadFailed(mcVersion, err);
  }

  if (!(await isEmbeddedClientReady(mcVersion))) {
    await fullInstall(mcVersion, opts);
    return "full";
  }
  return "repaired";
}

/**
 * Ensure the embedded client is launch-ready (integrity-checked).
 * Repairs corrupt/missing libraries when possible; full reinstall when needed.
 * Asset CDN failures are retried then skipped (libs/jar still required).
 */
export async function ensureEmbeddedClient(
  mcVersion: string,
  opts?: {
    force?: boolean;
    skipAssets?: boolean;
    onProgress?: PrefetchProgress;
  },
): Promise<{ cacheHit: boolean; repaired: boolean }> {
  if (!opts?.force && (await isEmbeddedClientReady(mcVersion))) {
    return { cacheHit: true, repaired: false };
  }

  await mkdir(embeddedClientDir(), { recursive: true });

  if (opts?.force || !(await isEmbeddedClientCached(mcVersion))) {
    await fullInstall(mcVersion, opts);
    return { cacheHit: false, repaired: false };
  }

  const result = await repairInstall(mcVersion, opts);
  return { cacheHit: false, repaired: result === "repaired" };
}

/** @deprecated Prefer ensureEmbeddedClient — this only checks JSON existence. */
export async function prefetchEmbeddedClient(
  mcVersion: string,
  opts?: { onProgress?: PrefetchProgress },
): Promise<{ cacheHit: boolean }> {
  const result = await ensureEmbeddedClient(mcVersion, opts);
  return { cacheHit: result.cacheHit };
}
