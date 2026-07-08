import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectRunDir } from "../paths.js";
import { phase, success } from "./log.js";
import { isJsonMode } from "./output.js";

const RELOAD_PATTERNS = [
  /reload/i,
  /PlugDev/i,
  /ReloadWatcher/i,
  /reloaded/i,
];

function logMatchesReload(text: string): boolean {
  return RELOAD_PATTERNS.some((p) => p.test(text));
}

export async function confirmReload(cwd: string, timeoutMs = 10_000): Promise<boolean> {
  const logPath = join(projectRunDir(cwd), "logs", "latest.log");
  if (!isJsonMode()) phase("Reloading plugin…", "active");

  const start = Date.now();
  let lastSize = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      const content = await readFile(logPath, "utf8");
      if (content.length > lastSize) {
        lastSize = content.length;
        const tail = content.slice(-4000);
        if (logMatchesReload(tail)) {
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
