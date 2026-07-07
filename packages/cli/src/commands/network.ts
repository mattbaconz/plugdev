import { mkdir, writeFile, cp } from "node:fs/promises";
import { join } from "node:path";
import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
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
import { heading, info, success, step, warn } from "../util/log.js";
import { isPortAvailable } from "../util/port.js";
import { Errors } from "../util/errors.js";
import { CLI_VERSION } from "../constants.js";
import type { ResolvedConfig } from "../config/loader.js";

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

export async function runNetwork(
  cwd: string,
  opts: { configPath?: string } = {},
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

  await seedWorldCache("flat-creative");
  await ensurePaperDevTemplate();

  step("Downloading Velocity...", "active");
  const velocityJar = await ensureVelocityJar(velocityVersion);
  step("Downloading Velocity...", "done");
  info(`Velocity cache: ${velocityJar.cacheHit ? "hit" : "downloaded"}`);

  await mkdir(join(proxyDir, "plugins"), { recursive: true });
  await cp(velocityJar.jarPath, join(proxyDir, "velocity.jar"));
  await writeVelocityConfig({
    proxyDir,
    bindPort: proxyPort,
    backends,
    secret,
  });

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
    await prepareRunDirectoryAt(backendDir, backendConfig);
    await writeBackendPaperConfig(backendDir, secret);
    await copyTemplateFiles(await ensurePaperDevTemplate(), backendDir);
    const serverJar = await copyPaperToRun(backendDir, jarInfo.jarPath);

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
  info(`Proxy:  localhost:${proxyPort}`);
  for (const backend of backends) {
    info(`Backend ${backend.name}: localhost:${backend.port}`);
  }

  attachMultiShutdown(processes);

  await new Promise<void>((resolve) => {
    for (const proc of processes) {
      proc.on("exit", () => {
        if (processes.every((p) => p.exitCode !== null || p.killed)) resolve();
      });
    }
  });

  return 0;
}
