import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ensurePaperJar, isPaperJarCached, type PaperBuild, type EnsurePaperJarOptions } from "./fill.js";
import { ensurePurpurJar } from "./purpur.js";
import { ensurePufferfishJar } from "./pufferfish.js";
import { ensureSpigotJar } from "./spigot.js";
import { serversCacheDir } from "../paths.js";

export type ServerProject = "paper" | "folia" | "purpur" | "pufferfish" | "spigot";

export type { EnsurePaperJarOptions };

export async function isServerJarCached(
  mcVersion: string,
  project: ServerProject,
): Promise<boolean> {
  if (project === "paper" || project === "folia") {
    return isPaperJarCached(mcVersion, project);
  }

  if (project === "spigot") {
    try {
      await access(join(serversCacheDir(mcVersion, "spigot"), `spigot-${mcVersion}.jar`));
      return true;
    } catch {
      return false;
    }
  }

  try {
    const dir = serversCacheDir(mcVersion, project);
    const files = await readdir(dir);
    return files.some((f) => f.endsWith(".jar"));
  } catch {
    return false;
  }
}

export async function ensureServerJar(
  mcVersion: string,
  project: ServerProject,
  options?: EnsurePaperJarOptions,
): Promise<PaperBuild> {
  if (project === "purpur") return ensurePurpurJar(mcVersion);
  if (project === "pufferfish") return ensurePufferfishJar(mcVersion);
  if (project === "spigot") return ensureSpigotJar(mcVersion);
  return ensurePaperJar(mcVersion, project, options);
}

export function resolveServerProject(server: string): ServerProject {
  if (server === "folia") return "folia";
  if (server === "purpur") return "purpur";
  if (server === "pufferfish") return "pufferfish";
  if (server === "spigot") return "spigot";
  return "paper";
}
