import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { USER_AGENT } from "../constants.js";
import { serversCacheDir } from "../paths.js";
import { Errors } from "../util/errors.js";
import type { PaperBuild } from "./fill.js";

const PUFFERFISH_CI = "https://ci.pufferfish.host";

interface JenkinsArtifact {
  fileName: string;
  relativePath: string;
}

interface JenkinsBuild {
  number: number;
  artifacts: JenkinsArtifact[];
}

function pufferfishJobName(mcVersion: string): string {
  const majorMinor = mcVersion.split(".").slice(0, 2).join(".");
  return `Pufferfish-${majorMinor}`;
}

export async function ensurePufferfishJar(mcVersion: string): Promise<PaperBuild> {
  const job = pufferfishJobName(mcVersion);
  const buildRes = await fetch(
    `${PUFFERFISH_CI}/job/${job}/lastSuccessfulBuild/api/json?tree=number,artifacts[fileName,relativePath]`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!buildRes.ok) {
    throw Errors.downloadFailed(
      `No Pufferfish CI job for Minecraft ${mcVersion} (${job}, HTTP ${buildRes.status}).`,
    );
  }

  const build = (await buildRes.json()) as JenkinsBuild;
  const artifact =
    build.artifacts.find((a) => a.fileName.endsWith(".jar") && a.fileName.includes("paperclip")) ??
    build.artifacts.find((a) => a.fileName.endsWith(".jar"));

  if (!artifact) {
    throw Errors.downloadFailed(`Pufferfish build #${build.number} has no server JAR artifact.`);
  }

  const dir = serversCacheDir(mcVersion, "pufferfish");
  await mkdir(dir, { recursive: true });

  const jarName = artifact.fileName;
  const jarPath = join(dir, jarName);
  const metaPath = join(dir, "meta.json");

  try {
    await access(jarPath);
    return {
      id: build.number,
      channel: "STABLE",
      jarPath,
      jarName,
      sha256: "",
      cacheHit: true,
    };
  } catch {
    // download
  }

  const downloadUrl = `${PUFFERFISH_CI}/job/${job}/${build.number}/artifact/${artifact.relativePath}`;
  const res = await fetch(downloadUrl, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    throw Errors.downloadFailed(`Pufferfish download failed: HTTP ${res.status}`);
  }

  await pipeline(
    Readable.fromWeb(res.body as import("stream/web").ReadableStream),
    createWriteStream(jarPath),
  );

  await writeFile(
    metaPath,
    JSON.stringify(
      { mcVersion, project: "pufferfish", buildNumber: build.number, jarName, job },
      null,
      2,
    ),
  );

  return {
    id: build.number,
    channel: "STABLE",
    jarPath,
    jarName,
    sha256: "",
    cacheHit: false,
  };
}
