import { execa } from "execa";
import { join } from "node:path";

export async function checkJava(): Promise<{ ok: boolean; version?: string }> {
  try {
    const { stderr } = await execa("java", ["-version"], { reject: false });
    const m = String(stderr).match(/version "([^"]+)"/);
    return { ok: true, version: m?.[1] };
  } catch {
    return { ok: false };
  }
}

export async function checkGradle(cwd: string): Promise<boolean> {
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "gradlew";
  const path = join(cwd, gradlew);
  try {
    await execa(path, ["--version"], { cwd, reject: false });
    return true;
  } catch {
    return false;
  }
}

export async function checkMaven(cwd: string): Promise<boolean> {
  try {
    await execa("mvn", ["--version"], { cwd, reject: false });
    return true;
  } catch {
    return false;
  }
}
