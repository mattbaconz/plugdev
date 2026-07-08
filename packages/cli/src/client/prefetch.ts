import { access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { mkdir } from "node:fs/promises";
import { plugdevHome } from "../paths.js";

interface VersionManifestEntry {
  id: string;
  url: string;
}

export function embeddedClientDir(): string {
  return join(plugdevHome(), "minecraft");
}

export async function isEmbeddedClientCached(mcVersion: string): Promise<boolean> {
  const versionJson = join(
    embeddedClientDir(),
    "versions",
    mcVersion,
    `${mcVersion}.json`,
  );
  try {
    await access(versionJson, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function prefetchEmbeddedClient(
  mcVersion: string,
  opts?: { onProgress?: (percent: number | undefined, label: string) => void },
): Promise<{ cacheHit: boolean }> {
  if (await isEmbeddedClientCached(mcVersion)) {
    return { cacheHit: true };
  }

  opts?.onProgress?.(undefined, `Downloading Minecraft ${mcVersion}…`);

  const manifestRes = await fetch(
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
  );
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch Minecraft version manifest: ${manifestRes.status}`);
  }
  const manifest = (await manifestRes.json()) as {
    versions: VersionManifestEntry[];
  };
  const versionMeta = manifest.versions.find((v) => v.id === mcVersion);
  if (!versionMeta) {
    throw new Error(`Minecraft version ${mcVersion} not found in manifest`);
  }

  const gamePath = embeddedClientDir();
  await mkdir(gamePath, { recursive: true });

  const { install } = await import("@xmcl/installer");
  await install(versionMeta, gamePath, { side: "client" });

  return { cacheHit: false };
}
