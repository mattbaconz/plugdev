import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { checkGradle, checkJava, checkMaven, parseJavaMajor } from "../util/tools.js";
import {
  detectLauncher,
  instanceExists,
  defaultInstanceId,
  readInstanceMcVersion,
} from "../client/detect.js";
import { isServerJarCached, resolveServerProject } from "../cache/server.js";
import { isEmbeddedClientCached } from "../client/prefetch.js";
import { banner, phase, info, warn } from "../util/log.js";
import { isJsonMode, emitJson } from "../util/output.js";
import pc from "picocolors";

type ClientTier = "prism" | "multimc" | "embedded" | "needs-setup";

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

async function resolveClientTier(
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<{ tier: ClientTier; instanceId: string; ready: boolean }> {
  const instanceId = config.client?.instance ?? defaultInstanceId(config.version);
  const launcher = await detectLauncher("auto", config.client);

  if (launcher) {
    if (await instanceExists(launcher, instanceId)) {
      const instanceMc = await readInstanceMcVersion(launcher, instanceId);
      const ready = instanceMc === config.version || !instanceMc;
      return { tier: launcher.type, instanceId, ready };
    }
    return { tier: launcher.type, instanceId, ready: false };
  }

  const embeddedReady = await isEmbeddedClientCached(config.version);
  return {
    tier: embeddedReady ? "embedded" : "needs-setup",
    instanceId,
    ready: embeddedReady,
  };
}

export async function runDoctor(cwd: string): Promise<number> {
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const serverProject = resolveServerProject(config.server);
  const serverLabel = serverDisplayName(config.server);

  const java = await checkJava();
  let javaOk = false;
  let javaVersion: string | undefined;
  if (java.ok) {
    javaVersion = java.version;
    const major = java.major ?? parseJavaMajor(java.version);
    javaOk = major === undefined || major >= 21;
  }

  let gradleOk: boolean | undefined;
  if (project.buildSystem === "gradle") {
    gradleOk = await checkGradle(cwd);
  }

  let mavenOk: boolean | undefined;
  if (project.buildSystem === "maven") {
    mavenOk = await checkMaven(cwd);
  }

  const serverCached = await isServerJarCached(config.version, serverProject);
  const embeddedCached = await isEmbeddedClientCached(config.version);
  const client = await resolveClientTier(config);

  const toolchainReady =
    project.type !== "unknown" &&
    javaOk &&
    (project.buildSystem !== "gradle" || gradleOk) &&
    (project.buildSystem !== "maven" || mavenOk);

  const clientReady = embeddedCached || client.ready;
  const setupReady = serverCached && clientReady;

  if (isJsonMode()) {
    emitJson({
      ok: toolchainReady && setupReady,
      data: {
        projectType: project.type,
        buildSystem: project.buildSystem,
        pluginName: project.pluginName,
        loader: project.loader,
        minecraftVersion: config.version,
        jarTask: config.build.jarTask,
        java: { ok: java.ok, version: javaVersion, meetsPaper21: javaOk },
        gradle: gradleOk,
        maven: mavenOk,
        cache: {
          server: serverCached ? "cached" : "not cached",
          embeddedClient: embeddedCached ? "cached" : "not cached",
        },
        client: {
          tier: client.tier,
          instance: client.instanceId,
          ready: clientReady,
        },
        toolchainReady,
        setupReady,
        hint: !javaOk
          ? "Install JDK 21+ from https://adoptium.net/"
          : !setupReady
            ? "Run: plugdev setup"
            : undefined,
      },
    });
    if (!toolchainReady) return 3;
    if (!setupReady) return 2;
    return 0;
  }

  banner("doctor");

  info(`Project type: ${pc.bold(project.type)}`);
  info(`Build system: ${pc.bold(project.buildSystem)}`);
  if (project.pluginName) info(`Plugin name: ${project.pluginName}`);
  if (project.loader) info(`Mod loader: ${project.loader}`);
  info(`Minecraft version: ${config.version}`);
  info(`Config jar task: ${config.build.jarTask}`);

  if (java.ok) {
    const major = java.major ?? parseJavaMajor(java.version);
    if (major !== undefined && major < 21) {
      warn(`Java ${java.version} found — Paper 1.21+ needs Java 21+`);
    } else {
      phase(`Java ${java.version}`);
    }
  } else {
    warn("Java not found on PATH");
    info("Hint: https://adoptium.net/");
  }

  if (project.buildSystem === "gradle") {
    const g = await checkGradle(cwd);
    if (g) phase("Gradle wrapper");
    else warn("Gradle wrapper not found");
  }

  if (project.buildSystem === "maven") {
    const m = await checkMaven(cwd);
    if (m) phase("Maven");
    else warn("Maven not found");
  }

  if (project.type === "unknown") {
    warn("Could not detect plugin or mod project");
    return 3;
  }

  if (serverCached) {
    phase(`Cache: ${serverLabel} ${config.version} cached`);
  } else {
    warn(`Cache: ${serverLabel} ${config.version} not cached`);
  }

  if (embeddedCached) {
    phase(`Cache: Minecraft client ${config.version} cached`);
  } else {
    warn(`Cache: Minecraft client ${config.version} not cached`);
  }

  if (client.tier === "embedded" || (embeddedCached && !client.ready)) {
    phase("Client tier: embedded (ready)");
  } else if (client.tier === "needs-setup") {
    warn("Client tier: needs setup (run plugdev setup)");
  } else if (client.ready) {
    phase(`Client tier: ${client.tier} — ${client.instanceId} ready`);
  } else {
    warn(
      `Client tier: ${client.tier} — instance "${client.instanceId}" needs provisioning`,
    );
    info("Run: plugdev setup");
  }

  if (!setupReady) {
    info("Run: plugdev setup");
  }

  phase("Ready for plugdev");

  if (!toolchainReady) return 3;
  if (!setupReady) return 2;
  return 0;
}
