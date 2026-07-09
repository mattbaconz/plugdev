import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import type { DetectedLauncher } from "./detect.js";
import { readInstanceMcVersion } from "./detect.js";

export interface ListedInstance {
  id: string;
  name: string;
  mcVersion?: string;
  lastLaunchTime: number;
  totalTimePlayed: number;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseCfg(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export async function listLauncherInstances(
  launcher: DetectedLauncher,
): Promise<ListedInstance[]> {
  const instancesDir = join(launcher.dataDir, "instances");
  if (!(await exists(instancesDir))) return [];

  const entries = await readdir(instancesDir, { withFileTypes: true });
  const results: ListedInstance[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const id = entry.name;
    const cfgPath = join(instancesDir, id, "instance.cfg");
    let name = id;
    let lastLaunchTime = 0;
    let totalTimePlayed = 0;

    try {
      const cfg = parseCfg(await readFile(cfgPath, "utf8"));
      name = cfg.name || id;
      lastLaunchTime = Number(cfg.lastLaunchTime || 0) || 0;
      totalTimePlayed = Number(cfg.totalTimePlayed || 0) || 0;
    } catch {
      // missing cfg — still list folder
    }

    const mcVersion = await readInstanceMcVersion(launcher, id);
    results.push({ id, name, mcVersion, lastLaunchTime, totalTimePlayed });
  }

  results.sort((a, b) => b.lastLaunchTime - a.lastLaunchTime);
  return results;
}

/** Prefer most recently launched instance; fall back to most playtime. */
export async function findRecentlyPlayedInstance(
  launcher: DetectedLauncher,
): Promise<ListedInstance | undefined> {
  const list = await listLauncherInstances(launcher);
  if (list.length === 0) return undefined;
  const withLaunch = list.filter((i) => i.lastLaunchTime > 0);
  if (withLaunch.length > 0) return withLaunch[0];
  const byPlay = [...list].sort((a, b) => b.totalTimePlayed - a.totalTimePlayed);
  return byPlay[0];
}
