import { detectProject } from "../detect/project.js";
import { loadConfig, type CliOverrides } from "../config/loader.js";
import { runGradleBuild } from "../build/gradle.js";
import { runMavenBuild } from "../build/maven.js";
import { heading, info, success } from "../util/log.js";
import { isJsonMode, emitJson } from "../util/output.js";
import { formatError, formatErrorJson, getExitCode } from "../util/errors.js";

export async function runBuild(
  cwd: string,
  overrides: CliOverrides = {},
): Promise<number> {
  try {
    const project = await detectProject(cwd);
    const config = await loadConfig(cwd, project, overrides);

    if (!isJsonMode()) heading("PlugDev build\n");

    let result: { jarPath: string; task: string };
    if (project.buildSystem === "maven" || config.build.system === "maven") {
      result = await runMavenBuild(cwd, config);
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
          module: config.build.module,
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
