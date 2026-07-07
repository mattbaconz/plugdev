import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { depsCacheDir } from "../paths.js";
import { info, success } from "../util/log.js";
import { USER_AGENT } from "../constants.js";

const MODRINTH_API = "https://api.modrinth.com/v2";

interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary?: boolean;
}

interface ModrinthVersion {
  id: string;
  version_number: string;
  version_type: string;
  files: ModrinthVersionFile[];
}

function modrinthLoader(server: string): string {
  return server === "folia" ? "folia" : "paper";
}

export async function downloadModrinthPlugin(
  projectSlug: string,
  mcVersion: string,
  version?: string,
  server = "paper",
): Promise<string> {
  const cacheDir = depsCacheDir();
  await mkdir(cacheDir, { recursive: true });

  const loader = modrinthLoader(server);
  const params = new URLSearchParams({
    loaders: JSON.stringify([loader]),
    game_versions: JSON.stringify([mcVersion]),
  });

  const versionsRes = await fetch(
    `${MODRINTH_API}/project/${encodeURIComponent(projectSlug)}/version?${params}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!versionsRes.ok) {
    throw new Error(`Modrinth version lookup failed for ${projectSlug}: ${versionsRes.status}`);
  }

  const versions = (await versionsRes.json()) as ModrinthVersion[];
  if (versions.length === 0) {
    throw new Error(
      `No Modrinth release for ${projectSlug} on ${mcVersion} (${loader}).`,
    );
  }

  let pick = versions.find((v) => v.version_type === "release") ?? versions[0];
  if (version) {
    const exact = versions.find((v) => v.version_number === version);
    if (!exact) {
      throw new Error(`Modrinth version ${version} not found for ${projectSlug}.`);
    }
    pick = exact;
  }

  const file = pick.files.find((f) => f.primary) ?? pick.files[0];
  if (!file) {
    throw new Error(`Modrinth version ${pick.version_number} has no downloadable file.`);
  }

  const dest = join(cacheDir, `modrinth-${projectSlug}-${pick.version_number}.jar`);
  try {
    await access(dest, constants.F_OK);
    return dest;
  } catch {
    // download
  }

  info(`Downloading ${projectSlug}@${pick.version_number} from Modrinth...`);
  const res = await fetch(file.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Modrinth download failed: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  success(`Cached dep: ${dest}`);
  return dest;
}
