import { mkdir, writeFile, access, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { HANGAR_API_BASE, USER_AGENT } from "../constants.js";
import { depsCacheDir } from "../paths.js";
import { info, success } from "../util/log.js";
import { DEP_ALIASES, hangarPlatform } from "./presets.js";
import { downloadModrinthPlugin } from "./modrinth.js";

interface HangarVersion {
  name: string;
}

export async function resolveHangarDep(
  name: string,
  version?: string,
  explicit?: { author?: string; slug?: string },
): Promise<{ author: string; slug: string; version: string; fileName: string }> {
  const key = name.toLowerCase().replace(/\s+/g, "");
  const alias =
    explicit?.author && explicit?.slug
      ? { author: explicit.author, slug: explicit.slug }
      : DEP_ALIASES[key];

  if (!alias) {
    throw new Error(
      `Unknown dep alias "${name}". Run plugdev deps list or use author/slug in plugdev.yml.`,
    );
  }

  let resolvedVersion = version;
  if (!resolvedVersion) {
    const latestRes = await fetch(
      `${HANGAR_API_BASE}/projects/${alias.author}/${alias.slug}/latest`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    if (!latestRes.ok) throw new Error(`Hangar latest lookup failed for ${name}`);
    const latest = (await latestRes.json()) as HangarVersion;
    resolvedVersion = latest.name;
  }

  return {
    author: alias.author,
    slug: alias.slug,
    version: resolvedVersion,
    fileName: `${alias.slug}-${resolvedVersion}.jar`,
  };
}

export async function downloadHangarPlugin(
  author: string,
  slug: string,
  version: string,
  platform: "PAPER" | "FOLIA" = "PAPER",
): Promise<string> {
  const cacheDir = depsCacheDir();
  await mkdir(cacheDir, { recursive: true });
  const dest = join(cacheDir, `${author}-${slug}-${version}.jar`);

  try {
    await access(dest, constants.F_OK);
    return dest;
  } catch {
    // download
  }

  const url = `${HANGAR_API_BASE}/projects/${author}/${slug}/versions/${version}/${platform}/download`;
  info(`Downloading ${author}/${slug}@${version} (${platform}) from Hangar...`);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Hangar download failed: ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  success(`Cached dep: ${dest}`);
  return dest;
}

export async function downloadUrlPlugin(url: string, name: string): Promise<string> {
  const cacheDir = depsCacheDir();
  await mkdir(cacheDir, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const dest = join(cacheDir, `url-${safeName}.jar`);

  try {
    await access(dest, constants.F_OK);
    return dest;
  } catch {
    // download
  }

  info(`Downloading ${name} from URL...`);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`URL download failed: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  success(`Cached dep: ${dest}`);
  return dest;
}

async function installJarToPlugins(jar: string, pluginsDir: string): Promise<boolean> {
  const fileName = jar.split(/[/\\]/).pop()!;
  const dest = join(pluginsDir, fileName);
  try {
    await access(dest, constants.F_OK);
    return false; // already present
  } catch {
    await copyFile(jar, dest);
    return true;
  }
}

/** Prefetch Hangar deps into ~/.plugdev/deps (no plugins/ copy). */
export async function prefetchDeps(
  deps: Array<{
    name: string;
    enabled?: boolean;
    source?: "hangar" | "modrinth" | "url";
    version?: string;
    url?: string;
    author?: string;
    slug?: string;
  }>,
  server = "paper",
  mcVersion = "1.21.4",
): Promise<void> {
  const platform = hangarPlatform(server);
  for (const dep of deps) {
    if (dep.enabled === false) continue;
    const source = dep.source ?? "hangar";
    if (source === "url") {
      if (!dep.url) continue;
      await downloadUrlPlugin(dep.url, dep.name);
      continue;
    }
    if (source === "modrinth") {
      const slug = dep.slug ?? dep.name;
      await downloadModrinthPlugin(slug, mcVersion, dep.version, server);
      continue;
    }
    let author = dep.author;
    let slug = dep.slug;
    let version = dep.version;
    if (!author || !slug) {
      const resolved = await resolveHangarDep(dep.name, dep.version, {
        author: dep.author,
        slug: dep.slug,
      });
      author = resolved.author;
      slug = resolved.slug;
      version = resolved.version;
    }
    await downloadHangarPlugin(author!, slug!, version!, platform);
  }
}

export async function installDeps(
  pluginsDir: string,
  deps: Array<{
    name: string;
    enabled?: boolean;
    source?: "hangar" | "modrinth" | "url";
    version?: string;
    url?: string;
    author?: string;
    slug?: string;
  }>,
  server = "paper",
  mcVersion = "1.21.4",
): Promise<void> {
  const platform = hangarPlatform(server);
  await mkdir(pluginsDir, { recursive: true });

  for (const dep of deps) {
    if (dep.enabled === false) continue;
    const source = dep.source ?? "hangar";

    if (source === "url") {
      if (!dep.url) {
        throw new Error(`Dep "${dep.name}" uses source url but has no url field.`);
      }
      const jar = await downloadUrlPlugin(dep.url, dep.name);
      await installJarToPlugins(jar, pluginsDir);
      continue;
    }

    if (source === "modrinth") {
      const slug = dep.slug ?? dep.name;
      const jar = await downloadModrinthPlugin(slug, mcVersion, dep.version, server);
      await installJarToPlugins(jar, pluginsDir);
      continue;
    }

    let author = dep.author;
    let slug = dep.slug;
    let version = dep.version;

    if (!author || !slug) {
      const resolved = await resolveHangarDep(dep.name, dep.version, {
        author: dep.author,
        slug: dep.slug,
      });
      author = resolved.author;
      slug = resolved.slug;
      version = resolved.version;
    }

    const jar = await downloadHangarPlugin(author!, slug!, version!, platform);
    await installJarToPlugins(jar, pluginsDir);
  }
}

export function depSearchTerms(name: string): string[] {
  const key = name.toLowerCase().replace(/\s+/g, "");
  const alias = DEP_ALIASES[key];
  const terms = [name.toLowerCase(), key];
  if (alias) {
    terms.push(alias.slug.toLowerCase(), alias.author.toLowerCase());
  }
  return [...new Set(terms)];
}
