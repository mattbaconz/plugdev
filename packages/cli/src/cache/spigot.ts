import { access } from "node:fs/promises";
import { join } from "node:path";
import { serversCacheDir } from "../paths.js";
import { Errors } from "../util/errors.js";
import type { PaperBuild } from "./fill.js";

/**
 * Spigot has no official download API. PlugDev expects a pre-built jar cached
 * at ~/.plugdev/servers/spigot-{version}/spigot-{version}.jar
 * (produce via BuildTools or copy manually).
 */
export async function ensureSpigotJar(mcVersion: string): Promise<PaperBuild> {
  const dir = serversCacheDir(mcVersion, "spigot");
  const jarName = `spigot-${mcVersion}.jar`;
  const jarPath = join(dir, jarName);

  try {
    await access(jarPath);
    return {
      id: 0,
      channel: "STABLE",
      jarPath,
      jarName,
      sha256: "",
      cacheHit: true,
    };
  } catch {
    throw Errors.downloadFailed(
      `Spigot jar not found at ${jarPath}. ` +
        `Run BuildTools for ${mcVersion} and copy spigot-${mcVersion}.jar there, ` +
        `or use Paper/Purpur/Pufferfish instead.`,
    );
  }
}
