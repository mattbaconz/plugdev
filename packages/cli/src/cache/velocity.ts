import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, unlink, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { FILL_API_BASE, USER_AGENT } from "../constants.js";
import { velocityCacheDir } from "../paths.js";
import { Errors } from "../util/errors.js";
import { fetchWithRetry, formatNetworkError } from "../util/fetch-retry.js";
import type { PaperBuild } from "./fill.js";

interface FillDownload {
  name: string;
  url: string;
  checksums: { sha256: string };
}

interface FillBuild {
  id: number;
  channel: string;
  downloads: Record<string, FillDownload>;
}

const DEFAULT_VELOCITY_VERSION = "3.4.0";

async function fillFetch<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(`${FILL_API_BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw Errors.downloadFailed(`Fill API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

async function verifySha256(filePath: string, expected: string): Promise<boolean> {
  const data = await readFile(filePath);
  const hash = createHash("sha256").update(data).digest("hex");
  return hash.toLowerCase() === expected.toLowerCase();
}

export async function ensureVelocityJar(
  velocityVersion = DEFAULT_VELOCITY_VERSION,
): Promise<PaperBuild> {
  const builds = await fillFetch<FillBuild[]>(
    `/projects/velocity/versions/${velocityVersion}/builds`,
  );
  const stable = builds.find((b) => b.channel === "STABLE") ?? builds[0];
  if (!stable) {
    throw Errors.downloadFailed(`No Velocity builds for ${velocityVersion}.`);
  }

  const download = stable.downloads["server:default"];
  if (!download?.url) {
    throw Errors.downloadFailed(`No Velocity download for ${velocityVersion}.`);
  }

  const dir = velocityCacheDir(velocityVersion);
  await mkdir(dir, { recursive: true });

  const jarName = download.name || `velocity-${velocityVersion}-${stable.id}.jar`;
  const jarPath = join(dir, jarName);
  const metaPath = join(dir, "meta.json");

  try {
    await access(jarPath);
    const ok = await verifySha256(jarPath, download.checksums.sha256);
    if (ok) {
      return {
        id: stable.id,
        channel: stable.channel,
        jarPath,
        jarName,
        sha256: download.checksums.sha256,
        cacheHit: true,
      };
    }
  } catch {
    // download
  }

  const res = await fetchWithRetry(download.url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok || !res.body) {
    throw Errors.downloadFailed(`Velocity download failed: HTTP ${res.status}`);
  }

  try {
    await pipeline(
      Readable.fromWeb(res.body as import("stream/web").ReadableStream),
      createWriteStream(jarPath),
    );
  } catch (err) {
    await unlink(jarPath).catch(() => undefined);
    throw Errors.downloadFailed(formatNetworkError(err));
  }

  const ok = await verifySha256(jarPath, download.checksums.sha256);
  if (!ok) {
    await unlink(jarPath).catch(() => undefined);
    throw Errors.downloadFailed("SHA256 mismatch after Velocity download.");
  }

  await writeFile(
    metaPath,
    JSON.stringify(
      { velocityVersion, buildId: stable.id, jarName, sha256: download.checksums.sha256 },
      null,
      2,
    ),
  );

  return {
    id: stable.id,
    channel: stable.channel,
    jarPath,
    jarName,
    sha256: download.checksums.sha256,
    cacheHit: false,
  };
}
