import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { runGradleBuild, runMavenBuild } from "../build/gradle.js";
import { heading, info, success } from "../util/log.js";
import { isJsonMode, emitJson } from "../util/output.js";
import { formatError, formatErrorJson, getExitCode } from "../util/errors.js";

export async function runBuild(cwd: string): Promise<number> {
  try {
    const project = await detectProject(cwd);
    const config = await loadConfig(cwd, project);

    if (!isJsonMode()) heading("PlugDev build\n");

    let result: { jarPath: string; task: string };
    if (project.buildSystem === "maven") {
      result = await runMavenBuild(cwd);
    } else {
      result = await runGradleBuild(cwd, config, project);
    }

    if (isJsonMode()) {
      emitJson({
        ok: true,
        data: {
          jarPath: result.jarPath,
          task: result.task,
          pluginName: project.pluginName,
        },
      });
      return 0;
    }

    success(`Built: ${result.jarPath}`);
    info(`Task: ${result.task}`);
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
