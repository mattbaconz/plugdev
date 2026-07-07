import { mkdir, writeFile, access, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { HANGAR_API_BASE, USER_AGENT } from "../constants.js";
import { depsCacheDir } from "../paths.js";
import { info, success } from "../util/log.js";

const DEP_ALIASES: Record<string, { author: string; slug: string }> = {
  vault: { author: "TNE", slug: "VaultUnlocked" },
  vaultunlocked: { author: "TNE", slug: "VaultUnlocked" },
  luckperms: { author: "LuckPerms", slug: "LuckPerms" },
};

interface HangarVersion {
  name: string;
}

export async function resolveHangarDep(
  name: string,
  version?: string,
): Promise<{ author: string; slug: string; version: string; fileName: string }> {
  const key = name.toLowerCase().replace(/\s+/g, "");
  const alias = DEP_ALIASES[key];
  if (!alias) {
    throw new Error(
      `Unknown dep alias "${name}". Use author/slug in plugdev.yml or add mapping.`,
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
  platform: "PAPER" = "PAPER",
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
  info(`Downloading ${author}/${slug}@${version} from Hangar...`);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Hangar download failed: ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  success(`Cached dep: ${dest}`);
  return dest;
}

export async function installDeps(
  pluginsDir: string,
  deps: Array<{ name: string; version?: string; author?: string; slug?: string }>,
): Promise<void> {
  for (const dep of deps) {
    let author = dep.author;
    let slug = dep.slug;
    let version = dep.version;

    if (!author || !slug) {
      const resolved = await resolveHangarDep(dep.name, dep.version);
      author = resolved.author;
      slug = resolved.slug;
      version = resolved.version;
    }

    const jar = await downloadHangarPlugin(author!, slug!, version!);
    await copyFile(jar, join(pluginsDir, jar.split(/[/\\]/).pop()!));
  }
}
