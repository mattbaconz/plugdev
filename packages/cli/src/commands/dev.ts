import { access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";
import type { ChildProcess } from "node:child_process";
import { detectProject } from "../detect/project.js";
import { loadConfig, type CliOverrides, type ResolvedConfig } from "../config/loader.js";
import { ensureServerJar, resolveServerProject } from "../cache/server.js";
import {
  prepareRunDirectory,
  copyPaperToRun,
  writeReloadTrigger,
} from "../cache/run-template.js";
import { runGradleBuild, runMavenBuild, deployPluginJar, deployBootstrapJar, runModGradle } from "../build/gradle.js";
import {
  startPaperServer,
  attachShutdownHooks,
  printReadyBanner,
  stopPaperServer,
} from "../process/spawner.js";
import { installDeps } from "../deps/hangar.js";
import { startPluginWatcher, startModWatchOrchestrator } from "../watch/watcher.js";
import { launchClient } from "../client/launch.js";
import { projectRunDir, bootstrapCacheDir } from "../paths.js";
import { heading, info, step, error as logError } from "../util/log.js";
import { CLI_VERSION } from "../constants.js";
import { Errors, formatError, getExitCode, PlugDevError } from "../util/errors.js";
import { requireJava21 } from "../util/tools.js";
import { isPortAvailable } from "../util/port.js";
import type { DetectedProject } from "../detect/project.js";

async function resolveBootstrapJar(): Promise<string> {
  const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const candidates = [
    join(cliRoot, "bootstrap", "plugdev-bootstrap-paper.jar"),
    join(cliRoot, "bootstrap", `plugdev-bootstrap-paper-${CLI_VERSION}.jar`),
    join(cliRoot, "..", "bootstrap-paper", "build", "libs", "plugdev-bootstrap-paper.jar"),
    join(cliRoot, "..", "bootstrap-paper", "build", "libs", `plugdev-bootstrap-paper-${CLI_VERSION}.jar`),
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

  throw Errors.bootstrapMissing();
}

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

function printDetectionSummary(
  project: DetectedProject,
  config: ResolvedConfig,
): void {
  const buildLabel =
    config.build.system === "maven" ? "Maven" : "Gradle";
  const serverLabel = serverDisplayName(config.server);
  info(`Detected: ${buildLabel} + ${serverLabel} plugin`);
  info(`Minecraft: ${config.version}`);
  info(`Build task: ${config.build.jarTask}`);
  info(`Server: ${serverLabel}`);
  if (project.pluginName) info(`Plugin: ${project.pluginName}`);
}

function shouldJoinClient(overrides: CliOverrides): boolean {
  return overrides.join === true;
}

function handleDevError(err: unknown, debug: boolean): number {
  logError(formatError(err, debug));
  return getExitCode(err) ?? (err instanceof PlugDevError ? 2 : 1);
}

export async function runDev(
  cwd: string,
  overrides: CliOverrides & { watch?: boolean },
): Promise<number> {
  const debug = overrides.debug === true;

  try {
    const project = await detectProject(cwd);
    const config = await loadConfig(cwd, project, overrides);

    if (project.type === "unknown" && project.buildSystem === "none") {
      throw Errors.unknownProject();
    }

    heading(`PlugDev ${CLI_VERSION}\n`);

    if (config.type === "mod" || project.type === "mod") {
      return runModDev(cwd, config, project, overrides, debug);
    }

    if (project.buildSystem === "none" && project.type !== "mod") {
      throw Errors.noBuildSystem();
    }

    await requireJava21();

    if (config.build.system === "maven" || project.buildSystem === "maven") {
      return runPluginDev(cwd, config, project, overrides, async () =>
        runMavenBuild(cwd),
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
  info(`Detected: ${project.loader ?? "mod"} mod project`);
  info(`Minecraft: ${config.version}`);

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
  printDetectionSummary(project, config);

  const serverLabel = serverDisplayName(config.server);

  const serverProject = resolveServerProject(config.server);

  if (!(await isPortAvailable(config.port))) {
    throw Errors.portInUse(config.port);
  }

  const serverJarInfo = await ensureServerJar(config.version, serverProject);
  info(`Cache: ${serverJarInfo.cacheHit ? "hit" : "downloaded"}`);

  const runDir = await prepareRunDirectory(cwd, config);
  step("Preparing dev server...", "done");

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

    step("Building plugin...", "active");
    const build = await buildFn();
    step("Building plugin...", "done");

    const devJar = await deployPluginJar(
      build.jarPath,
      pluginsDir,
      project.pluginName,
    );
    await deployBootstrapJar(bootstrap, pluginsDir);

    if (first && config.deps?.length) {
      await installDeps(pluginsDir, config.deps, config.server, config.version);
    }

    await writeReloadTrigger(cwd, [devJar]);
    step("Copying plugin JAR...", "done");

    step(`Starting ${serverLabel}...`, "active");
    const { proc, waitForReady } = startPaperServer(
      runDir,
      serverJar,
      config.jvm.memory,
      config.jvm.debugPort > 0 ? config.jvm.debugPort : undefined,
      project.pluginName,
    );
    currentProc = proc;
    attachShutdownHooks(proc);

    await waitForReady;
    step(`Starting ${serverLabel}...`, "done");
    printReadyBanner(config.port, project.pluginName);

    if (shouldJoinClient(overrides)) {
      await launchClient({ config, waitForServer: false });
    }

    return proc;
  };

  try {
    await bootServer(true);

    if (watchEnabled(overrides)) {
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
    } else {
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
