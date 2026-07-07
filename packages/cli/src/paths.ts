import { homedir } from "node:os";
import { join } from "node:path";

export function plugdevHome(): string {
  return process.env.PLUGDEV_HOME ?? join(homedir(), ".plugdev");
}

export function serversCacheDir(
  mcVersion: string,
  project: "paper" | "folia" | "purpur" | "pufferfish" | "spigot" = "paper",
): string {
  return join(plugdevHome(), "servers", `${project}-${mcVersion}`);
}

export function bootstrapCacheDir(): string {
  return join(plugdevHome(), "bootstrap");
}

export function depsCacheDir(): string {
  return join(plugdevHome(), "deps");
}

export function clientManifestPath(): string {
  return join(plugdevHome(), "client", "manifest.json");
}

export function velocityCacheDir(velocityVersion: string): string {
  return join(plugdevHome(), "servers", `velocity-${velocityVersion}`);
}

export function worldsCacheDir(name: string): string {
  return join(plugdevHome(), "worlds", name);
}

export function templatesCacheDir(name: string): string {
  return join(plugdevHome(), "templates", name);
}

export function networkRunDir(cwd: string): string {
  return join(cwd, ".plugdev", "network");
}

export function projectRunDir(cwd: string): string {
  return join(cwd, ".plugdev", "run");
}

export function reloadTriggerPath(cwd: string): string {
  return join(projectRunDir(cwd), ".reload-trigger");
}

export function reloadListPath(cwd: string): string {
  return join(projectRunDir(cwd), "reload.list");
}
