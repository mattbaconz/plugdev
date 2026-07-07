import { rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { plugdevHome, serversCacheDir, bootstrapCacheDir, depsCacheDir } from "../paths.js";
import { heading, info, success } from "../util/log.js";

async function dirSize(path: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(path, { withFileTypes: true });
    for (const e of entries) {
      const p = join(path, e.name);
      if (e.isDirectory()) total += await dirSize(p);
      else total += (await stat(p)).size;
    }
  } catch {
    // ignore
  }
  return total;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function runCacheStatus(): Promise<number> {
  heading("PlugDev Cache\n");
  const home = plugdevHome();
  info(`Home: ${home}`);
  info(`Servers: ${formatBytes(await dirSize(join(home, "servers")))}`);
  info(`Bootstrap: ${formatBytes(await dirSize(bootstrapCacheDir()))}`);
  info(`Deps: ${formatBytes(await dirSize(depsCacheDir()))}`);
  return 0;
}

export async function runCacheClear(flags: {
  servers?: boolean;
  deps?: boolean;
  all?: boolean;
}): Promise<number> {
  const home = plugdevHome();
  if (flags.all || flags.servers || (!flags.servers && !flags.deps)) {
    await rm(join(home, "servers"), { recursive: true, force: true });
    success("Cleared server cache");
  }
  if (flags.all || flags.deps) {
    await rm(depsCacheDir(), { recursive: true, force: true });
    success("Cleared deps cache");
  }
  if (flags.all) {
    await rm(bootstrapCacheDir(), { recursive: true, force: true });
    success("Cleared bootstrap cache");
  }
  return 0;
}

export async function runDepsAdd(
  cwd: string,
  name: string,
  version?: string,
): Promise<number> {
  const { resolveHangarDep, downloadHangarPlugin } = await import("../deps/hangar.js");
  const { projectRunDir } = await import("../paths.js");
  const { copyFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const resolved = await resolveHangarDep(name, version);
  const jar = await downloadHangarPlugin(resolved.author, resolved.slug, resolved.version);
  const pluginsDir = join(projectRunDir(cwd), "plugins");
  await mkdir(pluginsDir, { recursive: true });
  await copyFile(jar, join(pluginsDir, jar.split(/[/\\]/).pop()!));
  success(`Installed ${resolved.author}/${resolved.slug}@${resolved.version}`);
  return 0;
}
