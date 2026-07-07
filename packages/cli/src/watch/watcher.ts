import chokidar from "chokidar";
import { debounce } from "../util/debounce.js";
import type { ResolvedConfig } from "../config/loader.js";
import type { DetectedProject } from "../detect/project.js";
import { runGradleBuild, runMavenBuild, deployPluginJar, runGradleTask } from "../build/gradle.js";
import { writeReloadTrigger } from "../cache/run-template.js";
import { projectRunDir } from "../paths.js";
import { join } from "node:path";
import { info, success, warn, error } from "../util/log.js";
import { formatError } from "../util/errors.js";

export interface PluginWatcherCallbacks {
  onSafeReload: (jarPath: string) => Promise<void>;
  onRestart: () => Promise<void>;
}

export function startPluginWatcher(
  cwd: string,
  config: ResolvedConfig,
  project: DetectedProject,
  pluginName: string | undefined,
  callbacks: PluginWatcherCallbacks,
  debug = false,
): () => void {
  const paths = config.watch.paths.map((p) => join(cwd, p));
  info(`Watching ${paths.join(", ")} for changes...`);

  const reloadMode = config.watch.reloadJava;

  const rebuild = debounce(async (changedPath: string) => {
    const isMetadataChange =
      changedPath.includes("plugin.yml") ||
      changedPath.includes("paper-plugin.yml");

    if (isMetadataChange) {
      warn("plugin.yml changed — restarting dev server...");
      try {
        await callbacks.onRestart();
        success("Server restarted after plugin.yml change");
      } catch (e) {
        error(formatError(e, debug));
      }
      return;
    }

    try {
      info(`[watch] ${changedPath.replace(cwd, ".")}`);
      const build =
        config.build.system === "maven"
          ? await runMavenBuild(cwd)
          : await runGradleBuild(cwd, config, project);

      if (reloadMode === "restart") {
        await callbacks.onRestart();
        success("Server restarted after code change");
        return;
      }

      const pluginsDir = join(projectRunDir(cwd), "plugins");
      const dest = await deployPluginJar(build.jarPath, pluginsDir, pluginName, true);
      await writeReloadTrigger(cwd, [dest]);
      await callbacks.onSafeReload(dest);
      success("Reload triggered (bootstrap will apply safe reload)");
    } catch (e) {
      error(formatError(e, debug));
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

export function startModWatchOrchestrator(
  cwd: string,
  config: ResolvedConfig,
  project: DetectedProject,
  debug = false,
): () => void {
  const paths = config.watch.paths.map((p) => join(cwd, p));
  info(`Watching ${paths.join(", ")} (mod tiered reload)...`);
  warn("Mods cannot safe-reload like plugins — follow tier hints below");

  const handleChange = debounce(async (changedPath: string) => {
    const rel = changedPath.replace(cwd, ".");
    info(`[watch] ${rel}`);

    try {
      if (rel.includes("assets/")) {
        await runGradleTask(cwd, config, project, "processResources");
        warn("Asset change → press F3+T in Minecraft to reload resources");
        return;
      }
      if (rel.includes("data/")) {
        await runGradleTask(cwd, config, project, "processResources");
        warn("Data change → run /reload in-game (or restart client if it fails)");
        return;
      }
      if (rel.endsWith(".java")) {
        await runGradleTask(cwd, config, project, "classes");
        warn("Java change → restart Minecraft client (or use IDE hotswap while debugging)");
        return;
      }
      await runGradleTask(cwd, config, project, "build");
      warn("Source change → restart Minecraft client recommended");
    } catch (e) {
      error(formatError(e, debug));
    }
  }, config.watch.debounceMs);

  const watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200 },
  });

  watcher.on("change", handleChange);
  watcher.on("add", handleChange);
  return () => watcher.close();
}

/** @deprecated use startModWatchOrchestrator */
export function startModWatchNotifier(
  cwd: string,
  config: ResolvedConfig,
): () => void {
  return startModWatchOrchestrator(cwd, config, { type: "mod", buildSystem: "gradle", hasShadowJar: false }, false);
}
