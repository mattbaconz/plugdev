import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import {
  detectProject,
  detectFoliaSupport,
  formatDetectionSummary,
  type DetectedProject,
} from "../detect/project.js";
import { loadConfig, type CliOverrides, type ResolvedConfig } from "../config/loader.js";
import { ensureServerJar, resolveServerProject, isServerJarCached } from "../cache/server.js";
import {
  ensureEmbeddedClient,
  isEmbeddedClientReady,
} from "../client/prefetch.js";
import {
  prepareRunDirectory,
  copyPaperToRun,
  writeReloadList,
  bumpReloadTrigger,
  resolveWorldType,
} from "../cache/run-template.js";
import { applyExitCleanup, applyStartWorldCleanup } from "../cache/run-cleanup.js";
import { runGradleBuild, deployPluginJar, deployBootstrapJar, runModGradle } from "../build/gradle.js";
import { runMavenBuild } from "../build/maven.js";
import {
  startPaperServer,
  attachShutdownHooks,
  printReadyBanner,
  stopPaperServer,
} from "../process/spawner.js";
import { printServerConsoleSeparator } from "../process/server-log-stream.js";
import { attachInteractiveConsole, type InteractiveConsole } from "../process/interactive-console.js";
import { awaitWithSettledSibling } from "../util/fetch-retry.js";
import { installDeps } from "../deps/hangar.js";
import { installPlugTraceJar, writePlugDevIdentity } from "../deps/plugtrace.js";
import { startPluginWatcher, startModWatchOrchestrator, startDiscordBotWatcher } from "../watch/watcher.js";
import {
  startLiveConfigWatcher,
  type LiveConfigWatcherHandle,
} from "../live-config/watcher.js";
import { JOIN_HOST } from "../client/launch.js";
import { launchPlayers } from "../client/players.js";
import { banner, phase, info, warn, success, error as logError, resetPhases } from "../util/log.js";
import { createDownloadProgress, endDownloadProgress } from "../util/progress.js";
import { CLI_VERSION } from "../constants.js";
import { Errors, formatError, formatErrorJson, getExitCode, PlugDevError } from "../util/errors.js";
import {
  minJavaMajorForServerVersion,
  requireJava,
} from "../util/tools.js";
import { isPortAvailable } from "../util/port.js";
import { getLogMode, isJsonMode, emitJson } from "../util/output.js";
import { resolveBootstrapJar } from "../util/bootstrap.js";
import {
  captureReloadLogOffset,
  confirmReload,
} from "../util/reload-feedback.js";
import {
  writeSession,
  clearSession,
  generateRconPassword,
  type ServerSession,
} from "../session.js";
import { projectRunDir } from "../paths.js";
import { loadDotEnv, resolveBotTokenEnv } from "../util/dotenv.js";
import {
  resolveDiscordBotEntry,
  spawnDiscordBot,
  stopDiscordBot,
} from "../process/discord-bot.js";

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

    if (config.type === "discord-bot" || project.type === "discord-bot") {
      return await runDiscordBotDev(cwd, config, overrides, debug);
    }

    if (config.type === "mod" || project.type === "mod") {
      return await runModDev(cwd, config, project, overrides, debug);
    }

    if (project.buildSystem === "none" && project.type !== "mod") {
      throw Errors.noBuildSystem();
    }

    await requireJava(minJavaMajorForServerVersion(config.version));

    if (config.watch.reloadJava === "hotswap" && config.jvm.debugPort <= 0) {
      warn("Hotswap requested but JDWP port is 0 — enabling port 5005");
    }

    const serverLabel = serverDisplayName(config.server);
    phase(
      `Detect project — ${formatDetectionSummary(project, {
        version: config.version,
        jarTask: config.build.jarTask,
        server: serverLabel,
      })}`,
    );

    if (config.build.system === "maven" || project.buildSystem === "maven") {
      return await runPluginDev(cwd, config, project, overrides, async () =>
        runMavenBuild(cwd, config, project.pluginName),
      );
    }

    return await runPluginDev(cwd, config, project, overrides, async () =>
      runGradleBuild(cwd, config, project),
    );
  } catch (e) {
    return handleDevError(e, debug);
  }
}

