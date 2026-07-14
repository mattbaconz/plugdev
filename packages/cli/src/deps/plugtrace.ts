import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { info, success, warn } from "../util/log.js";
import { CLI_VERSION } from "../constants.js";

const execFileAsync = promisify(execFile);

export interface PlugTraceIntegrationConfig {
  enabled: boolean;
  jar?: string;
  artifact: "paper-modern" | "folia" | "auto";
}

export const DEFAULT_PLUGTRACE_HINT =
  "Build PlugTrace locally, then set integrations.plugtrace.jar to e.g. ../pluglabs/plugtrace/plugtrace/paper-modern/build/libs/PlugTrace-0.3.0.jar (or folia / bukkit-modern). PlugTrace is private — no Hangar/Modrinth fetch.";

export function resolvePlugTraceIntegration(
  raw?: {
    enabled?: boolean;
    jar?: string;
    artifact?: string;
  },
): PlugTraceIntegrationConfig {
  const artifact =
    raw?.artifact === "folia" || raw?.artifact === "paper-modern" || raw?.artifact === "auto"
      ? raw.artifact
      : "auto";
  return {
    enabled: raw?.enabled === true,
    jar: raw?.jar,
    artifact,
  };
}

function selectArtifact(
  configured: PlugTraceIntegrationConfig["artifact"],
  server: string,
): "paper-modern" | "folia" {
  if (configured === "folia") return "folia";
  if (configured === "paper-modern") return "paper-modern";
  return server === "folia" ? "folia" : "paper-modern";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePlugTraceJar(
  cwd: string,
  integration: PlugTraceIntegrationConfig,
  server: string,
): Promise<string | undefined> {
  if (integration.jar) {
    const path = isAbsolute(integration.jar) ? integration.jar : resolve(cwd, integration.jar);
    if (await fileExists(path)) return path;
    warn(`integrations.plugtrace.jar not found: ${path}`);
    return undefined;
  }

  const artifact = selectArtifact(integration.artifact, server);
  const candidates = [
    join(cwd, "..", "pluglabs", "plugtrace", "plugtrace", artifact, "build", "libs"),
    join(cwd, "..", "plugtrace", "plugtrace", artifact, "build", "libs"),
    join(cwd, "plugtrace", "plugtrace", artifact, "build", "libs"),
  ];

  for (const dir of candidates) {
    if (!(await fileExists(dir))) continue;
    // Prefer versioned fat jars; fall back to first PlugTrace*.jar
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(dir)).filter(
      (f) => f.startsWith("PlugTrace") && f.endsWith(".jar") && !f.includes("-sources") && !f.includes("-javadoc"),
    );
    if (files.length === 0) continue;
    files.sort();
    const preferred =
      files.find((f) => f.includes(artifact === "folia" ? "folia" : "PlugTrace-0")) ?? files[files.length - 1];
    return join(dir, preferred);
  }
  return undefined;
}

export async function installPlugTraceJar(
  cwd: string,
  pluginsDir: string,
  integration: PlugTraceIntegrationConfig,
  server: string,
): Promise<string | undefined> {
  if (!integration.enabled) return undefined;

  const jar = await resolvePlugTraceJar(cwd, integration, server);
  if (!jar) {
    warn(DEFAULT_PLUGTRACE_HINT);
    return undefined;
  }

  await mkdir(pluginsDir, { recursive: true });
  const dest = join(pluginsDir, "PlugTrace.jar");
  await copyFile(jar, dest);
  success(`Installed PlugTrace → ${dest}`);
  info(`Source: ${jar}`);
  return dest;
}

export interface PlugDevIdentityInput {
  cwd: string;
  runDir: string;
  projectName: string;
  buildSystem: string;
  buildTask: string;
  projectJarPath?: string;
  plugdevVersion?: string;
  sessionId?: string;
}

export async function writePlugDevIdentity(input: PlugDevIdentityInput): Promise<string> {
  const dataDir = join(input.runDir, "plugins", "PlugTrace");
  await mkdir(dataDir, { recursive: true });

  let gitCommit: string | undefined;
  let gitDirty = false;
  try {
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: input.cwd });
    gitCommit = head.trim();
    const { stdout: status } = await execFileAsync("git", ["status", "--porcelain"], { cwd: input.cwd });
    gitDirty = status.trim().length > 0;
  } catch {
    // git optional
  }

  let artifactHash: string | undefined;
  if (input.projectJarPath && (await fileExists(input.projectJarPath))) {
    const bytes = await readFile(input.projectJarPath);
    artifactHash = createHash("sha256").update(bytes).digest("hex");
  }

  const identity = {
    schemaVersion: "1",
    gitCommit: gitCommit ?? null,
    gitDirty,
    buildSystem: input.buildSystem,
    buildTask: input.buildTask,
    artifactHash: artifactHash ?? null,
    projectName: input.projectName,
    sessionId: input.sessionId ?? null,
    plugdevVersion: input.plugdevVersion ?? CLI_VERSION,
    recordedAt: new Date().toISOString(),
  };

  const dest = join(dataDir, "plugdev-identity.json");
  await writeFile(dest, `${JSON.stringify(identity, null, 2)}\n`, "utf8");

  // Also mirror under .plugdev for secondary search path
  const mirrorDir = join(input.cwd, ".plugdev");
  await mkdir(mirrorDir, { recursive: true });
  await writeFile(join(mirrorDir, "plugtrace-identity.json"), `${JSON.stringify(identity, null, 2)}\n`, "utf8");

  return dest;
}

export function plugTraceBuildHint(): string {
  return DEFAULT_PLUGTRACE_HINT;
}

/** Ensure parent dir exists when copying — helper for tests. */
export function identityDataDir(runDir: string): string {
  return join(runDir, "plugins", "PlugTrace");
}

export function identityParentDir(path: string): string {
  return dirname(path);
}
