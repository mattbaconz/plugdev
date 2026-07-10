import { rm, readdir, stat, unlink, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { plugdevHome, bootstrapCacheDir, depsCacheDir, projectRunDir, serversCacheDir } from "../paths.js";
import { heading, info, success, warn, phase } from "../util/log.js";
import { createDownloadProgress, endDownloadProgress } from "../util/progress.js";
import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { DEP_PRESETS } from "../deps/presets.js";
import { depSearchTerms } from "../deps/hangar.js";
import { ensureServerJar, resolveServerProject, isServerJarCached } from "../cache/server.js";
import {
  embeddedClientDir,
  ensureEmbeddedClient,
  isEmbeddedClientReady,
} from "../client/prefetch.js";

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

export async function runCachePrefetch(opts: {
  version?: string;
  paper?: boolean;
  folia?: boolean;
  client?: boolean;
  force?: boolean;
  cwd?: string;
}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const mcVersion = opts.version ?? config.version;
  const serverProject = opts.folia
    ? "folia"
    : opts.paper
      ? "paper"
      : resolveServerProject(config.server);

  const onProgress = createDownloadProgress(
    opts.client
      ? `Ensuring Minecraft ${mcVersion}…`
      : `Downloading ${serverProject} ${mcVersion}…`,
  );

  if (opts.client) {
    heading(`Prefetch Minecraft client ${mcVersion}\n`);
    try {
      const result = await ensureEmbeddedClient(mcVersion, {
        force: opts.force,
        onProgress: (percent, label) => onProgress(percent, label),
      });
      if (result.cacheHit) {
        success(`Cache hit — Minecraft ${mcVersion} (integrity OK)`);
      } else if (result.repaired) {
        success(`Repaired Minecraft client ${mcVersion}`);
      } else {
        success(`Cached Minecraft client ${mcVersion}`);
      }
    } finally {
      endDownloadProgress();
    }
    info(`Path: ${embeddedClientDir()}`);
    return 0;
  }

  heading(`Prefetch ${serverProject} ${mcVersion}\n`);
  const cached = await isServerJarCached(mcVersion, serverProject);
  let jar: Awaited<ReturnType<typeof ensureServerJar>>;
  try {
    jar = await ensureServerJar(mcVersion, serverProject, {
      onProgress: (percent, label) => onProgress(percent, label),
    });
  } finally {
    endDownloadProgress();
  }
  if (cached) {
    success(`Cache hit — ${serverProject} ${mcVersion}`);
  } else {
    success(`Downloaded ${serverProject} ${mcVersion}`);
  }
  info(`Path: ${join(serversCacheDir(mcVersion, serverProject), jar.jarName)}`);
  return 0;
}

export async function runCacheStatus(): Promise<number> {
  heading("PlugDev Cache\n");
  const home = plugdevHome();
  info(`Home: ${home}`);
  info(`Servers: ${formatBytes(await dirSize(join(home, "servers")))}`);
  info(`Client: ${formatBytes(await dirSize(embeddedClientDir()))}`);
  info(`Bootstrap: ${formatBytes(await dirSize(bootstrapCacheDir()))}`);
  info(`Deps: ${formatBytes(await dirSize(depsCacheDir()))}`);
  return 0;
}

export async function runCacheClear(flags: {
  servers?: boolean;
  deps?: boolean;
  client?: boolean;
  all?: boolean;
}): Promise<number> {
  const home = plugdevHome();
  if (!flags.all && !flags.servers && !flags.deps && !flags.client) {
    warn("Specify what to clear: --servers, --deps, --client, or --all");
    info("Example: plugdev cache clear --client");
    return 1;
  }
  if (flags.all || flags.servers) {
    await rm(join(home, "servers"), { recursive: true, force: true });
    success("Cleared server cache");
  }
  if (flags.all || flags.deps) {
    await rm(depsCacheDir(), { recursive: true, force: true });
    success("Cleared deps cache");
  }
  if (flags.all || flags.client) {
    await rm(embeddedClientDir(), { recursive: true, force: true });
    success("Cleared embedded Minecraft client cache");
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
  opts: { version?: string; source?: string; url?: string } = {},
): Promise<number> {
  const { downloadHangarPlugin, downloadUrlPlugin, resolveHangarDep } = await import(
    "../deps/hangar.js"
  );
  const { downloadModrinthPlugin } = await import("../deps/modrinth.js");
  const { hangarPlatform } = await import("../deps/presets.js");

  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const source = opts.source ?? "hangar";
  const pluginsDir = join(projectRunDir(cwd), "plugins");
  await mkdir(pluginsDir, { recursive: true });

  let jar: string;
  let label: string;

  if (source === "modrinth") {
    jar = await downloadModrinthPlugin(name, config.version, opts.version, config.server);
    label = `modrinth:${name}`;
  } else if (source === "url") {
    if (!opts.url) {
      warn("URL source requires --url <https://...>");
      return 1;
    }
    jar = await downloadUrlPlugin(opts.url, name);
    label = name;
  } else {
    const platform = hangarPlatform(config.server);
    const resolved = await resolveHangarDep(name, opts.version);
    jar = await downloadHangarPlugin(
      resolved.author,
      resolved.slug,
      resolved.version,
      platform,
    );
    label = `${resolved.author}/${resolved.slug}@${resolved.version}`;
  }

  await copyFile(jar, join(pluginsDir, jar.split(/[/\\]/).pop()!));
  success(`Installed ${label}`);

  const { appendDepToYml } = await import("../deps/config-write.js");
  const entry =
    source === "url"
      ? { name, source: "url" as const, url: opts.url }
      : source === "modrinth"
        ? { name, source: "modrinth" as const, slug: name, version: opts.version }
        : {
            name,
            source: "hangar" as const,
            version: opts.version,
          };
  const wrote = await appendDepToYml(cwd, entry);
  if (wrote) {
    info("Added to plugdev.yml deps");
  }

  return 0;
}

export async function runDepsRemove(cwd: string, name: string): Promise<number> {
  const pluginsDir = join(projectRunDir(cwd), "plugins");
  const terms = depSearchTerms(name);

  let files: string[];
  try {
    files = await readdir(pluginsDir);
  } catch {
    warn(`Plugins directory not found: ${pluginsDir}`);
    return 1;
  }

  const matches = files.filter((file) => {
    const lower = file.toLowerCase();
    return terms.some((term) => lower.includes(term));
  });

  if (matches.length === 0) {
    warn(`No plugin JAR matching "${name}" in ${pluginsDir}`);
    return 1;
  }

  for (const file of matches) {
    await unlink(join(pluginsDir, file));
    success(`Removed ${file}`);
  }

  return 0;
}

export async function runDepsList(): Promise<number> {
  heading("Dependency presets\n");
  for (const preset of DEP_PRESETS) {
    info(`${preset.aliases[0].padEnd(16)} ${preset.description}`);
    info(`                 Hangar: ${preset.author}/${preset.slug}`);
  }
  info("\nUsage:");
  info("  plugdev deps add <name> [--version]");
  info("  plugdev deps add <modrinth-slug> --source modrinth");
  info("  plugdev deps add myplugin --source url --url https://...");
  info("  plugdev deps remove <name>");
  return 0;
}
