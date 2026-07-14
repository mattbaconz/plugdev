import { rm, readdir, stat, unlink, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { plugdevHome, bootstrapCacheDir, depsCacheDir, projectRunDir, serversCacheDir } from "../paths.js";
import { heading, info, success, warn, phase } from "../util/log.js";
import { createDownloadProgress, endDownloadProgress } from "../util/progress.js";
import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { DEP_PRESETS } from "../deps/presets.js";
import { depSearchTerms } from "../deps/hangar.js";
import { ensureServerJar, resolveServerProject, isServerJarCached } from "../cache/server.js";
import {
  embeddedClientDir,
  ensureEmbeddedClient,
  isEmbeddedClientReady,
} from "../client/prefetch.js";
import { isJsonMode, emitJson } from "../util/output.js";
import { readPlugdevYml } from "../deps/config-write.js";

async function dirSize(path: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(path, { withFileTypes: true });
    for (const e of entries) {
      const p = join(path, e.name);
      if (e.isDirectory()) total += await dirSize(p);
      else total += (await stat(p)).size;
    }
  } catch {
    // ignore
  }
  return total;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function runCachePrefetch(opts: {
  version?: string;
  paper?: boolean;
  folia?: boolean;
  client?: boolean;
  force?: boolean;
  skipAssets?: boolean;
  cwd?: string;
}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const mcVersion = opts.version ?? config.version;
  const serverProject = opts.folia
    ? "folia"
    : opts.paper
      ? "paper"
      : resolveServerProject(config.server);

  // --client alone → client only. --client with --paper/--folia → both.
  // No --client → server (default / --paper / --folia).
  const wantClient = Boolean(opts.client);
  const wantServer = !wantClient || Boolean(opts.paper) || Boolean(opts.folia);

  const prefetchClient = async () => {
    const onProgress = createDownloadProgress(`Ensuring Minecraft ${mcVersion}…`);
    heading(`Prefetch Minecraft client ${mcVersion}\n`);
    try {
      const result = await ensureEmbeddedClient(mcVersion, {
        force: opts.force,
        skipAssets: opts.skipAssets,
        onProgress: (percent, label) => onProgress(percent, label),
      });
      if (result.cacheHit) {
        success(`Cache hit — Minecraft ${mcVersion} (integrity OK)`);
      } else if (result.repaired) {
        success(`Repaired Minecraft client ${mcVersion}`);
      } else {
        success(`Cached Minecraft client ${mcVersion}`);
      }
    } finally {
      endDownloadProgress();
    }
    info(`Path: ${embeddedClientDir()}`);
  };

  const prefetchServer = async () => {
    const onProgress = createDownloadProgress(
      `Downloading ${serverProject} ${mcVersion}…`,
    );
    heading(`Prefetch ${serverProject} ${mcVersion}\n`);
    const cached = await isServerJarCached(mcVersion, serverProject);
    let jar: Awaited<ReturnType<typeof ensureServerJar>>;
    try {
      jar = await ensureServerJar(mcVersion, serverProject, {
        onProgress: (percent, label) => onProgress(percent, label),
      });
    } finally {
      endDownloadProgress();
    }
    if (cached) {
      success(`Cache hit — ${serverProject} ${mcVersion}`);
    } else {
      success(`Downloaded ${serverProject} ${mcVersion}`);
    }
    info(`Path: ${join(serversCacheDir(mcVersion, serverProject), jar.jarName)}`);
  };

  if (wantClient && wantServer) {
    await Promise.all([prefetchClient(), prefetchServer()]);
  } else if (wantClient) {
    await prefetchClient();
  } else if (wantServer) {
    await prefetchServer();
  }

  if (isJsonMode()) {
    emitJson({
      ok: true,
      data: {
        version: mcVersion,
        server: wantServer ? serverProject : undefined,
        client: wantClient,
      },
    });
  }
  return 0;
}

export async function runCacheStatus(): Promise<number> {
  const home = plugdevHome();
  const sizes = {
    home,
    servers: await dirSize(join(home, "servers")),
    client: await dirSize(embeddedClientDir()),
    bootstrap: await dirSize(bootstrapCacheDir()),
    deps: await dirSize(depsCacheDir()),
  };
  if (isJsonMode()) {
    emitJson({
      ok: true,
      data: {
        ...sizes,
        serversFormatted: formatBytes(sizes.servers),
        clientFormatted: formatBytes(sizes.client),
        bootstrapFormatted: formatBytes(sizes.bootstrap),
        depsFormatted: formatBytes(sizes.deps),
      },
    });
    return 0;
  }
  heading("PlugDev Cache\n");
  info(`Home: ${home}`);
  info(`Servers: ${formatBytes(sizes.servers)}`);
  info(`Client: ${formatBytes(sizes.client)}`);
  info(`Bootstrap: ${formatBytes(sizes.bootstrap)}`);
  info(`Deps: ${formatBytes(sizes.deps)}`);
  return 0;
}

export async function runCacheClear(flags: {
  servers?: boolean;
  deps?: boolean;
  client?: boolean;
  all?: boolean;
}): Promise<number> {
  const home = plugdevHome();
  if (!flags.all && !flags.servers && !flags.deps && !flags.client) {
    warn("Specify what to clear: --servers, --deps, --client, or --all");
    info("Example: plugdev cache clear --client");
    return 1;
  }
  if (flags.all || flags.servers) {
    await rm(join(home, "servers"), { recursive: true, force: true });
    success("Cleared server cache");
  }
  if (flags.all || flags.deps) {
    await rm(depsCacheDir(), { recursive: true, force: true });
    success("Cleared deps cache");
  }
  if (flags.all || flags.client) {
    await rm(embeddedClientDir(), { recursive: true, force: true });
    success("Cleared embedded Minecraft client cache");
  }
  if (flags.all) {
    await rm(bootstrapCacheDir(), { recursive: true, force: true });
    success("Cleared bootstrap cache");
  }
  return 0;
}

export async function runDepsAdd(
  cwd: string,
  name: string,
  opts: { version?: string; source?: string; url?: string } = {},
): Promise<number> {
  const lower = name.toLowerCase().replace(/\s+/g, "");
  if (lower === "plugtrace" || lower === "plug-trace") {
    const { updatePlugdevYml } = await import("../deps/config-write.js");
    const { plugTraceBuildHint } = await import("../deps/plugtrace.js");
    const result = await updatePlugdevYml(cwd, {
      integrations: {
        plugtrace: {
          enabled: true,
          artifact: "auto",
        },
      },
    });
    if (!result.ok) {
      warn(result.reason);
      return 1;
    }
    success("Enabled integrations.plugtrace in plugdev.yml");
    info(plugTraceBuildHint());
    info("Set integrations.plugtrace.jar to your built PlugTrace fat JAR, then run plugdev run / sync.");
    return 0;
  }

  const { downloadHangarPlugin, downloadUrlPlugin, resolveHangarDep } = await import(
    "../deps/hangar.js"
  );
  const { downloadModrinthPlugin } = await import("../deps/modrinth.js");
  const { hangarPlatform } = await import("../deps/presets.js");

  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const { findPreset } = await import("../deps/presets.js");
  const preset = findPreset(name);
  const source =
    opts.source ??
    (preset?.source === "modrinth" || (!preset?.author && preset?.modrinthSlug)
      ? "modrinth"
      : "hangar");
  const pluginsDir = join(projectRunDir(cwd), "plugins");
  await mkdir(pluginsDir, { recursive: true });

  let jar: string;
  let label: string;

  if (source === "modrinth") {
    const modrinthSlug = preset?.modrinthSlug ?? name;
    jar = await downloadModrinthPlugin(modrinthSlug, config.version, opts.version, config.server);
    label = `modrinth:${modrinthSlug}`;
  } else if (source === "url") {
    if (!opts.url) {
      warn("URL source requires --url <https://...>");
      return 1;
    }
    jar = await downloadUrlPlugin(opts.url, name);
    label = name;
  } else {
    const platform = hangarPlatform(config.server);
    const resolved = await resolveHangarDep(name, opts.version);
    jar = await downloadHangarPlugin(
      resolved.author,
      resolved.slug,
      resolved.version,
      platform,
    );
    label = `${resolved.author}/${resolved.slug}@${resolved.version}`;
  }

  await copyFile(jar, join(pluginsDir, jar.split(/[/\\]/).pop()!));
  success(`Installed ${label}`);

  const { appendDepToYml } = await import("../deps/config-write.js");
  const entry =
    source === "url"
      ? { name, source: "url" as const, url: opts.url }
      : source === "modrinth"
        ? {
            name,
            source: "modrinth" as const,
            slug: preset?.modrinthSlug ?? name,
            version: opts.version,
          }
        : {
            name,
            source: "hangar" as const,
            version: opts.version,
            author: preset?.author,
            slug: preset?.slug,
          };
  const wrote = await appendDepToYml(cwd, entry);
  if (wrote) {
    info("Added to plugdev.yml deps");
  }

  if (isJsonMode()) {
    emitJson({
      ok: true,
      data: { name, source, label, wroteToYml: wrote, entry },
    });
  }
  return 0;
}

export async function runDepsRemove(cwd: string, name: string): Promise<number> {
  const pluginsDir = join(projectRunDir(cwd), "plugins");
  const terms = depSearchTerms(name);

  let files: string[] = [];
  try {
    files = await readdir(pluginsDir);
  } catch {
    // plugins dir may not exist yet
  }

  const matches = files.filter((file) => {
    const lower = file.toLowerCase();
    return terms.some((term) => lower.includes(term));
  });

  for (const file of matches) {
    await unlink(join(pluginsDir, file));
    success(`Removed ${file}`);
  }

  const { removeDepFromYml } = await import("../deps/config-write.js");
  const removed = await removeDepFromYml(cwd, name);
  if (removed) info("Removed from plugdev.yml deps");

  if (matches.length === 0 && !removed) {
    if (isJsonMode()) {
      emitJson({ ok: false, error: `No dep matching "${name}"` });
    } else {
      warn(`No plugin JAR or plugdev.yml dep matching "${name}"`);
    }
    return 1;
  }

  if (isJsonMode()) {
    emitJson({
      ok: true,
      data: { name, removedJars: matches, removedFromYml: removed },
    });
  }
  return 0;
}

export async function runDepsList(cwd = process.cwd()): Promise<number> {
  const loaded = await readPlugdevYml(cwd);
  const configured = loaded?.raw.deps ?? [];
  const presets = DEP_PRESETS.map((p) => ({
    alias: p.aliases[0],
    slug: p.slug,
    author: p.author,
    source: p.source ?? (p.author ? "hangar" : "modrinth"),
    modrinthSlug: p.modrinthSlug,
    description: p.description,
  }));

  if (isJsonMode()) {
    emitJson({
      ok: true,
      data: { configured, presets },
    });
    return 0;
  }

  heading("Dependency presets\n");
  for (const preset of DEP_PRESETS) {
    info(`${preset.aliases[0]!.padEnd(16)} ${preset.description}`);
    if (preset.source === "modrinth" || (!preset.author && preset.modrinthSlug)) {
      info(`                 Modrinth: ${preset.modrinthSlug ?? preset.slug}`);
    } else {
      info(`                 Hangar: ${preset.author}/${preset.slug}`);
    }
  }
  if (configured.length > 0) {
    heading("\nConfigured in plugdev.yml\n");
    for (const d of configured) {
      const on = d.enabled === false ? "off" : "on";
      info(`[${on}] ${d.name}${d.slug ? ` (${d.slug})` : ""}`);
    }
  }
  info("\nUsage:");
  info("  plugdev deps add <name> [--version]");
  info("  plugdev deps add <modrinth-slug> --source modrinth");
  info("  plugdev deps add myplugin --source url --url https://...");
  info("  plugdev deps remove <name>");
  return 0;
}
