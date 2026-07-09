import { rm, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { projectRunDir } from "../paths.js";
import { readSession, isProcessRunning } from "../session.js";
import { isPortAvailable } from "../util/port.js";
import { info, success, warn } from "../util/log.js";

export type RunCleanupMode = "never" | "on-exit" | "worlds";

const WORLD_DIRS = ["world", "world_nether", "world_the_end"] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** True if a PlugDev headless session or something is bound to the game port. */
export async function isDevServerBusy(
  cwd: string,
  port = 25565,
): Promise<boolean> {
  const session = await readSession(cwd);
  if (session?.pid && isProcessRunning(session.pid)) {
    return true;
  }
  const free = await isPortAvailable(port);
  return !free;
}

export async function wipeWorldDirs(runDir: string): Promise<string[]> {
  const removed: string[] = [];
  for (const name of WORLD_DIRS) {
    const p = join(runDir, name);
    if (await exists(p)) {
      await rm(p, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}

export async function wipeRunDir(cwd: string): Promise<boolean> {
  const runDir = projectRunDir(cwd);
  if (!(await exists(runDir))) return false;
  await rm(runDir, { recursive: true, force: true });
  return true;
}

/** Apply cleanup after the Paper process exits (Ctrl+C / stop). */
export async function applyExitCleanup(
  cwd: string,
  mode: RunCleanupMode,
): Promise<void> {
  if (mode === "never") return;

  const runDir = projectRunDir(cwd);
  if (!(await exists(runDir))) return;

  if (mode === "on-exit") {
    await rm(runDir, { recursive: true, force: true });
    info("Cleaned .plugdev/run (run.cleanup: on-exit)");
    return;
  }

  if (mode === "worlds") {
    const removed = await wipeWorldDirs(runDir);
    if (removed.length > 0) {
      info(`Cleaned worlds: ${removed.join(", ")} (run.cleanup: worlds)`);
    }
  }
}

/** Wipe worlds before boot when run.cleanup is worlds (fresh platform each run). */
export async function applyStartWorldCleanup(
  cwd: string,
  mode: RunCleanupMode,
): Promise<void> {
  if (mode !== "worlds") return;
  const runDir = projectRunDir(cwd);
  if (!(await exists(runDir))) return;
  const removed = await wipeWorldDirs(runDir);
  if (removed.length > 0) {
    info(`Fresh worlds: wiped ${removed.join(", ")}`);
  }
}

export async function runClean(
  cwd: string,
  opts: {
    worlds?: boolean;
    all?: boolean;
    force?: boolean;
    port?: number;
  } = {},
): Promise<number> {
  const port = opts.port ?? 25565;
  const busy = await isDevServerBusy(cwd, port);
  if (busy && !opts.force) {
    warn("Dev server looks busy (session or port in use).");
    info("Stop it first (Ctrl+C / plugdev server stop), or pass --force");
    return 1;
  }

  if (opts.all) {
    const wiped = await wipeRunDir(cwd);
    if (wiped) success("Removed .plugdev/run");
    else info("Nothing to clean — .plugdev/run missing");
    return 0;
  }

  // Default and --worlds: wipe world folders only
  const runDir = projectRunDir(cwd);
  if (!(await exists(runDir))) {
    info("Nothing to clean — .plugdev/run missing");
    return 0;
  }
  const removed = await wipeWorldDirs(runDir);
  if (removed.length === 0) {
    info("No world folders to remove");
  } else {
    success(`Removed: ${removed.join(", ")}`);
  }
  return 0;
}
