import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { FILL_API_BASE, USER_AGENT } from "../constants.js";
import { serversCacheDir } from "../paths.js";
import { Errors } from "../util/errors.js";

export interface EnsurePaperJarOptions {
  onProgress?: (percent: number | undefined, label: string) => void;
}

export interface PaperBuild {
  id: number;
  channel: string;
  jarPath: string;
  jarName: string;
  sha256: string;
  cacheHit: boolean;
}

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

async function fillFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${FILL_API_BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw Errors.downloadFailed(`Fill API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function resolveStablePaperBuild(
  project: "paper" | "folia",
  mcVersion: string,
): Promise<{ build: FillBuild; download: FillDownload }> {
  const builds = await fillFetch<FillBuild[]>(
    `/projects/${project}/versions/${mcVersion}/builds`,
  );

  const stable = builds.find((b) => b.channel === "STABLE");
  if (!stable) {
    throw Errors.downloadFailed(
      `No STABLE ${project} build for Minecraft ${mcVersion}.`,
    );
  }

  const download =
    stable.downloads["server:default"] ?? stable.downloads["server:mojang"];
  if (!download?.url) {
    throw Errors.downloadFailed(`No server download for ${project} ${mcVersion}.`);
  }

  return { build: stable, download };
}

async function verifySha256(filePath: string, expected: string): Promise<boolean> {
  const data = await readFile(filePath);
  const hash = createHash("sha256").update(data).digest("hex");
  return hash.toLowerCase() === expected.toLowerCase();
}

export async function isPaperJarCached(
  mcVersion: string,
  project: "paper" | "folia" = "paper",
): Promise<boolean> {
  try {
    const { build, download } = await resolveStablePaperBuild(project, mcVersion);
    const dir = serversCacheDir(mcVersion, project);
    const jarName = download.name || `${project}-${mcVersion}-${build.id}.jar`;
    const jarPath = join(dir, jarName);
    await access(jarPath);
    return verifySha256(jarPath, download.checksums.sha256);
  } catch {
    return false;
  }
}

export async function ensurePaperJar(
  mcVersion: string,
  project: "paper" | "folia" = "paper",
  options: EnsurePaperJarOptions = {},
): Promise<PaperBuild> {
  const { build, download } = await resolveStablePaperBuild(project, mcVersion);
  const dir = serversCacheDir(mcVersion, project);
  await mkdir(dir, { recursive: true });

  const jarName = download.name || `${project}-${mcVersion}-${build.id}.jar`;
  const jarPath = join(dir, jarName);
  const metaPath = join(dir, "meta.json");

  try {
    await access(jarPath);
    const ok = await verifySha256(jarPath, download.checksums.sha256);
    if (ok) {
      return {
        id: build.id,
        channel: build.channel,
        jarPath,
        jarName,
        sha256: download.checksums.sha256,
        cacheHit: true,
      };
    }
  } catch {
    // download fresh
  }

  const res = await fetch(download.url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok || !res.body) {
    throw Errors.downloadFailed(`HTTP ${res.status} from Paper Fill API.`);
  }

  const label = `Downloading ${project} ${mcVersion}…`;
  const total = Number(res.headers.get("content-length")) || 0;
  let downloaded = 0;
  let lastReportedPercent = -1;

  const progressStream =
    options.onProgress && total > 0
      ? new Transform({
          transform(chunk, _enc, cb) {
            downloaded += chunk.length;
            const percent = Math.min(100, Math.round((downloaded / total) * 100));
            if (percent !== lastReportedPercent) {
              lastReportedPercent = percent;
              options.onProgress!(percent, label);
            }
            cb(null, chunk);
          },
        })
      : null;

  if (options.onProgress && !total) {
    options.onProgress(undefined, label);
  }

  const source = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  if (progressStream) {
    await pipeline(source, progressStream, createWriteStream(jarPath));
  } else {
    await pipeline(source, createWriteStream(jarPath));
  }

  const ok = await verifySha256(jarPath, download.checksums.sha256);
  if (!ok) {
    throw Errors.downloadFailed("SHA256 checksum mismatch after download.");
  }

  await writeFile(
    metaPath,
    JSON.stringify(
      { mcVersion, project, buildId: build.id, jarName, sha256: download.checksums.sha256 },
      null,
      2,
    ),
  );

  return {
    id: build.id,
    channel: build.channel,
    jarPath,
    jarName,
    sha256: download.checksums.sha256,
    cacheHit: false,
  };
}

export async function cacheDirSize(dir: string): Promise<number> {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return s.size;
    // shallow estimate
    return s.size;
  } catch {
    return 0;
  }
}
