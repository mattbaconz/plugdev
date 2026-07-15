import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PLUGDEV_DEV_JSON = "plugdev-dev.json";

export interface DevRunConfig {
  /** When true, bootstrap auto-OPs players on join. */
  op: boolean;
}

/** Serialize CLI → bootstrap run-dir config (`plugdev-dev.json`). */
export function buildDevRunConfig(opEnabled: boolean): DevRunConfig {
  return { op: opEnabled };
}

export async function writeDevRunConfig(
  runDir: string,
  opEnabled: boolean,
): Promise<string> {
  const path = join(runDir, PLUGDEV_DEV_JSON);
  await writeFile(path, JSON.stringify(buildDevRunConfig(opEnabled), null, 2) + "\n");
  return path;
}
