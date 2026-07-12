import chokidar from "chokidar";
import { debounce } from "../util/debounce.js";
import type { ResolvedConfig } from "../config/loader.js";
import type { DetectedProject } from "../detect/project.js";
import { runGradleBuild, deployPluginJar, runGradleTask } from "../build/gradle.js";
import { runMavenBuild } from "../build/maven.js";
import { writeReloadTrigger } from "../cache/run-template.js";
import { projectRunDir } from "../paths.js";
import { join } from "node:path";
import { info, success, warn, error } from "../util/log.js";
import { formatError, formatErrorJson } from "../util/errors.js";
import { isJsonMode, emitJson } from "../util/output.js";
import { confirmReload } from "../util/reload-feedback.js";
import { attemptHotswap } from "../hotswap/redefine.js";
import { execa } from "execa";

export interface PluginWatcherCallbacks {
  onSafeReload: (jarPath: string) => Promise<void>;
  onRestart: () => Promise<void>;
}

async function fastCompile(
  cwd: string,
  config: ResolvedConfig,
): Promise<boolean> {
  try {
    if (config.build.system === "maven") {
      const { resolveMavenCommand } = await import("../build/maven.js");
      const { command } = await resolveMavenCommand(cwd);
      const compileArgs = config.build.module
        ? ["-pl", config.build.module, "-am", "compile", "-DskipTests", "-q"]
        : ["compile", "-DskipTests", "-q"];
      await execa(command, compileArgs, { cwd, stdio: "inherit" });
      return true;
    }
    const gradlew =
      process.platform === "win32"
        ? join(cwd, "gradlew.bat")
        : join(cwd, "gradlew");
    await execa(gradlew, ["classes", "-x", "test", "--quiet"], {
      cwd,
      stdio: "inherit",
    });
    return true;
  } catch {
    return false;
  }
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

      // Optional hotswap fast path (method bodies)
      if (reloadMode === "hotswap") {
        const compiled = await fastCompile(cwd, config);
        if (compiled) {
          const hs = await attemptHotswap({
            cwd,
            debugPort: config.jvm.debugPort > 0 ? config.jvm.debugPort : 5005,
          });
          if (hs.ok) {
            return;
          }
          warn("Falling back to safe reload");
        } else {
          warn("Fast compile failed — falling back to safe reload");
        }
      }

      const build =
        config.build.system === "maven"
          ? await runMavenBuild(cwd, config)
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
      await confirmReload(cwd);
    } catch (e) {
      if (isJsonMode()) {
        emitJson(formatErrorJson(e, debug));
      } else {
        error(formatError(e, debug));
      }
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

    const lower = changedPath.replace(/\\/g, "/").toLowerCase();
    try {
      if (lower.includes("/assets/") || lower.endsWith(".png") || lower.endsWith(".json") && lower.includes("assets")) {
        await runGradleTask(cwd, config, project, "processResources");
        info("→ Press F3+T in Minecraft to reload resources");
        return;
      }
      if (lower.includes("/data/")) {
        await runGradleTask(cwd, config, project, "processResources");
        info("→ Run /reload on the integrated server");
        return;
      }

      if (config.watch.reloadJava === "hotswap") {
        try {
          await runGradleTask(cwd, config, project, "classes");
          const hs = await attemptHotswap({
            cwd,
            debugPort: config.jvm.debugPort > 0 ? config.jvm.debugPort : 5005,
          });
          if (hs.ok) return;
        } catch {
          // fall through to restart hint
        }
        warn("Java change → restart Minecraft client (or use IDE hotswap while debugging)");
        return;
      }

      await runGradleTask(cwd, config, project, "classes");
      warn("Java change → restart Minecraft client (or use IDE hotswap while debugging)");
    } catch (e) {
      if (isJsonMode()) {
        emitJson(formatErrorJson(e, debug));
      } else {
        error(formatError(e, debug));
      }
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

export function startDiscordBotWatcher(
  cwd: string,
  config: ResolvedConfig,
  onRestart: () => Promise<void>,
  debug = false,
): () => void {
  const paths = config.watch.paths.map((p) => join(cwd, p));
  info(`Watching ${paths.join(", ")} (discord-bot restart)...`);

  const handleChange = debounce(async (changedPath: string) => {
    info(`[watch] ${changedPath.replace(cwd, ".")}`);
    try {
      await onRestart();
      success("Bot process restarted");
    } catch (e) {
      error(formatError(e, debug));
    }
  }, config.watch.debounceMs);

  const watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    ignored: [
      "**/node_modules/**",
      "**/.git/**",
      "**/plugdev.yml",
      "**/.env",
    ],
    awaitWriteFinish: { stabilityThreshold: 200 },
  });

  watcher.on("change", handleChange);
  watcher.on("add", handleChange);

  return () => watcher.close();
}
