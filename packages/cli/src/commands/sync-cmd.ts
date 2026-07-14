import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import {
  runGradleBuild,
  deployPluginJar,
  deployBootstrapJar,
} from "../build/gradle.js";
import { runMavenBuild } from "../build/maven.js";
import { projectRunDir, bootstrapCacheDir } from "../paths.js";
import { prepareRunDirectory, writeReloadTrigger } from "../cache/run-template.js";
import { installPlugTraceJar, writePlugDevIdentity } from "../deps/plugtrace.js";
import { heading, info, success } from "../util/log.js";
import { isJsonMode, emitJson } from "../util/output.js";
import { formatError, formatErrorJson, getExitCode } from "../util/errors.js";
import { CLI_VERSION } from "../constants.js";

async function resolveBootstrapJar(): Promise<string> {
  const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const candidates = [
    join(cliRoot, "bootstrap", "plugdev-bootstrap-paper.jar"),
    join(cliRoot, "bootstrap", `plugdev-bootstrap-paper-${CLI_VERSION}.jar`),
    join(cliRoot, "..", "bootstrap-paper", "build", "libs", "plugdev-bootstrap-paper.jar"),
    join(bootstrapCacheDir(), `plugdev-bootstrap-paper-${CLI_VERSION}.jar`),
  ];
  for (const p of candidates) {
    try {
      await access(p, constants.F_OK);
      return p;
    } catch {
      // try next
    }
  }
  throw new Error("Bootstrap plugin JAR not found. Run npm run build in plugdev repo.");
}

export async function runSync(cwd: string, jarPath?: string): Promise<number> {
  try {
    const project = await detectProject(cwd);
    const config = await loadConfig(cwd, project);

    if (!isJsonMode()) heading("PlugDev sync\n");

    let builtJar = jarPath;
    if (!builtJar) {
      const build =
        project.buildSystem === "maven" || config.build.system === "maven"
          ? await runMavenBuild(cwd, config)
          : await runGradleBuild(cwd, config, project);
      builtJar = build.jarPath;
    }

    await prepareRunDirectory(cwd, config);
    const runDir = projectRunDir(cwd);
    const pluginsDir = join(runDir, "plugins");
    const devJar = await deployPluginJar(builtJar, pluginsDir, project.pluginName);
    const bootstrap = await resolveBootstrapJar();
    await deployBootstrapJar(bootstrap, pluginsDir);

    if (config.integrations.plugtrace.enabled) {
      await installPlugTraceJar(cwd, pluginsDir, config.integrations.plugtrace, config.server);
    }
    await writePlugDevIdentity({
      cwd,
      runDir,
      projectName: project.pluginName,
      buildSystem: config.build.system,
      buildTask: config.build.task,
      projectJarPath: builtJar,
    });

    await writeReloadTrigger(cwd, [devJar]);

    if (isJsonMode()) {
      emitJson({
        ok: true,
        data: {
          syncedPath: devJar,
          reloadTriggered: true,
          pluginName: project.pluginName,
        },
      });
      return 0;
    }

    success(`Synced: ${devJar}`);
    info("Reload trigger written (safe reload if server running)");
    return 0;
  } catch (e) {
    if (isJsonMode()) {
      emitJson(formatErrorJson(e, false));
      return getExitCode(e) ?? 1;
    }
    console.error(formatError(e, false));
    return getExitCode(e) ?? 1;
  }
}
