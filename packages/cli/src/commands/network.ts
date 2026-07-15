import { mkdir, cp, access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import chokidar from "chokidar";
import { detectProject } from "../detect/project.js";
import { loadConfig, type ResolvedConfig } from "../config/loader.js";
import { ensureVelocityJar } from "../cache/velocity.js";
import { ensureServerJar } from "../cache/server.js";
import { copyPaperToRun, prepareRunDirectoryAt } from "../cache/run-template.js";
import {
  copyTemplateFiles,
  ensurePaperDevTemplate,
  generateForwardingSecret,
  seedWorldCache,
  writeBackendPaperConfig,
  writeVelocityConfig,
} from "../cache/templates.js";
import { networkRunDir } from "../paths.js";
import { startJavaProcess, attachMultiShutdown } from "../process/spawner.js";
import { runGradleBuild } from "../build/gradle.js";
import { runMavenBuild } from "../build/maven.js";
import { heading, info, success, step, warn, phase } from "../util/log.js";
import { isPortAvailable } from "../util/port.js";
import { Errors } from "../util/errors.js";
import { CLI_VERSION } from "../constants.js";
import { JOIN_HOST, launchClient } from "../client/launch.js";
import { debounce } from "../util/debounce.js";

interface BackendSpec {
  name: string;
  port: number;
  version: string;
}

function resolveBackends(config: ResolvedConfig): BackendSpec[] {
  const fromYaml = config.raw.backends;
  if (fromYaml && fromYaml.length > 0) {
    return fromYaml.map((b) => ({
      name: b.name,
      port: b.port,
      version: b.version ?? config.version,
    }));
  }
  return [
    { name: "lobby", port: 25566, version: config.version },
    { name: "survival", port: 25567, version: config.version },
  ];
}

async function looksLikeVelocityPlugin(cwd: string): Promise<boolean> {
  const paths = [
    join(cwd, "build.gradle"),
    join(cwd, "build.gradle.kts"),
    join(cwd, "pom.xml"),
    join(cwd, "src", "main", "resources", "velocity-plugin.json"),
    join(cwd, "src", "main", "templates", "velocity-plugin.json"),
  ];
  for (const p of paths) {
    try {
      await access(p, constants.F_OK);
      if (p.endsWith(".json")) return true;
      const content = await readFile(p, "utf8");
      if (
        /velocity-api/i.test(content) ||
        /com\.velocitypowered/i.test(content) ||
        /velocity\.plugin/i.test(content)
      ) {
        return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

async function buildAndDeployProxyPlugin(
  cwd: string,
  config: ResolvedConfig,
  proxyPluginsDir: string,
): Promise<string | undefined> {
  const project = await detectProject(cwd);
  const buildConfig: ResolvedConfig = {
    ...config,
    type: "plugin",
    build: {
      ...config.build,
      system: project.buildSystem === "maven" ? "maven" : "gradle",
    },
  };

  phase("Build proxy plugin", "active");
  let jarPath: string;
  try {
    if (project.buildSystem === "maven") {
      const result = await runMavenBuild(cwd, buildConfig, project.pluginName);
      jarPath = result.jarPath;
    } else {
      const result = await runGradleBuild(cwd, buildConfig, {
        ...project,
        type: "plugin",
      });
      jarPath = result.jarPath;
    }
  } catch (err) {
    warn(
      `Proxy plugin build failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }

  if (!jarPath) {
    warn("Proxy plugin build produced no JAR");
    return undefined;
  }

  await mkdir(proxyPluginsDir, { recursive: true });
  const dest = join(proxyPluginsDir, jarPath.split(/[/\\]/).pop()!);
  await cp(jarPath, dest);
  phase("Build proxy plugin");
  success(`Deployed proxy plugin → ${dest}`);
  return dest;
}

export async function runNetwork(
  cwd: string,
  opts: { configPath?: string; join?: boolean; noWatch?: boolean } = {},
): Promise<number> {
  heading(`PlugDev Network ${CLI_VERSION}\n`);

  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project, { configPath: opts.configPath });

  if (config.type !== "network") {
    warn('plugdev.yml type is not "network" — using default lobby + survival backends.');
  }

  const proxyPort = config.raw.proxy?.port ?? 25565;
  const velocityVersion = config.raw.proxy?.version ?? "3.4.0";
  const backends = resolveBackends(config);

  const ports = [proxyPort, ...backends.map((b) => b.port)];
  for (const port of ports) {
    if (!(await isPortAvailable(port))) {
      throw Errors.portInUse(port);
    }
  }

  const secret =
    config.raw.forwarding?.secret ??
    (config.raw.forwarding?.generate === false ? "" : generateForwardingSecret());

  if (!secret) {
    throw Errors.downloadFailed("Forwarding secret required when generate: false.");
  }

  const root = networkRunDir(cwd);
  const proxyDir = join(root, "proxy");
  const backendsRoot = join(root, "backends");
  const proxyPluginsDir = join(proxyDir, "plugins");

  await seedWorldCache("flat-creative");
  await ensurePaperDevTemplate();

  step("Downloading Velocity...", "active");
  const velocityJar = await ensureVelocityJar(velocityVersion);
  step("Downloading Velocity...", "done");
  info(`Velocity cache: ${velocityJar.cacheHit ? "hit" : "downloaded"}`);

  await mkdir(proxyPluginsDir, { recursive: true });
  await cp(velocityJar.jarPath, join(proxyDir, "velocity.jar"));
  await writeVelocityConfig({
    proxyDir,
    bindPort: proxyPort,
    backends,
    secret,
  });

  const shouldBuildProxy =
    (await looksLikeVelocityPlugin(cwd)) ||
    Boolean((config.raw as { plugin?: unknown }).plugin);

  if (shouldBuildProxy) {
    await buildAndDeployProxyPlugin(cwd, config, proxyPluginsDir);
  } else {
    info("No Velocity plugin signals — proxy starts without project JAR");
  }

  const processes: Array<ReturnType<typeof startJavaProcess>["proc"]> = [];

  for (const backend of backends) {
    step(`Preparing backend "${backend.name}"...`, "active");
    const backendDir = join(backendsRoot, backend.name);
    const backendConfig: ResolvedConfig = {
      ...config,
      port: backend.port,
      version: backend.version,
    };

    const jarInfo = await ensureServerJar(backend.version, "paper");
    const serverJar = await copyPaperToRun(backendDir, jarInfo.jarPath);
    await prepareRunDirectoryAt(backendDir, backendConfig);
    await writeBackendPaperConfig(backendDir, secret);
    await copyTemplateFiles(await ensurePaperDevTemplate(), backendDir);

    step(`Starting backend "${backend.name}" (:${backend.port})...`, "active");
    const { proc, waitForReady } = startJavaProcess(backendDir, serverJar, config.jvm.memory, {
      readyPattern: /Done \(/,
    });
    processes.push(proc);
    await waitForReady;
    step(`Starting backend "${backend.name}" (:${backend.port})...`, "done");
  }

  step(`Starting Velocity (:${proxyPort})...`, "active");
  const velocity = startJavaProcess(proxyDir, join(proxyDir, "velocity.jar"), "512M", {
    readyPattern: /Done \(/,
    args: ["nogui"],
  });
  processes.push(velocity.proc);
  await velocity.waitForReady;
  step(`Starting Velocity (:${proxyPort})...`, "done");

  success("Network ready");
  info(`Proxy:  ${JOIN_HOST}:${proxyPort}`);
  for (const backend of backends) {
    info(`Backend ${backend.name}: ${JOIN_HOST}:${backend.port}`);
  }
  if (shouldBuildProxy) {
    info("Proxy plugin loaded under .plugdev/network/proxy/plugins/");
    info("After code changes: JAR rebuilds; restart Velocity to load (no hot-reload)");
  }

  attachMultiShutdown(processes);

  const joinClient = opts.join !== false && config.client?.joinOnReady !== false;
  if (joinClient) {
    phase("Launch Minecraft client → proxy", "active");
    await launchClient({
      config: { ...config, port: proxyPort },
      port: proxyPort,
      host: JOIN_HOST,
      waitForServer: true,
    });
    phase("Launch Minecraft client → proxy");
  } else {
    info(`Join: ${JOIN_HOST}:${proxyPort}`);
  }

  let closeWatcher: (() => void) | undefined;
  if (shouldBuildProxy && opts.noWatch !== true) {
    const watchPaths = config.watch.paths.map((p) => join(cwd, p));
    info(`Watching ${watchPaths.join(", ")} for proxy plugin changes...`);
    const rebuild = debounce(async () => {
      warn("Proxy plugin source changed — rebuilding JAR…");
      await buildAndDeployProxyPlugin(cwd, config, proxyPluginsDir);
      info("Restart Velocity (Ctrl+C → plugdev network) to load the new JAR");
    }, config.watch.debounceMs);
    const watcher = chokidar.watch(watchPaths, { ignoreInitial: true });
    watcher.on("change", () => {
      void rebuild();
    });
    closeWatcher = () => {
      void watcher.close();
    };
  }

  await new Promise<void>((resolve) => {
    for (const proc of processes) {
      proc.on("exit", () => {
        if (processes.every((p) => p.exitCode !== null || p.killed)) resolve();
      });
    }
  });

  closeWatcher?.();
  return 0;
}
