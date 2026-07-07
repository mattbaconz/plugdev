import { homedir } from "node:os";
import { join } from "node:path";

export function plugdevHome(): string {
  return process.env.PLUGDEV_HOME ?? join(homedir(), ".plugdev");
}

export function serversCacheDir(mcVersion: string): string {
  return join(plugdevHome(), "servers", `paper-${mcVersion}`);
}

export function bootstrapCacheDir(): string {
  return join(plugdevHome(), "bootstrap");
}

export function depsCacheDir(): string {
  return join(plugdevHome(), "deps");
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
