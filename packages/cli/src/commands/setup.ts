import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { ensureServerJar, resolveServerProject, isServerJarCached } from "../cache/server.js";
import { serversCacheDir } from "../paths.js";
import { join } from "node:path";
import {
  detectLauncher,
  defaultInstanceId,
  instanceExists,
} from "../client/detect.js";
import { ensureInstance } from "../client/instance.js";
import {
  embeddedClientDir,
  isEmbeddedClientCached,
  prefetchEmbeddedClient,
} from "../client/prefetch.js";
import { banner, phase, info, success, warn } from "../util/log.js";
import { requireJava21, checkGradle } from "../util/tools.js";

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

export async function runSetup(cwd: string): Promise<number> {
  banner("setup");

  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const serverProject = resolveServerProject(config.server);
  const serverLabel = serverDisplayName(config.server);

  try {
    await requireJava21();
    phase("Java 21+");
  } catch {
    warn("Java 21+ required — install from https://adoptium.net/");
    return 2;
  }

  if (project.buildSystem === "gradle") {
    const gradleOk = await checkGradle(cwd);
    if (gradleOk) phase("Gradle wrapper");
    else warn("Gradle wrapper not found — build may fail");
  }

  const onProgress = (percent: number | undefined, label: string) => {
    if (percent !== undefined) {
      phase(`${label} ${percent}%`, "active");
    } else {
      phase(label, "active");
    }
  };

  const serverCached = await isServerJarCached(config.version, serverProject);
  phase(
    serverCached
      ? `Cache hit — ${serverLabel} ${config.version}`
      : `Prefetch ${serverLabel} ${config.version}`,
    serverCached ? undefined : "active",
  );

  const [serverJar] = await Promise.all([
    ensureServerJar(config.version, serverProject, { onProgress }),
    prefetchEmbeddedClient(config.version, { onProgress }),
  ]);

  if (!serverCached) {
    phase(`Downloaded ${serverLabel} ${config.version}`);
  }

  const clientCached = await isEmbeddedClientCached(config.version);
  phase(
    clientCached
      ? `Cache hit — Minecraft client ${config.version}`
      : `Downloaded Minecraft client ${config.version}`,
  );

  const launcher = await detectLauncher("auto", config.client);
  if (launcher) {
    const instanceId =
      config.client?.instance ?? defaultInstanceId(config.version);
    if (!(await instanceExists(launcher, instanceId))) {
      phase(`Provision ${launcher.type} instance ${instanceId}`, "active");
      await ensureInstance(launcher, config.version, instanceId);
      phase(`Provision ${launcher.type} instance ${instanceId}`);
    } else {
      phase(`${launcher.type} instance ${instanceId} ready`);
    }
  } else {
    phase("Client: embedded (no Prism/MultiMC)");
  }

  info("");
  success("Setup complete — ready to run");
  info(`  Server cache: ${join(serversCacheDir(config.version, serverProject), serverJar.jarName)}`);
  info(`  Client cache: ${embeddedClientDir()}`);
  info(`  Run: plugdev run`);

  return 0;
}
