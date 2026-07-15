import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import type { ResolvedConfig } from "../config/loader.js";
import { info } from "../util/log.js";
import { Errors } from "../util/errors.js";
import { getResolvedJava, javaChildEnv } from "../util/tools.js";
import { findJarByPattern, isExcludedJar, pickBestJar } from "./jars.js";
import type { BuildResult } from "./types.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Prefer Maven Wrapper when present; otherwise system `mvn`. */
export async function resolveMavenCommand(cwd: string): Promise<{
  command: string;
  viaWrapper: boolean;
}> {
  const wrapper =
    process.platform === "win32"
      ? join(cwd, "mvnw.cmd")
      : join(cwd, "mvnw");
  if (await exists(wrapper)) {
    return { command: wrapper, viaWrapper: true };
  }
  // On Windows, also accept bare mvnw if .cmd missing
  if (process.platform === "win32" && (await exists(join(cwd, "mvnw")))) {
    return { command: join(cwd, "mvnw"), viaWrapper: true };
  }
  return { command: "mvn", viaWrapper: false };
}

/**
 * Build Maven CLI args for package (or custom task).
 * When `module` is set: `-pl <module> -am <task> -DskipTests -q`
 */
export function mavenBuildArgs(opts: {
  task: string;
  module?: string;
}): string[] {
  const task = opts.task || "package";
  if (opts.module) {
    return ["-pl", opts.module, "-am", task, "-DskipTests", "-q"];
  }
  return [task, "-DskipTests", "-q"];
}

/** Default jarPattern when module is set and pattern omitted. */
export function defaultMavenJarPattern(module?: string): string | undefined {
  if (module) return `${module.replace(/\\/g, "/").replace(/\/$/, "")}/target/*.jar`;
  return "target/*.jar";
}

export async function findMavenJar(
  cwd: string,
  jarPattern?: string,
  task = "package",
  preferredPluginName?: string,
): Promise<string> {
  if (jarPattern) {
    return findJarByPattern(cwd, jarPattern, task, preferredPluginName);
  }

  const targetDir = join(cwd, "target");
  let files: string[];
  try {
    files = await readdir(targetDir);
  } catch {
    throw Errors.noJarFound(task);
  }

  const jars = files.filter((f) => f.endsWith(".jar") && !isExcludedJar(f));
  if (jars.length === 0) throw Errors.noJarFound(task);
  return pickBestJar(targetDir, jars, { preferredPluginName });
}

/** True when pom.xml looks like a multi-module reactor. */
export async function pomHasModules(cwd: string): Promise<boolean> {
  try {
    const pom = await readFile(join(cwd, "pom.xml"), "utf8");
    return /<modules\b/i.test(pom) && /<module\b/i.test(pom);
  } catch {
    return false;
  }
}

export async function runMavenBuild(
  cwd: string,
  config?: ResolvedConfig,
  preferredPluginName?: string,
): Promise<BuildResult> {
  const task =
    config?.build.task && config.build.task !== "build"
      ? config.build.task
      : "package";
  const module = config?.build.module;
  const { command, viaWrapper } = await resolveMavenCommand(cwd);
  const args = mavenBuildArgs({ task, module });

  const label = module
    ? `Maven: -pl ${module} -am ${task}`
    : `Maven: ${task}`;
  info(viaWrapper ? `${label} (wrapper)` : label);

  try {
    await execa(command, args, {
      cwd,
      stdio: "inherit",
      env: javaChildEnv(getResolvedJava()),
    });
  } catch (e) {
    throw Errors.buildFailed(
      task,
      e instanceof Error ? e.message : String(e),
    );
  }

  const jarPattern =
    config?.build.jarPattern ?? defaultMavenJarPattern(module);
  const jarPath = await findMavenJar(
    cwd,
    jarPattern,
    task,
    preferredPluginName,
  );
  return { jarPath, task };
}
