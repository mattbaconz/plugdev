import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { FILL_API_BASE, USER_AGENT } from "../constants.js";
import { serversCacheDir } from "../paths.js";

export interface PaperBuild {
  id: number;
  channel: string;
  jarPath: string;
  jarName: string;
  sha256: string;
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
    throw new Error(`Fill API error ${res.status}: ${path}`);
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
    throw new Error(
      `No STABLE ${project} build for Minecraft ${mcVersion}. Try a different version.`,
    );
  }

  const download =
    stable.downloads["server:default"] ?? stable.downloads["server:mojang"];
  if (!download?.url) {
    throw new Error(`No server:default download for ${project} ${mcVersion}`);
  }

  return { build: stable, download };
}

async function verifySha256(filePath: string, expected: string): Promise<boolean> {
  const data = await readFile(filePath);
  const hash = createHash("sha256").update(data).digest("hex");
  return hash.toLowerCase() === expected.toLowerCase();
}

export async function ensurePaperJar(
  mcVersion: string,
  project: "paper" | "folia" = "paper",
): Promise<PaperBuild> {
  const { build, download } = await resolveStablePaperBuild(project, mcVersion);
  const dir = serversCacheDir(mcVersion);
  await mkdir(dir, { recursive: true });

  const jarName = download.name || `${project}-${mcVersion}-${build.id}.jar`;
  const jarPath = join(dir, jarName);
  const metaPath = join(dir, "meta.json");

  try {
    await access(jarPath);
    const ok = await verifySha256(jarPath, download.checksums.sha256);
    if (ok) {
      return { id: build.id, channel: build.channel, jarPath, jarName, sha256: download.checksums.sha256 };
    }
  } catch {
    // download fresh
  }

  const res = await fetch(download.url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download Paper: ${res.status}`);
  }

  await pipeline(Readable.fromWeb(res.body as import("stream/web").ReadableStream), createWriteStream(jarPath));

  const ok = await verifySha256(jarPath, download.checksums.sha256);
  if (!ok) {
    throw new Error("Paper JAR SHA256 mismatch after download");
  }

  await writeFile(
    metaPath,
    JSON.stringify({ mcVersion, buildId: build.id, jarName, sha256: download.checksums.sha256 }, null, 2),
  );

  return { id: build.id, channel: build.channel, jarPath, jarName, sha256: download.checksums.sha256 };
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
