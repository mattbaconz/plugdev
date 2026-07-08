import { execa } from "execa";
import { join } from "node:path";

export function parseJavaMajor(version?: string): number | undefined {
  if (!version) return undefined;
  const major = version.startsWith("1.")
    ? parseInt(version.split(".")[1] ?? "", 10)
    : parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : undefined;
}

export async function checkJava(): Promise<{
  ok: boolean;
  version?: string;
  major?: number;
}> {
  try {
    const { stderr } = await execa("java", ["-version"], { reject: false });
    const m = String(stderr).match(/version "([^"]+)"/);
    const version = m?.[1];
    return { ok: true, version, major: parseJavaMajor(version) };
  } catch {
    return { ok: false };
  }
}

export async function requireJava21(): Promise<void> {
  const { Errors } = await import("./errors.js");
  const java = await checkJava();
  if (!java.ok) throw Errors.javaNotFound();
  if (java.major !== undefined && java.major < 21) {
    throw Errors.javaVersionUnsupported(java.version ?? "unknown");
  }
}

export async function checkGradle(cwd: string): Promise<boolean> {
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "gradlew";
  const path = join(cwd, gradlew);
  try {
    const result = await execa(path, ["--version"], { cwd, reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function checkMaven(cwd: string): Promise<boolean> {
  try {
    const result = await execa("mvn", ["--version"], { cwd, reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