async function runDiscordBotDev(
  cwd: string,
  config: ResolvedConfig,
  overrides: CliOverrides & { watch?: boolean },
  debug: boolean,
): Promise<number> {
  await loadDotEnv(cwd);
  const token = resolveBotTokenEnv(config.bot?.tokenEnv);
  if (!token.present) {
    throw new PlugDevError({
      what: "Discord bot token missing.",
      cause: `${token.name} (and DISCORD_BOT_TOKEN) are unset.`,
      fix: `Export ${token.name} or add it to a local .env file.`,
      hint: "Never commit the token. plugdev setup / doctor check for presence only.",
      code: 2,
    });
  }

  const plan = await resolveDiscordBotEntry(cwd, config.bot?.entry);
  phase(`Detect discord-bot — ${plan.label} · token ${token.name}`);

  let child: ChildProcess | undefined;
  let closeWatcher: (() => void) | undefined;
  let shuttingDown = false;

  const start = async () => {
    await stopDiscordBot(child);
    child = spawnDiscordBot({
      cwd,
      entry: plan.entry,
      useShell: plan.useShell,
    });
    child.on("exit", (code, signal) => {
      if (!shuttingDown && code !== 0 && signal !== "SIGTERM") {
        warn(`Bot exited (code=${code ?? "?"} signal=${signal ?? "none"})`);
      }
    });
  };

  await start();

  if (watchEnabled(overrides)) {
    closeWatcher = startDiscordBotWatcher(
      cwd,
      config,
      async () => {
        await start();
      },
      debug,
    );
  }

  return await new Promise<number>((resolve) => {
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      closeWatcher?.();
      await stopDiscordBot(child);
      resolve(0);
    };
    process.once("SIGINT", () => {
      void shutdown();
    });
    process.once("SIGTERM", () => {
      void shutdown();
    });
    if (!watchEnabled(overrides)) {
      child?.once("exit", (code) => {
        resolve(code ?? 0);
      });
    }
  });
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
    const folia = await detectFoliaSupport(cwd, config.build.module);
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
  const clientReady = prefetchClient
    ? await isEmbeddedClientReady(config.version)
    : true;
  const needsParallelPrefetch = !serverCached || (prefetchClient && !clientReady);

  const onDownloadProgress = createDownloadProgress(
    `Downloading ${serverLabel} ${config.version}…`,
  );

  let serverJarInfo: Awaited<ReturnType<typeof ensureServerJar>>;

  try {
    if (needsParallelPrefetch && prefetchClient && !serverCached && !clientReady) {
      phase(`Resolve ${serverLabel} ${config.version}`, "active");
      phase("Ensuring Minecraft client…", "active");
      serverJarInfo = await awaitWithSettledSibling(
        ensureServerJar(config.version, serverProject, {
          onProgress: (percent, label) => onDownloadProgress(percent, label),
        }),
        ensureEmbeddedClient(config.version),
      );
      phase(`Downloaded ${serverLabel} ${config.version}`);
      phase(`Minecraft client ${config.version} ready`);
    } else {
      phase(`Resolve ${serverLabel} ${config.version}`, "active");
      const serverPromise = ensureServerJar(config.version, serverProject, {
        onProgress: (percent, label) => onDownloadProgress(percent, label),
      });
      let clientPromise: Promise<unknown> | undefined;
      if (prefetchClient && !clientReady) {
        phase("Ensuring Minecraft client…", "active");
        clientPromise = ensureEmbeddedClient(config.version);
      }
      serverJarInfo = await awaitWithSettledSibling(serverPromise, clientPromise);
      phase(
        serverJarInfo.cacheHit
          ? `Cache hit — ${serverLabel} ${config.version}`
          : `Downloaded ${serverLabel} ${config.version}`,
      );
      if (prefetchClient && !clientReady) {
        phase(`Minecraft client ${config.version} ready`);
      } else if (prefetchClient && clientReady) {
        phase(`Cache hit — Minecraft client ${config.version}`);
      }
    }
  } finally {
    endDownloadProgress();
  }

  const rconPort = config.port + 10000;
  if (!(await isPortAvailable(rconPort))) {
    throw Errors.portInUse(rconPort);
  }
  const rconPassword = generateRconPassword();
  const rconHost = "127.0.0.1";

  const runDir = projectRunDir(cwd);
  const serverJar = await copyPaperToRun(runDir, serverJarInfo.jarPath);
  await prepareRunDirectory(cwd, config, {
    rconPort,
    rconPassword,
  });
  phase("Prepare dev server (.plugdev/run)");

  await applyStartWorldCleanup(cwd, config.run.cleanup);
  const pluginsDir = join(runDir, "plugins");
  const bootstrap = await resolveBootstrapJar();

  let currentProc: ChildProcess | undefined;
  let currentDetachLogs: (() => void) | undefined;
  let closeWatcher: (() => void) | undefined;
  let configWatcher: LiveConfigWatcherHandle | undefined;
  let consoleHandle: InteractiveConsole | undefined;

  const bootServer = async (first = false): Promise<ChildProcess> => {
    consoleHandle?.pause();

    if (currentProc) {
      currentDetachLogs?.();
      currentDetachLogs = undefined;
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

    if (config.integrations.plugtrace.enabled) {
      if (first) phase("Install PlugTrace", "active");
      await installPlugTraceJar(cwd, pluginsDir, config.integrations.plugtrace, config.server);
      if (first) phase("Install PlugTrace");
    }

    // Install missing deps on every boot (skip JARs already in plugins/)
    if (config.deps?.length) {
      if (first) phase("Install test deps", "active");
      await installDeps(pluginsDir, config.deps, config.server, config.version);
      if (first) phase("Install test deps");
    }

    await writePlugDevIdentity({
      cwd,
      runDir,
      projectName: project.pluginName,
      buildSystem: config.build.system,
      buildTask: build.task,
      projectJarPath: build.jarPath,
      sessionId: undefined,
    });

    await writeReloadList(cwd, [devJar]);
    phase("Sync plugin JAR to server");

    phase(`Start ${serverLabel}`, "active");
    const { proc, waitForReady, detachLogs } = startPaperServer(
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
    currentDetachLogs = detachLogs;
    attachShutdownHooks(proc);

    await waitForReady;
    phase(`Start ${serverLabel} — ready on port ${config.port}`);

    const session: ServerSession = {
      pid: proc.pid!,
      gamePort: config.port,
      rconPort,
      rconPassword,
      rconHost,
      runDir: projectRunDir(cwd),
      version: config.version,
      software: config.server,
      pluginName: project.pluginName,
      startedAt: new Date().toISOString(),
    };
    await writeSession(cwd, session);
    proc.on("exit", () => {
      void clearSession(cwd);
    });

    if (isJsonMode()) {
      emitJson({
        ok: true,
        data: {
          event: "server_ready",
          port: config.port,
          rconPort,
          version: config.version,
          software: config.server,
          pluginName: project.pluginName,
          join: `${JOIN_HOST}:${config.port}`,
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
      printServerConsoleSeparator();
    }

    if (!consoleHandle) {
      consoleHandle = attachInteractiveConsole({
        host: rconHost,
        port: rconPort,
        password: rconPassword,
        liveConfig: {
          cwd,
          pluginName: project.pluginName,
        },
      });
    } else {
      consoleHandle.resume();
    }

    // Auto-join only on first boot — watcher restarts would Quick Play while the
    // port is still coming back up ("Failed to Quick Play" / connection refused).
    if (first && shouldJoinClient(overrides, config)) {
      phase("Launch Minecraft client", "active");
      await launchPlayers({
        config,
        host: JOIN_HOST,
        // TCP probe after log-ready — closes the race before Quick Play
        waitForServer: true,
      });
      phase("Launch Minecraft client");
    }

    return proc;
  };

  try {
    await bootServer(true);

    if (watchEnabled(overrides)) {
      phase("Watch src/ for changes");
      configWatcher = await startLiveConfigWatcher({
        cwd,
        pluginName: project.pluginName!,
        reloadMode: config.watch.reloadJava,
        debounceMs: config.watch.debounceMs,
        onSafeReload: async (changedPath) => {
          const offset = await captureReloadLogOffset(cwd);
          await bumpReloadTrigger(cwd);
          const ok = await confirmReload(cwd, 10_000, offset, { silentSuccess: true });
          if (!isJsonMode()) {
            if (ok) {
              success(`Config applied: ${changedPath}`);
              success("Plugin reloaded — test it in Minecraft");
            } else {
              warn(
                `Config changed (${changedPath}) but reload was not confirmed — check server logs`,
              );
            }
          }
        },
        onRestart: async () => {
          await bootServer(false);
        },
      });
      closeWatcher = startPluginWatcher(
        cwd,
        config,
        project,
        project.pluginName,
        {
          onSafeReload: async () => {
            configWatcher?.pause();
          },
          onReloadSettled: async () => {
            await configWatcher?.resume();
          },
          onRestart: async () => {
            configWatcher?.pause();
            try {
              await bootServer(false);
            } finally {
              await configWatcher?.resume();
            }
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
    await configWatcher?.close();
    consoleHandle?.close();
    currentDetachLogs?.();
    await clearSession(cwd);
    await applyExitCleanup(cwd, config.run.cleanup);
    return 0;
  } catch (e) {
    closeWatcher?.();
    await configWatcher?.close();
    consoleHandle?.close();
    currentDetachLogs?.();
    if (currentProc) await stopPaperServer(currentProc);
    await clearSession(cwd);
    await applyExitCleanup(cwd, config.run.cleanup);
    return handleDevError(e, debug);
  }
}
