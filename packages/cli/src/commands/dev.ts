import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { detectProject } from "../detect/project.js";
import { loadConfig, type CliOverrides, type ResolvedConfig } from "../config/loader.js";
import { ensureServerJar, resolveServerProject, isServerJarCached } from "../cache/server.js";
import {
  isEmbeddedClientCached,
  prefetchEmbeddedClient,
} from "../client/prefetch.js";
import {
  prepareRunDirectory,
  copyPaperToRun,
  writeReloadTrigger,
  resolveWorldType,
} from "../cache/run-template.js";
import { runGradleBuild, deployPluginJar, deployBootstrapJar, runModGradle } from "../build/gradle.js";
import { runMavenBuild } from "../build/maven.js";
import {
  startPaperServer,
  attachShutdownHooks,
  printReadyBanner,
  stopPaperServer,
} from "../process/spawner.js";
import { installDeps } from "../deps/hangar.js";
import { startPluginWatcher, startModWatchOrchestrator } from "../watch/watcher.js";
import { launchClient } from "../client/launch.js";
import { banner, phase, info, warn, error as logError, resetPhases } from "../util/log.js";
import { createDownloadProgress, endDownloadProgress } from "../util/progress.js";
import { CLI_VERSION } from "../constants.js";
import { Errors, formatError, formatErrorJson, getExitCode, PlugDevError } from "../util/errors.js";
import { requireJava21 } from "../util/tools.js";
import { isPortAvailable } from "../util/port.js";
import { getLogMode, isJsonMode, emitJson } from "../util/output.js";
import { resolveBootstrapJar } from "../util/bootstrap.js";
import { detectFoliaSupport } from "../detect/project.js";
import type { DetectedProject } from "../detect/project.js";

function watchEnabled(overrides: CliOverrides & { watch?: boolean }): boolean {
  if (overrides.noWatch) return false;
  if (process.env.CI === "true") return false;
  return overrides.watch !== false;
}

function serverDisplayName(server: string): string {
  switch (server) {
    case "folia":
      return "Folia";
    case "purpur":
      return "Purpur";
    case "pufferfish":
      return "Pufferfish";
    case "spigot":
      return "Spigot";
    default:
      return "Paper";
  }
}

function shouldJoinClient(
  overrides: CliOverrides,
  config: ResolvedConfig,
): boolean {
  if (overrides.join === true) return true;
  if (overrides.join === false) return false;
  return config.client?.joinOnReady === true;
}

function handleDevError(err: unknown, debug: boolean): number {
  if (isJsonMode()) {
    emitJson(formatErrorJson(err, debug));
    return getExitCode(err) ?? (err instanceof PlugDevError ? 2 : 1);
  }
  logError(formatError(err, debug));
  return getExitCode(err) ?? (err instanceof PlugDevError ? 2 : 1);
}

export async function runDev(
  cwd: string,
  overrides: CliOverrides & { watch?: boolean },
): Promise<number> {
  const debug = overrides.debug === true;

  try {
    resetPhases();
    const project = await detectProject(cwd);
    const config = await loadConfig(cwd, project, overrides);

    if (project.type === "unknown" && project.buildSystem === "none") {
      throw Errors.unknownProject();
    }

    if (!isJsonMode()) banner(CLI_VERSION);

    if (config.type === "mod" || project.type === "mod") {
      return runModDev(cwd, config, project, overrides, debug);
    }

    if (project.buildSystem === "none" && project.type !== "mod") {
      throw Errors.noBuildSystem();
    }

    await requireJava21();

    const buildLabel = config.build.system === "maven" ? "Maven" : "Gradle";
    const serverLabel = serverDisplayName(config.server);
    phase(
      `Detect project — ${buildLabel} + ${serverLabel}` +
        (project.pluginName ? ` (${project.pluginName})` : ""),
    );

    if (config.build.system === "maven" || project.buildSystem === "maven") {
      return runPluginDev(cwd, config, project, overrides, async () =>
        runMavenBuild(cwd, config),
      );
    }

    return runPluginDev(cwd, config, project, overrides, async () =>
      runGradleBuild(cwd, config, project),
    );
  } catch (e) {
    return handleDevError(e, debug);
  }
}

async function runModDev(
  cwd: string,
  config: ResolvedConfig,
  project: DetectedProject,
  overrides: CliOverrides & { watch?: boolean },
  debug: boolean,
): Promise<number> {
  phase(`Detect mod project — ${project.loader ?? "mod"} · MC ${config.version}`);

  let closeWatcher: (() => void) | undefined;

  if (watchEnabled(overrides)) {
    closeWatcher = startModWatchOrchestrator(cwd, config, project, debug);
  }

  try {
    await runModGradle(cwd, config, project);
    closeWatcher?.();
    return 0;
  } catch (e) {
    closeWatcher?.();
    return handleDevError(e, debug);
  }
}

