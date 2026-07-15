import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { readPluginNameFromJar } from "./jars.js";

export { readPluginNameFromJar } from "./jars.js";

const BOOTSTRAP_JAR = "plugdev-bootstrap-paper.jar";

export function jarMatchesPluginName(fileName: string, pluginName: string): boolean {
  if (!pluginName) return false;
  if (!fileName.toLowerCase().endsWith(".jar")) return false;
  if (fileName === BOOTSTRAP_JAR) return false;
  const lower = fileName.toLowerCase();
  const base = pluginName.toLowerCase();
  if (lower === `${base}.jar`) return true;
  if (lower.startsWith(`${base}-`)) return true;
  return false;
}

/**
 * Delete other JARs in pluginsDir that belong to the same plugin
 * (versioned builds, previous -reload-* copies, and module-*-shaded siblings).
 */
export async function pruneStalePluginJars(
  pluginsDir: string,
  pluginName: string,
  keepFileName?: string,
): Promise<string[]> {
  if (!pluginName) return [];
  let entries: string[];
  try {
    entries = await readdir(pluginsDir);
  } catch {
    return [];
  }

  const removed: string[] = [];
  for (const name of entries) {
    if (keepFileName && name === keepFileName) continue;
    if (!jarMatchesPluginName(name, pluginName)) {
      // Filename didn't match — check embedded plugin.yml for same name
      if (!name.toLowerCase().endsWith(".jar") || name === BOOTSTRAP_JAR) continue;
      const fromMeta = await readPluginNameFromJar(join(pluginsDir, name));
      if (!fromMeta || fromMeta.toLowerCase() !== pluginName.toLowerCase()) continue;
    }
    const path = join(pluginsDir, name);
    try {
      await rm(path, { force: true });
      removed.push(name);
    } catch {
      // Windows may lock the currently loaded JAR; skip and retry next deploy
    }
  }
  return removed;
}

export async function deployPluginJar(
  jarPath: string,
  pluginsDir: string,
  devPluginName?: string,
  forReload = false,
): Promise<string> {
  await mkdir(pluginsDir, { recursive: true });
  const pluginName =
    (devPluginName && devPluginName.trim()) ||
    (await readPluginNameFromJar(jarPath)) ||
    "";

  const baseName = basename(jarPath);
  const destName = forReload
    ? baseName.replace(/\.jar$/i, `-reload-${Date.now()}.jar`)
    : baseName;
  const dest = join(pluginsDir, destName);

  if (pluginName) {
    await pruneStalePluginJars(pluginsDir, pluginName, destName);
  }

  await copyFile(jarPath, dest);
  return dest;
}

/** Test helper: write a minimal JAR (ZIP) containing plugin.yml. */
export async function writeMinimalPluginJar(
  jarPath: string,
  pluginName: string,
): Promise<void> {
  const yml = Buffer.from(`name: ${pluginName}\nversion: 1.0.0\nmain: x.Y\n`, "utf8");
  const entryName = Buffer.from("plugin.yml", "utf8");
  // Local file header + data (stored) + central directory + EOCD
  const local = Buffer.alloc(30 + entryName.length + yml.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(0, 8); // stored
  local.writeUInt16LE(0, 10); // time
  local.writeUInt16LE(0, 12); // date
  local.writeUInt32LE(0, 14); // crc (0 ok for our reader)
  local.writeUInt32LE(yml.length, 18);
  local.writeUInt32LE(yml.length, 22);
  local.writeUInt16LE(entryName.length, 26);
  local.writeUInt16LE(0, 28);
  entryName.copy(local, 30);
  yml.copy(local, 30 + entryName.length);

  const central = Buffer.alloc(46 + entryName.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(yml.length, 20);
  central.writeUInt32LE(yml.length, 24);
  central.writeUInt16LE(entryName.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42); // relative offset of local header
  entryName.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  eocd.writeUInt16LE(0, 20);

  await writeFile(jarPath, Buffer.concat([local, central, eocd]));
}
