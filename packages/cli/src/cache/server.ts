import { ensurePaperJar, type PaperBuild } from "./fill.js";
import { ensurePurpurJar } from "./purpur.js";
import { ensurePufferfishJar } from "./pufferfish.js";
import { ensureSpigotJar } from "./spigot.js";

export type ServerProject = "paper" | "folia" | "purpur" | "pufferfish" | "spigot";

export async function ensureServerJar(
  mcVersion: string,
  project: ServerProject,
): Promise<PaperBuild> {
  if (project === "purpur") return ensurePurpurJar(mcVersion);
  if (project === "pufferfish") return ensurePufferfishJar(mcVersion);
  if (project === "spigot") return ensureSpigotJar(mcVersion);
  return ensurePaperJar(mcVersion, project);
}

export function resolveServerProject(server: string): ServerProject {
  if (server === "folia") return "folia";
  if (server === "purpur") return "purpur";
  if (server === "pufferfish") return "pufferfish";
  if (server === "spigot") return "spigot";
  return "paper";
}
