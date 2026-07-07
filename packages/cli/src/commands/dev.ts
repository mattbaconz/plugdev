import { access, copyFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";
import { detectProject } from "../detect/project.js";
import { loadConfig, type CliOverrides } from "../config/loader.js";
import { ensurePaperJar } from "../cache/fill.js";
import {
  prepareRunDirectory,
  copyPaperToRun,
  writeReloadTrigger,
} from "../cache/run-template.js";
import {
  runGradleBuild,
  runMavenBuild,
  deployPluginJar,
  deployBootstrapJar,
} from "../build/gradle.js";
import {
  startPaperServer,
  attachShutdownHooks,
  printReadyBanner,
} from "../process/spawner.js";
import { installDeps } from "../deps/hangar.js";
import { startPluginWatcher, startModWatchNotifier } from "../watch/watcher.js";
import { projectRunDir, bootstrapCacheDir } from "../paths.js";
import { heading, info, success, error } from "../util/log.js";
import { CLI_VERSION } from "../constants.js";

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

  throw new Error(
    "Bootstrap plugin JAR not found. Run: npm run build:bootstrap from plugdev repo root.",
  );
}

export async function runDev(
  cwd: string,
  overrides: CliOverrides & { watch?: boolean },
): Promise<number> {
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project, overrides);

  if (project.type === "unknown" && config.type === "plugin") {
    // allow default plugin mode
  }

  heading(`PlugDev ${CLI_VERSION}\n`);

  if (config.type === "mod" || project.type === "mod") {
    info(`Detected: ${project.loader ?? "mod"} mod project`);
    if (overrides.watch !== false) {
      startModWatchNotifier(cwd, config);
    }
    await runGradleBuild(cwd, config, { ...project, type: "mod" });
    return 0;
  }

  if (config.build.system === "maven" || project.buildSystem === "maven") {
    info("Detected: Maven Paper plugin");
    return runPluginDev(cwd, config, project, overrides, async () => runMavenBuild(cwd));
  }

  info(
    `Detected: Gradle Paper plugin${project.pluginName ? ` (${project.pluginName})` : ""}`,
  );
  return runPluginDev(cwd, config, project, overrides, async () =>
    runGradleBuild(cwd, config, project),
  );
}

async function runPluginDev(
  cwd: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  project: Awaited<ReturnType<typeof detectProject>>,
  overrides: CliOverrides & { watch?: boolean },
  buildFn: () => Promise<{ jarPath: string; task: string }>,
): Promise<number> {
  const paperProject = config.server === "folia" ? "folia" : "paper";
  info(`Resolving ${paperProject} ${config.version}...`);
  const paper = await ensurePaperJar(config.version, paperProject as "paper" | "folia");

  const runDir = await prepareRunDirectory(cwd, config);
  const serverJar = await copyPaperToRun(runDir, paper.jarPath);
  const pluginsDir = join(runDir, "plugins");

  info("Building plugin...");
  const build = await buildFn();
  const devJar = await deployPluginJar(build.jarPath, pluginsDir, project.pluginName);

  try {
    const bootstrap = await resolveBootstrapJar();
    await deployBootstrapJar(bootstrap, pluginsDir);
  } catch (e) {
    error(String(e));
    return 2;
  }

  if (config.deps?.length) {
    await installDeps(pluginsDir, config.deps);
  }

  await writeReloadTrigger(cwd, [devJar]);

  info("Starting dev server...");
  const { proc, waitForReady } = startPaperServer(
    runDir,
    serverJar,
    config.jvm.memory,
    config.jvm.debugPort > 0 ? config.jvm.debugPort : undefined,
  );
  attachShutdownHooks(proc);

  try {
    await waitForReady;
    printReadyBanner(config.port, project.pluginName);

    if (overrides.watch !== false && !overrides.noWatch) {
      startPluginWatcher(cwd, config, project, project.pluginName);
    } else {
      info("Watch disabled (--no-watch)");
    }

    await new Promise<void>((resolve) => proc.on("exit", () => resolve()));
    return 0;
  } catch (e) {
    error(String(e));
    proc.kill();
    return 2;
  }
}
