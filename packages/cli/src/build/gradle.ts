import { execa } from "execa";
import { copyFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ResolvedConfig } from "../config/loader.js";
import type { DetectedProject } from "../detect/project.js";
import { info } from "../util/log.js";
import { Errors } from "../util/errors.js";
import { getResolvedJava, javaChildEnv } from "../util/tools.js";
import { findJarByPattern } from "./jars.js";
import type { BuildResult } from "./types.js";

export type { BuildResult } from "./types.js";

function gradleEnv(): NodeJS.ProcessEnv {
  return javaChildEnv(getResolvedJava());
}

function gradlewCommand(cwd: string): string {
  return join(cwd, process.platform === "win32" ? "gradlew.bat" : "gradlew");
}

function modGradleArgs(config: ResolvedConfig, project: DetectedProject): string[] {
  const sub = config.gradleSubproject;
  const modTask =
    config.devMode === "server"
      ? "runServer"
      : config.devMode === "datagen"
        ? config.loader === "neoforge"
          ? "runData"
          : "runDatagen"
        : "runClient";
  return sub ? [sub.replace(":", ""), modTask] : [modTask];
}

export async function runModGradle(
  cwd: string,
  config: ResolvedConfig,
  project: DetectedProject,
): Promise<{ task: string }> {
  const gradlew = gradlewCommand(cwd);
  const gradleArgs = modGradleArgs(config, project);
  const modTask = gradleArgs[gradleArgs.length - 1];
  info(`Mod dev: delegating to Gradle ${gradleArgs.join(":")}`);
  await execa(gradlew, gradleArgs, { cwd, stdio: "inherit", env: gradleEnv() });
  return { task: modTask };
}

export async function runGradleTask(
  cwd: string,
  config: ResolvedConfig,
  project: DetectedProject,
  task: string,
): Promise<void> {
  const gradlew = gradlewCommand(cwd);
  const sub = config.gradleSubproject?.replace(":", "");
  const args = sub ? [sub, task] : [task];
  await execa(gradlew, [...args, "--quiet"], {
    cwd,
    stdio: "inherit",
    env: gradleEnv(),
  });
}

export async function runGradleBuild(
  cwd: string,
  config: ResolvedConfig,
  project: DetectedProject,
): Promise<BuildResult> {
  const gradlew = gradlewCommand(cwd);
  const task = config.build.jarTask;

  if (project.type === "mod") {
    const result = await runModGradle(cwd, config, project);
    return { jarPath: "", task: result.task };
  }

  const tasks = task === "shadowJar" ? ["shadowJar", "jar"] : [task];

  let lastError: unknown;
  for (const t of tasks) {
    try {
      await execa(gradlew, [t, "-x", "test", "--quiet"], {
        cwd,
        stdio: "inherit",
        env: gradleEnv(),
      });
      const jarPath = await findBuiltJar(cwd, t, config.build.jarPattern);
      return { jarPath, task: t };
    } catch (e) {
      lastError = e;
      if (t === tasks[tasks.length - 1]) break;
      info(`Task ${t} failed, trying fallback...`);
    }
  }
  throw Errors.buildFailed(
    tasks.join(" / "),
    lastError instanceof Error ? lastError.message : String(lastError),
  );
}

/** @deprecated Import from `./maven.js` — re-exported for callers. */
export { runMavenBuild } from "./maven.js";

async function findBuiltJar(
  cwd: string,
  task: string,
  jarPattern?: string,
): Promise<string> {
  if (jarPattern) {
    return findJarByPattern(cwd, jarPattern, task);
  }

  try {
    return await findJarByPattern(cwd, "build/libs/*.jar", task);
  } catch {
    throw Errors.noJarFound(task);
  }
}

export async function deployPluginJar(
  jarPath: string,
  pluginsDir: string,
  _devPluginName?: string,
  forReload = false,
): Promise<string> {
  await mkdir(pluginsDir, { recursive: true });
  const baseName = basename(jarPath);
  const dest = forReload
    ? join(pluginsDir, baseName.replace(/\.jar$/i, `-reload-${Date.now()}.jar`))
    : join(pluginsDir, baseName);
  await copyFile(jarPath, dest);
  return dest;
}

export async function deployBootstrapJar(
  bootstrapSource: string,
  pluginsDir: string,
): Promise<void> {
  await mkdir(pluginsDir, { recursive: true });
  await copyFile(bootstrapSource, join(pluginsDir, "plugdev-bootstrap-paper.jar"));
}
