import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { USER_AGENT } from "../constants.js";
import { serversCacheDir } from "../paths.js";
import { Errors } from "../util/errors.js";
import type { PaperBuild } from "./fill.js";

const PURPUR_API = "https://api.purpurmc.org/v2/purpur";

interface PurpurVersionInfo {
  builds: { latest: string; all: string[] };
}

interface PurpurBuildInfo {
  md5: string;
}

async function verifyMd5(filePath: string, expected: string): Promise<boolean> {
  const data = await readFile(filePath);
  const hash = createHash("md5").update(data).digest("hex");
  return hash.toLowerCase() === expected.toLowerCase();
}

export async function ensurePurpurJar(mcVersion: string): Promise<PaperBuild> {
  const versionRes = await fetch(`${PURPUR_API}/${mcVersion}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!versionRes.ok) {
    throw Errors.downloadFailed(
      `No Purpur builds for Minecraft ${mcVersion} (${versionRes.status}).`,
    );
  }

  const versionInfo = (await versionRes.json()) as PurpurVersionInfo;
  const buildId = versionInfo.builds.latest;

  const buildRes = await fetch(`${PURPUR_API}/${mcVersion}/${buildId}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!buildRes.ok) {
    throw Errors.downloadFailed(`Purpur build metadata failed: ${buildRes.status}`);
  }
  const buildInfo = (await buildRes.json()) as PurpurBuildInfo;

  const dir = serversCacheDir(mcVersion, "purpur");
  await mkdir(dir, { recursive: true });

  const jarName = `purpur-${mcVersion}-${buildId}.jar`;
  const jarPath = join(dir, jarName);
  const metaPath = join(dir, "meta.json");

  try {
    await access(jarPath);
    const ok = await verifyMd5(jarPath, buildInfo.md5);
    if (ok) {
      return {
        id: parseInt(buildId, 10),
        channel: "STABLE",
        jarPath,
        jarName,
        sha256: buildInfo.md5,
        cacheHit: true,
      };
    }
  } catch {
    // download
  }

  const downloadUrl = `${PURPUR_API}/${mcVersion}/${buildId}/download`;
  const res = await fetch(downloadUrl, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    throw Errors.downloadFailed(`Purpur download failed: HTTP ${res.status}`);
  }

  await pipeline(
    Readable.fromWeb(res.body as import("stream/web").ReadableStream),
    createWriteStream(jarPath),
  );

  const ok = await verifyMd5(jarPath, buildInfo.md5);
  if (!ok) {
    throw Errors.downloadFailed("MD5 checksum mismatch after Purpur download.");
  }

  await writeFile(
    metaPath,
    JSON.stringify(
      { mcVersion, project: "purpur", buildId, jarName, md5: buildInfo.md5 },
      null,
      2,
    ),
  );

  return {
    id: parseInt(buildId, 10),
    channel: "STABLE",
    jarPath,
    jarName,
    sha256: buildInfo.md5,
    cacheHit: false,
  };
}
