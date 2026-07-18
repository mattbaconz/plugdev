import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { plugdevHome } from "../paths.js";
import { CLI_VERSION } from "../constants.js";
import { info, success, warn } from "./log.js";
import { isJsonMode } from "./output.js";

const PACKAGE_NAME = "@plugdev/cli";
const REGISTRY_LATEST = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const CHECK_TTL_MS = 24 * 60 * 60 * 1000;

export interface UpdateCheckCache {
  checkedAt: number;
  latest?: string;
  current?: string;
}

export interface UpdateCheckResult {
  current: string;
  latest: string;
  outdated: boolean;
  skipped: boolean;
  reason?: string;
}

function cachePath(): string {
  return join(plugdevHome(), "update-check.json");
}

function globalConfigPath(): string {
  return join(plugdevHome(), "config.yml");
}

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

async function readCache(): Promise<UpdateCheckCache | undefined> {
  try {
    return JSON.parse(await readFile(cachePath(), "utf8")) as UpdateCheckCache;
  } catch {
    return undefined;
  }
}

async function writeCache(cache: UpdateCheckCache): Promise<void> {
  await mkdir(plugdevHome(), { recursive: true });
  await writeFile(cachePath(), JSON.stringify(cache, null, 2), "utf8");
}

/** Read update.auto from project plugdev.yml or ~/.plugdev/config.yml (best-effort). */
export async function readUpdateAuto(cwd?: string): Promise<boolean> {
  const { parse: parseYaml } = await import("yaml");
  const paths = cwd ? [join(cwd, "plugdev.yml"), globalConfigPath()] : [globalConfigPath()];
  for (const path of paths) {
    try {
      const raw = parseYaml(await readFile(path, "utf8")) as {
        update?: { auto?: boolean };
      } | null;
      if (typeof raw?.update?.auto === "boolean") return raw.update.auto;
    } catch {
      // ignore missing / invalid
    }
  }
  return false;
}

export async function fetchLatestVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(REGISTRY_LATEST, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`npm registry HTTP ${res.status}`);
  const body = (await res.json()) as { version?: string };
  if (!body.version) throw new Error("npm registry response missing version");
  return body.version;
}

export async function checkForUpdate(opts?: {
  force?: boolean;
  fetchImpl?: typeof fetch;
  current?: string;
}): Promise<UpdateCheckResult> {
  const current = opts?.current ?? CLI_VERSION;
  if (process.env.PLUGDEV_NO_UPDATE === "1") {
    return { current, latest: current, outdated: false, skipped: true, reason: "PLUGDEV_NO_UPDATE" };
  }

  const cache = await readCache();
  const now = Date.now();
  if (
    !opts?.force &&
    cache?.latest &&
    cache.checkedAt &&
    now - cache.checkedAt < CHECK_TTL_MS
  ) {
    const outdated = compareSemver(cache.latest, current) > 0;
    return {
      current,
      latest: cache.latest,
      outdated,
      skipped: false,
    };
  }

  try {
    const latest = await fetchLatestVersion(opts?.fetchImpl);
    await writeCache({ checkedAt: now, latest, current });
    return {
      current,
      latest,
      outdated: compareSemver(latest, current) > 0,
      skipped: false,
    };
  } catch (err) {
    return {
      current,
      latest: current,
      outdated: false,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export function formatUpdateReminder(result: UpdateCheckResult): string {
  return `Update available: ${result.current} → ${result.latest} — run: plugdev update`;
}

/**
 * Non-blocking update reminder (and optional auto-install) for interactive CLI entrypoints.
 */
export async function maybeNotifyUpdate(cwd?: string): Promise<void> {
  if (isJsonMode()) return;
  const result = await checkForUpdate();
  if (result.skipped || !result.outdated) return;

  info(formatUpdateReminder(result));

  if (await readUpdateAuto(cwd)) {
    info("update.auto is enabled — installing @plugdev/cli@latest…");
    const code = await runNpmGlobalUpdate();
    if (code === 0) {
      success(`Updated to ${result.latest} — restart plugdev to use the new version`);
    } else {
      warn("Auto-update failed — run: plugdev update");
    }
  }
}

export async function runNpmGlobalUpdate(): Promise<number> {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise((resolve) => {
    const child = spawn(npmCmd, ["install", "-g", `${PACKAGE_NAME}@latest`], {
      stdio: "inherit",
      shell: false,
      windowsHide: true,
      detached: false,
    });
    child.on("error", (err) => {
      warn(`npm update failed: ${err.message}`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export async function runUpdateCommand(opts: {
  checkOnly?: boolean;
  cwd?: string;
}): Promise<number> {
  const result = await checkForUpdate({ force: true });
  if (result.skipped && !result.outdated) {
    if (result.reason && result.reason !== "PLUGDEV_NO_UPDATE") {
      warn(`Could not check for updates: ${result.reason}`);
      return 1;
    }
  }

  info(`Installed: ${result.current}`);
  info(`Latest:    ${result.latest}`);

  if (!result.outdated) {
    success("Already up to date");
    return 0;
  }

  if (opts.checkOnly) {
    info(formatUpdateReminder(result));
    return 0;
  }

  info(`Installing ${PACKAGE_NAME}@latest…`);
  const code = await runNpmGlobalUpdate();
  if (code === 0) {
    success(`Updated to ${result.latest} — restart plugdev to use the new version`);
  }
  return code;
}