async function runPluginDev(
  cwd: string,
  config: ResolvedConfig,
  project: DetectedProject,
  overrides: CliOverrides & { watch?: boolean },
  buildFn: () => Promise<{ jarPath: string; task: string }>,
): Promise<number> {
  const debug = overrides.debug === true;
  const logMode = getLogMode();
  const serverLabel = serverDisplayName(config.server);
  const serverProject = resolveServerProject(config.server);

  if (!(await isPortAvailable(config.port))) {
    throw Errors.portInUse(config.port);
  }

  if (config.server === "folia") {
    const folia = await detectFoliaSupport(cwd);
    if (folia !== "declared") {
      warn(
        "Folia: plugin metadata does not declare Folia support — prefer watch.reloadJava: restart",
      );
    } else {
      warn(
        "Folia: safe plugin reload may be unsafe on regionized servers — prefer full restart after code changes",
      );
    }
  }

  const prefetchClient = shouldJoinClient(overrides, config);
  const serverCached = await isServerJarCached(config.version, serverProject);
  const clientCached = prefetchClient
    ? await isEmbeddedClientCached(config.version)
    : true;
  const needsParallelPrefetch = !serverCached || (prefetchClient && !clientCached);

  const onDownloadProgress = createDownloadProgress(
    `Downloading ${serverLabel} ${config.version}…`,
  );

  let serverJarInfo: Awaited<ReturnType<typeof ensureServerJar>>;

  try {
    if (needsParallelPrefetch && prefetchClient && !serverCached && !clientCached) {
      phase(`Resolve ${serverLabel} ${config.version}`, "active");
      phase("Downloading Minecraft client…", "active");
      const [jar] = await Promise.all([
        ensureServerJar(config.version, serverProject, {
          onProgress: (percent, label) => onDownloadProgress(percent, label),
        }),
        prefetchEmbeddedClient(config.version),
      ]);
      serverJarInfo = jar;
      phase(`Downloaded ${serverLabel} ${config.version}`);
      phase(`Downloaded Minecraft client ${config.version}`);
    } else {
      phase(`Resolve ${serverLabel} ${config.version}`, "active");
      const tasks: Promise<unknown>[] = [
        ensureServerJar(config.version, serverProject, {
          onProgress: (percent, label) => onDownloadProgress(percent, label),
        }),
      ];
      if (prefetchClient && !clientCached) {
        phase("Downloading Minecraft client…", "active");
        tasks.push(prefetchEmbeddedClient(config.version));
      }
      const results = await Promise.all(tasks);
      serverJarInfo = results[0] as Awaited<ReturnType<typeof ensureServerJar>>;
      phase(
        serverJarInfo.cacheHit
          ? `Cache hit — ${serverLabel} ${config.version}`
          : `Downloaded ${serverLabel} ${config.version}`,
      );
      if (prefetchClient && !clientCached) {
        phase(`Downloaded Minecraft client ${config.version}`);
      } else if (prefetchClient && clientCached) {
        phase(`Cache hit — Minecraft client ${config.version}`);
      }
    }
  } finally {
    endDownloadProgress();
  }

  const runDir = await prepareRunDirectory(cwd, config);
  phase("Prepare dev server (.plugdev/run)");

  const serverJar = await copyPaperToRun(runDir, serverJarInfo.jarPath);
  const pluginsDir = join(runDir, "plugins");
  const bootstrap = await resolveBootstrapJar();

  let currentProc: ChildProcess | undefined;
  let closeWatcher: (() => void) | undefined;

  const bootServer = async (first = false): Promise<ChildProcess> => {
    if (currentProc) {
      await stopPaperServer(currentProc);
      currentProc = undefined;
    }

    phase("Build plugin", "active");
    const build = await buildFn();
    phase(`Build plugin (${build.task})`);

    const devJar = await deployPluginJar(
      build.jarPath,
      pluginsDir,
      project.pluginName,
    );
    await deployBootstrapJar(bootstrap, pluginsDir);

    // Install missing deps on every boot (skip JARs already in plugins/)
    if (config.deps?.length) {
      if (first) phase("Install compat deps (Via*)", "active");
      await installDeps(pluginsDir, config.deps, config.server, config.version);
      if (first) phase("Install compat deps (Via*)");
    }

    await writeReloadTrigger(cwd, [devJar]);
    phase("Sync plugin JAR to server");

    phase(`Start ${serverLabel}`, "active");
    const { proc, waitForReady } = startPaperServer(
      runDir,
      serverJar,
      config.jvm.memory,
      config.jvm.debugPort > 0 ? config.jvm.debugPort : undefined,
      project.pluginName,
      logMode,
      false,
      config.jvm.args,
    );
    currentProc = proc;
    attachShutdownHooks(proc);

    await waitForReady;
    phase(`Start ${serverLabel} — ready on port ${config.port}`);

    if (isJsonMode()) {
      emitJson({
        ok: true,
        data: {
          event: "server_ready",
          port: config.port,
          version: config.version,
          software: config.server,
          pluginName: project.pluginName,
          join: `localhost:${config.port}`,
        },
      });
    } else {
      printReadyBanner(config.port, project.pluginName, {
        worldType: resolveWorldType(config),
        gamemode: config.dev?.gamemode ?? "creative",
        peaceful: config.dev?.peaceful !== false,
        onlineMode: config.dev?.onlineMode === true,
        op: config.dev?.op !== false,
      });
    }

    if (shouldJoinClient(overrides, config)) {
      phase("Launch Minecraft client", "active");
      await launchClient({ config, waitForServer: false });
      phase("Launch Minecraft client");
    }

    return proc;
  };

  try {
    await bootServer(true);

    if (watchEnabled(overrides)) {
      phase("Watch src/ for changes");
      closeWatcher = startPluginWatcher(
        cwd,
        config,
        project,
        project.pluginName,
        {
          onSafeReload: async () => {
            // bootstrap ReloadWatcher handles trigger file
          },
          onRestart: async () => {
            await bootServer(false);
          },
        },
        debug,
      );
    } else if (!isJsonMode()) {
      info("Watch disabled (--no-watch or CI=true)");
    }

    await new Promise<void>((resolve) => {
      currentProc?.on("exit", () => resolve());
    });
    closeWatcher?.();
    return 0;
  } catch (e) {
    closeWatcher?.();
    if (currentProc) await stopPaperServer(currentProc);
    return handleDevError(e, debug);
  }
}
