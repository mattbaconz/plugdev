import chokidar from "chokidar";
import { debounce } from "../util/debounce.js";
import type { ResolvedConfig } from "../config/loader.js";
import type { DetectedProject } from "../detect/project.js";
import { runGradleBuild, runMavenBuild, deployPluginJar } from "../build/gradle.js";
import { writeReloadTrigger } from "../cache/run-template.js";
import { projectRunDir } from "../paths.js";
import { join } from "node:path";
import { info, success, warn, error } from "../util/log.js";

export function startPluginWatcher(
  cwd: string,
  config: ResolvedConfig,
  project: DetectedProject,
  pluginName?: string,
): () => void {
  const paths = config.watch.paths.map((p) => join(cwd, p));
  info(`Watching ${paths.join(", ")} for changes...`);

  const rebuild = debounce(async (changedPath: string) => {
    if (changedPath.includes("plugin.yml") || changedPath.includes("paper-plugin.yml")) {
      warn("plugin.yml changed — full server restart required");
      return;
    }

    try {
      info(`[watch] ${changedPath.replace(cwd, ".")}`);
      const build =
        config.build.system === "maven"
          ? await runMavenBuild(cwd)
          : await runGradleBuild(cwd, config, project);

      const pluginsDir = join(projectRunDir(cwd), "plugins");
      const dest = await deployPluginJar(build.jarPath, pluginsDir, pluginName, true);
      await writeReloadTrigger(cwd, [dest]);
      success("Reload triggered (bootstrap will apply safe reload)");
    } catch (e) {
      error(`Watch build failed: ${e instanceof Error ? e.message : e}`);
    }
  }, config.watch.debounceMs);

  const watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200 },
  });

  watcher.on("change", rebuild);
  watcher.on("add", rebuild);

  return () => watcher.close();
}

export function startModWatchNotifier(
  cwd: string,
  config: ResolvedConfig,
): () => void {
  const paths = config.watch.paths.map((p) => join(cwd, p));
  info(`Watching ${paths.join(", ")} (mod tiered reload)...`);

  const notify = debounce(async (changedPath: string) => {
    const rel = changedPath.replace(cwd, ".");
    if (rel.includes("assets/")) {
      warn("[watch] Asset change → rebuild, then press F3+T in Minecraft");
      return;
    }
    if (rel.includes("data/")) {
      warn("[watch] Data change → rebuild, then run /reload in-game");
      return;
    }
    if (rel.endsWith(".java")) {
      warn("[watch] Java change → restart client required (or IDE hotswap if debugging)");
    }
  }, config.watch.debounceMs);

  const watcher = chokidar.watch(paths, { ignoreInitial: true });
  watcher.on("change", notify);
  watcher.on("add", notify);
  return () => watcher.close();
}
