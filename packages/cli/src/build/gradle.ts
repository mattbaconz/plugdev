import { execa } from "execa";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedConfig } from "../config/loader.js";
import type { DetectedProject } from "../detect/project.js";
import { info } from "../util/log.js";

export interface BuildResult {
  jarPath: string;
  task: string;
}

function gradlewCommand(cwd: string): string {
  return join(cwd, process.platform === "win32" ? "gradlew.bat" : "gradlew");
}

export async function runGradleBuild(
  cwd: string,
  config: ResolvedConfig,
  project: DetectedProject,
): Promise<BuildResult> {
  const gradlew = gradlewCommand(cwd);
  const task = config.build.jarTask;

  let gradleArgs: string[];
  if (project.type === "mod") {
    const sub = config.gradleSubproject;
    const modTask =
      config.devMode === "server"
        ? "runServer"
        : config.devMode === "datagen"
          ? config.loader === "neoforge"
            ? "runData"
            : "runDatagen"
          : "runClient";
    gradleArgs = sub ? [sub.replace(":", ""), modTask] : [modTask];
    if (modTask.startsWith("run")) {
      info(`Mod dev: delegating to Gradle ${gradleArgs.join(":")}`);
      await execa(gradlew, gradleArgs, { cwd, stdio: "inherit" });
      return { jarPath: "", task: modTask };
    }
  }

  const tasks = task === "shadowJar" ? ["shadowJar", "jar"] : [task];

  let lastError: unknown;
  for (const t of tasks) {
    try {
      info(`Building: ${gradlew} ${t} -x test --quiet`);
      await execa(gradlew, [t, "-x", "test", "--quiet"], { cwd, stdio: "inherit" });
      const jarPath = await findBuiltJar(cwd, t);
      return { jarPath, task: t };
    } catch (e) {
      lastError = e;
      if (t === tasks[tasks.length - 1]) break;
      info(`Task ${t} failed, trying fallback...`);
    }
  }
  throw lastError;
}

export async function runMavenBuild(cwd: string): Promise<BuildResult> {
  info("Building: mvn package -DskipTests");
  await execa("mvn", ["package", "-DskipTests", "-q"], { cwd, stdio: "inherit" });
  const jarPath = await findMavenJar(cwd);
  return { jarPath, task: "package" };
}

async function findBuiltJar(cwd: string, task: string): Promise<string> {
  const libsDir = join(cwd, "build", "libs");
  try {
    const files = await readdir(libsDir);
    const jars = files.filter((f) => f.endsWith(".jar") && !f.includes("-sources") && !f.includes("-javadoc"));
    if (jars.length === 0) throw new Error("No JAR in build/libs");
    // prefer non-classifier jar or shadow
    const shadow = jars.find((j) => j.includes("all") || !j.match(/-[\d.]+(?=\.jar$)/));
    const chosen = shadow ?? jars.sort().pop()!;
    return join(libsDir, chosen);
  } catch (e) {
    throw new Error(`Could not find built JAR after ${task}: ${e}`);
  }
}

async function findMavenJar(cwd: string): Promise<string> {
  const targetDir = join(cwd, "target");
  const files = await readdir(targetDir);
  const jar = files.find((f) => f.endsWith(".jar") && !f.includes("sources") && !f.includes("javadoc"));
  if (!jar) throw new Error("No JAR in target/");
  return join(targetDir, jar);
}

export async function deployPluginJar(
  jarPath: string,
  pluginsDir: string,
  devPluginName?: string,
  forReload = false,
): Promise<string> {
  await mkdir(pluginsDir, { recursive: true });
  const baseName = jarPath.split(/[/\\]/).pop()!;
  const dest = forReload
    ? join(
        pluginsDir,
        baseName.replace(/\.jar$/i, `-reload-${Date.now()}.jar`),
      )
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
