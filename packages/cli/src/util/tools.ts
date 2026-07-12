import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { execa } from "execa";

export type ResolvedJava = {
  /** Absolute path to java / java.exe */
  path: string;
  /** JDK/JRE home (parent of bin), when known */
  home?: string;
  version?: string;
  major?: number;
};

let cachedJava: ResolvedJava | null | undefined;

export function parseJavaMajor(version?: string): number | undefined {
  if (!version) return undefined;
  const major = version.startsWith("1.")
    ? parseInt(version.split(".")[1] ?? "", 10)
    : parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : undefined;
}

/**
 * Paper / Folia 26.x ships class files that need JDK 25+.
 * Older lines stay at Java 21+.
 */
export function minJavaMajorForServerVersion(version?: string): number {
  if (!version) return 21;
  const major = parseInt(version.split(".")[0] ?? "", 10);
  if (Number.isFinite(major) && major >= 26) return 25;
  return 21;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function javaBinName(): string {
  return process.platform === "win32" ? "java.exe" : "java";
}

function javacBinName(): string {
  return process.platform === "win32" ? "javac.exe" : "javac";
}

function homeFromJavaPath(javaPath: string): string | undefined {
  if (javaPath === "java" || javaPath === "java.exe") return undefined;
  // .../bin/java(.exe) → home
  return dirname(dirname(javaPath));
}

async function probeJava(javaPath: string): Promise<ResolvedJava | null> {
  try {
    const { stderr, exitCode } = await execa(javaPath, ["-version"], {
      reject: false,
    });
    if (exitCode !== 0 && !stderr) return null;
    const m = String(stderr).match(/version "([^"]+)"/);
    const version = m?.[1];
    const major = parseJavaMajor(version);
    const home = homeFromJavaPath(javaPath);
    return { path: javaPath, home, version, major };
  } catch {
    return null;
  }
}

