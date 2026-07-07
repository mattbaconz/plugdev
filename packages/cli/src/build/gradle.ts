import { execa } from "execa";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ResolvedConfig } from "../config/loader.js";
import type { DetectedProject } from "../detect/project.js";
import { info } from "../util/log.js";
import { Errors } from "../util/errors.js";

export interface BuildResult {
  jarPath: string;
  task: string;
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
  await execa(gradlew, gradleArgs, { cwd, stdio: "inherit" });
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
  await execa(gradlew, [...args, "--quiet"], { cwd, stdio: "inherit" });
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
      await execa(gradlew, [t, "-x", "test", "--quiet"], { cwd, stdio: "inherit" });
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

export async function runMavenBuild(cwd: string): Promise<BuildResult> {
  try {
    await execa("mvn", ["package", "-DskipTests", "-q"], { cwd, stdio: "inherit" });
  } catch (e) {
    throw Errors.buildFailed(
      "package",
      e instanceof Error ? e.message : String(e),
    );
  }
  const jarPath = await findMavenJar(cwd);
  return { jarPath, task: "package" };
}

function matchGlob(name: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$",
  );
  return regex.test(name);
}

async function findJarByPattern(
  cwd: string,
  pattern: string,
  task: string,
): Promise<string> {
  const normalized = pattern.replace(/\\/g, "/");
  const dirPart = normalized.includes("/")
    ? join(cwd, normalized.slice(0, normalized.lastIndexOf("/")))
    : cwd;
  const globPart = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;

  const files = await readdir(dirPart);
  const jars = files.filter(
    (f) =>
      f.endsWith(".jar") &&
      !f.includes("-sources") &&
      !f.includes("-javadoc") &&
      matchGlob(f, globPart),
  );
  if (jars.length === 0) throw Errors.noJarFound(task);
  const chosen = jars.sort().pop()!;
  return join(dirPart, chosen);
}

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

async function findMavenJar(cwd: string): Promise<string> {
  const targetDir = join(cwd, "target");
  const files = await readdir(targetDir);
  const jar = files.find(
    (f) => f.endsWith(".jar") && !f.includes("sources") && !f.includes("javadoc"),
  );
  if (!jar) throw Errors.noJarFound("package");
  return join(targetDir, jar);
}

export async function deployPluginJar(
  jarPath: string,
  pluginsDir: string,
  devPluginName?: string,
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
