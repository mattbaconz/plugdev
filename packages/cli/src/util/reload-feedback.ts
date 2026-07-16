import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { projectRunDir } from "../paths.js";
import { phase, success } from "./log.js";
import { isJsonMode } from "./output.js";

/** Prefer stable bootstrap markers; fall back to broader PlugDev reload lines. */
const RELOAD_PATTERNS = [
  /\[PlugDev\] Loaded dev plugin:/i,
  /\[PlugDev\] Reload complete/i,
  /\[PlugDev\] Auto-reloaded dev plugin/i,
  /Loaded dev plugin:/i,
  /Auto-reloaded dev plugin/i,
];

function logMatchesReload(text: string): boolean {
  return RELOAD_PATTERNS.some((p) => p.test(text));
}

export async function captureReloadLogOffset(cwd: string): Promise<number> {
  const logPath = join(projectRunDir(cwd), "logs", "latest.log");
  try {
    return (await stat(logPath)).size;
  } catch {
    return 0;
  }
}

export async function confirmReload(
  cwd: string,
  timeoutMs = 10_000,
  fromOffset = 0,
): Promise<boolean> {
  const logPath = join(projectRunDir(cwd), "logs", "latest.log");
  if (!isJsonMode()) phase("Reloading plugin…", "active");

  const start = Date.now();
  let lastSize = fromOffset;

  while (Date.now() - start < timeoutMs) {
    try {
      const content = await readFile(logPath, "utf8");
      if (content.length < lastSize) lastSize = 0;
      if (content.length > lastSize) {
        const appended = content.slice(lastSize);
        lastSize = content.length;
        if (logMatchesReload(appended)) {
          if (!isJsonMode()) {
            phase("Reload complete");
          } else {
            success("Reload complete");
          }
          return true;
        }
      }
    } catch {
      // log not created yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  if (!isJsonMode()) {
    phase("Reload triggered (check server if plugin did not update)");
  }
  return false;
}