/** Candidate JDK homes on this machine (no PATH mutation). */
async function candidateHomes(): Promise<string[]> {
  const homes: string[] = [];
  const seen = new Set<string>();
  const add = (h?: string) => {
    if (!h) return;
    const key = h.replace(/[/\\]+$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    homes.push(h);
  };

  add(process.env.JAVA_HOME);
  add(process.env.JDK_HOME);

  const user = homedir();
  if (process.platform === "win32") {
    const scoop = join(user, "scoop", "apps");
    // Prefer newer Temurin first when scanning
    for (const name of [
      "temurin25-jdk",
      "openjdk25",
      "temurin24-jdk",
      "temurin23-jdk",
      "temurin22-jdk",
      "temurin21-jdk",
      "openjdk21",
      "temurin-jdk",
      "openjdk",
    ]) {
      add(join(scoop, name, "current"));
    }
    add(join(user, ".jdks"));
  } else {
    add("/usr/lib/jvm/temurin-25-jdk");
    add("/usr/lib/jvm/temurin-21-jdk");
    add("/Library/Java/JavaVirtualMachines");
  }

  return homes;
}

async function candidatesFromPath(): Promise<string[]> {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout, exitCode } = await execa(cmd, ["java"], { reject: false });
    if (exitCode !== 0 || !stdout.trim()) return [];
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Resolve a usable Java binary by absolute path.
 * Never mutates PATH (avoids Windows cmd "input line is too long").
 * Picks the newest eligible JDK; callers enforce min major via requireJava.
 */
export async function resolveJava(
  minMajor = 0,
): Promise<ResolvedJava | null> {
  if (
    cachedJava &&
    (minMajor <= 0 ||
      cachedJava.major === undefined ||
      cachedJava.major >= minMajor)
  ) {
    return cachedJava;
  }

  const probed: ResolvedJava[] = [];
  const seenPaths = new Set<string>();

  const consider = async (javaPath: string) => {
    const key = javaPath.replace(/[/\\]+$/, "").toLowerCase();
    if (seenPaths.has(key)) return;
    seenPaths.add(key);
    if (!(await exists(javaPath))) return;
    const info = await probeJava(javaPath);
    if (info) probed.push(info);
  };

  for (const home of await candidateHomes()) {
    await consider(join(home, "bin", javaBinName()));
  }
  for (const p of await candidatesFromPath()) {
    await consider(p);
  }
  // Last resort: bare name (spawn may still find it via PATH in Node)
  if (probed.length === 0) {
    const bare = await probeJava("java");
    if (bare) probed.push({ ...bare, path: "java" });
  }

  if (probed.length === 0) {
    cachedJava = null;
    return null;
  }

  // Prefer highest major; if JAVA_HOME matches that major, keep it
  probed.sort((a, b) => (b.major ?? 0) - (a.major ?? 0));
  const bestMajor = probed[0]!.major;
  const atBest = probed.filter((j) => j.major === bestMajor);
  const preferredHome = process.env.JAVA_HOME?.replace(/[/\\]+$/, "").toLowerCase();
  const matchHome = preferredHome
    ? atBest.find(
        (j) => j.home?.replace(/[/\\]+$/, "").toLowerCase() === preferredHome,
      )
    : undefined;
  const chosen = matchHome ?? atBest[0]!;

  if (minMajor > 0 && chosen.major !== undefined && chosen.major < minMajor) {
    // Keep discovery cache for doctor, but signal miss for this min
    cachedJava = chosen;
    return null;
  }

  cachedJava = chosen;

  // Apply for this process + children (Gradle/Maven honor JAVA_HOME; no cmd PATH rewrite)
  if (chosen.home) {
    process.env.JAVA_HOME = chosen.home;
  }

  return chosen;
}

/** Last resolved Java (after resolveJava / requireJava). */
export function getResolvedJava(): ResolvedJava | null {
  return cachedJava ?? null;
}

/** Env for child processes: JAVA_HOME + java bin first on PATH (Node-side only). */
export function javaChildEnv(
  java?: ResolvedJava | null,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  if (java?.home) {
    env.JAVA_HOME = java.home;
    const bin = join(java.home, "bin");
    const pathKey = process.platform === "win32" ? "Path" : "PATH";
    // Normalize to PATH for cross-spawn; Node accepts either on Windows
    const current = env.PATH ?? env.Path ?? "";
    env.PATH = `${bin}${delimiter}${current}`;
    if (process.platform === "win32") {
      env.Path = env.PATH;
    }
  }
  return env;
}

export function javaToolPath(
  java: ResolvedJava | null | undefined,
  tool: "java" | "javac",
): string {
  if (!java?.home) {
    return tool === "javac" ? "javac" : java?.path ?? "java";
  }
  return join(java.home, "bin", tool === "javac" ? javacBinName() : javaBinName());
}

export async function checkJava(minMajor = 21): Promise<{
  ok: boolean;
  version?: string;
  major?: number;
  path?: string;
  home?: string;
}> {
  // Discover best JDK (may be below minMajor)
  cachedJava = undefined;
  const any = await resolveJava(0);
  if (!any) return { ok: false };
  const ok = any.major === undefined || any.major >= minMajor;
  if (ok && any.home) process.env.JAVA_HOME = any.home;
  return {
    ok,
    version: any.version,
    major: any.major,
    path: any.path,
    home: any.home,
  };
}

export async function requireJava(minMajor = 21): Promise<ResolvedJava> {
  const { Errors } = await import("./errors.js");
  cachedJava = undefined;
  const java = await resolveJava(0);
  if (!java) throw Errors.javaNotFound();
  if (java.major !== undefined && java.major < minMajor) {
    throw Errors.javaVersionUnsupported(java.version ?? "unknown", minMajor);
  }
  if (java.home) process.env.JAVA_HOME = java.home;
  cachedJava = java;
  return java;
}

/** @deprecated Prefer requireJava(minJavaMajorForServerVersion(version)) */
export async function requireJava21(): Promise<ResolvedJava> {
  return requireJava(21);
}

export async function checkGradle(cwd: string): Promise<boolean> {
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "gradlew";
  const path = join(cwd, gradlew);
  try {
    const result = await execa(path, ["--version"], {
      cwd,
      reject: false,
      env: javaChildEnv(getResolvedJava()),
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function checkMaven(cwd: string): Promise<boolean> {
  const wrappers =
    process.platform === "win32"
      ? [join(cwd, "mvnw.cmd"), join(cwd, "mvnw")]
      : [join(cwd, "mvnw")];

  const env = javaChildEnv(getResolvedJava());

  for (const wrapper of wrappers) {
    try {
      const result = await execa(wrapper, ["--version"], {
        cwd,
        reject: false,
        env,
      });
      if (result.exitCode === 0) return true;
    } catch {
      // try next
    }
  }

  try {
    const result = await execa("mvn", ["--version"], { cwd, reject: false, env });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
