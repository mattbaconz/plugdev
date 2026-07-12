import { detectProject, detectFoliaSupport } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { checkGradle, checkJava, checkMaven, minJavaMajorForServerVersion, parseJavaMajor } from "../util/tools.js";
import { pomHasModules } from "../build/maven.js";
import {
  detectLauncher,
  instanceExists,
  defaultInstanceId,
  readInstanceMcVersion,
} from "../client/detect.js";
import { isServerJarCached, resolveServerProject } from "../cache/server.js";
import { isEmbeddedClientReady } from "../client/prefetch.js";
import { checkBootstrapJar } from "../util/bootstrap.js";
import { serversCacheDir } from "../paths.js";
import { join } from "node:path";
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
  const wantsExternal =
    Boolean(config.client?.instance) ||
    config.client?.launcher === "prism" ||
    config.client?.launcher === "multimc";

  if (!wantsExternal) {
    const embeddedReady = await isEmbeddedClientReady(config.version);
    return {
      tier: embeddedReady ? "embedded" : "needs-setup",
      instanceId: `embedded-${config.version}`,
      ready: embeddedReady,
    };
  }

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

  const embeddedReady = await isEmbeddedClientReady(config.version);
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

  const minJava = minJavaMajorForServerVersion(config.version);
  const java = await checkJava(minJava);
  let javaOk = false;
  let javaVersion: string | undefined;
  if (java.ok) {
    javaVersion = java.version;
    const major = java.major ?? parseJavaMajor(java.version);
    javaOk = major === undefined || major >= minJava;
  } else if (java.version) {
    javaVersion = java.version;
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
  const embeddedReady = await isEmbeddedClientReady(config.version);
  const client = await resolveClientTier(config);
  const bootstrap = await checkBootstrapJar();
  const foliaSupport =
    config.server === "folia" ? await detectFoliaSupport(cwd) : undefined;

  const spigotJarPath =
    config.server === "spigot"
      ? join(serversCacheDir(config.version, "spigot"), `spigot-${config.version}.jar`)
      : undefined;
  const spigotMissing = config.server === "spigot" && !serverCached;

  const jarTaskHint =
    project.buildSystem === "gradle" &&
    project.hasShadowJar &&
    config.build.jarTask !== "shadowJar" &&
    !config.build.jarTask.includes("shadow")
      ? `Project looks like shadowJar but jarTask is "${config.build.jarTask}"`
      : project.buildSystem === "maven" &&
          project.hasShadowJar &&
          !config.build.jarPattern
        ? `maven-shade-plugin detected — set build.jarPattern (e.g. target/*-shaded.jar)`
        : undefined;

  const runPaperHint = project.hasRunPaperMaven
    ? "run-paper-maven-plugin detected — PlugDev uses its own watch/reload loop (IDE hotswap still optional)"
    : undefined;

  const multiModule =
    project.buildSystem === "maven" && (await pomHasModules(cwd));
  const multiModuleHint =
    multiModule && !config.build.module
      ? 'Multi-module pom detected — set build.module (e.g. "plugin-module") for mvn -pl … -am'
      : undefined;

  const isMod = project.type === "mod" || config.type === "mod";
  const isDiscordBot =
    project.type === "discord-bot" || config.type === "discord-bot";

  let nodeOk: boolean | undefined;
  let tokenPresent: boolean | undefined;
  let tokenEnvName: string | undefined;
  if (isDiscordBot) {
    const { loadDotEnv, resolveBotTokenEnv } = await import("../util/dotenv.js");
    await loadDotEnv(cwd);
    try {
      const { execa } = await import("execa");
      const node = await execa("node", ["--version"], { reject: false });
      nodeOk = node.exitCode === 0;
    } catch {
      nodeOk = false;
    }
    const token = resolveBotTokenEnv(config.bot?.tokenEnv);
    tokenPresent = token.present;
    tokenEnvName = token.name;
  }

  const toolchainReady = isDiscordBot
    ? project.type !== "unknown" && nodeOk === true
    : project.type !== "unknown" &&
      javaOk &&
      (project.buildSystem !== "gradle" || gradleOk) &&
      (project.buildSystem !== "maven" || mavenOk) &&
      (isMod || bootstrap.ok) &&
      !spigotMissing;

  const clientReady = isMod || isDiscordBot ? true : embeddedReady || client.ready;
  const setupReady = isDiscordBot
    ? toolchainReady && tokenPresent === true
    : isMod
      ? toolchainReady
      : serverCached && clientReady;

  if (isJsonMode()) {
    emitJson({
      ok: toolchainReady && setupReady,
      data: {
        projectType: project.type,
        buildSystem: project.buildSystem,
        pluginName: project.pluginName,
        loader: project.loader,
        minecraftVersion: isDiscordBot ? undefined : config.version,
        server: isDiscordBot ? undefined : config.server,
        bot: isDiscordBot
          ? {
              tokenEnv: tokenEnvName,
              tokenPresent,
              nodeOk,
            }
          : undefined,
        jarTask: config.build.jarTask,
        jarPattern: config.build.jarPattern,
        module: config.build.module,
        hasShadowJar: project.hasShadowJar,
        hasRunPaperMaven: project.hasRunPaperMaven,
        jarTaskHint,
        runPaperHint,
        multiModuleHint,
        java: {
          ok: java.ok,
          version: javaVersion,
          path: java.path,
          meetsMin: javaOk,
          minMajor: minJava,
          meetsPaper21: javaOk,
        },
        gradle: gradleOk,
        maven: mavenOk,
        bootstrap: {
          ok: bootstrap.ok,
          path: bootstrap.path,
        },
        folia: foliaSupport
          ? {
              support: foliaSupport,
              warning:
                foliaSupport !== "declared"
                  ? "Folia: plugin metadata does not declare Folia support; prefer watch.reload.java: restart"
                  : "Folia: safe reload may still be unsafe — prefer restart after code changes",
            }
          : undefined,
        spigot: spigotJarPath
          ? {
              jarPath: spigotJarPath,
              cached: serverCached,
              hint: spigotMissing
                ? `Run BuildTools for ${config.version} and copy spigot-${config.version}.jar to ${spigotJarPath}`
                : undefined,
            }
          : undefined,
        cache: {
          server: serverCached ? "cached" : "not cached",
          embeddedClient: embeddedReady ? "ready" : "not ready",
        },
        client: {
          tier: client.tier,
          instance: client.instanceId,
          ready: clientReady,
        },
        toolchainReady,
        setupReady,
        hint: isDiscordBot
          ? !nodeOk
            ? "Install Node.js from https://nodejs.org/"
            : !tokenPresent
              ? `Set ${tokenEnvName ?? "DISCORD_TOKEN"} in the environment or .env`
              : undefined
          : !bootstrap.ok
            ? "Bootstrap JAR missing — run npm run build:bootstrap from the plugdev monorepo"
            : spigotMissing
              ? `Spigot jar missing — place at ${spigotJarPath}`
              : !javaOk
                ? `Install JDK ${minJava}+ from https://adoptium.net/`
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
  if (!isDiscordBot) {
    info(`Minecraft version: ${config.version}`);
    info(`Server software: ${serverLabel}`);
    info(`Config jar task: ${config.build.jarTask}`);
    if (config.build.jarPattern) info(`JAR pattern: ${config.build.jarPattern}`);
    if (config.build.module) info(`Maven module: ${config.build.module}`);
  } else {
    info(`Bot entry: ${config.bot?.entry ?? "auto"}`);
    info(`Token env: ${tokenEnvName ?? "DISCORD_TOKEN"}`);
  }
  if (project.hasShadowJar && !isDiscordBot) {
    info(
      project.buildSystem === "maven"
        ? "Shade JAR: maven-shade-plugin detected"
        : "Shadow JAR: detected in build.gradle",
    );
  }
  if (jarTaskHint && !isDiscordBot) warn(jarTaskHint);
  if (runPaperHint && !isDiscordBot) info(runPaperHint);
  if (multiModuleHint && !isDiscordBot) warn(multiModuleHint);

  if (isDiscordBot) {
    if (nodeOk) phase("Node.js");
    else warn("Node.js not found on PATH");
    if (tokenPresent) phase(`Token env ${tokenEnvName} is set`);
    else
      warn(
        `Token env not set — export ${tokenEnvName ?? "DISCORD_TOKEN"} or add it to .env`,
      );
    phase("Discord bot path: process restart on save (experimental)");
    if (config.watch.reloadJava === "hotswap") {
      info("Note: watch.reload.java hotswap applies to Minecraft Java, not Discord bots");
    }
  } else if (java.ok || java.version) {
    const major = java.major ?? parseJavaMajor(java.version);
    if (major !== undefined && major < minJava) {
      warn(
        `Java ${java.version} found — ${serverLabel} ${config.version} needs Java ${minJava}+`,
      );
    } else if (java.ok) {
      phase(`Java ${java.version}${java.path ? ` (${java.path})` : ""}`);
    } else {
      warn(`Java ${java.version} found — needs Java ${minJava}+`);
    }
  } else {
    warn("Java not found (JAVA_HOME / common installs / PATH)");
    info(
      minJava >= 25
        ? "Hint: scoop install temurin25-jdk — https://adoptium.net/"
        : "Hint: https://adoptium.net/",
    );
  }

  if (!isDiscordBot && project.buildSystem === "gradle") {
    if (gradleOk) phase("Gradle wrapper");
    else warn("Gradle wrapper not found");
  }

  if (!isDiscordBot && project.buildSystem === "maven") {
    if (mavenOk) phase("Maven (mvnw or mvn)");
    else warn("Maven not found — install Maven or add mvnw wrapper");
  }

  if (project.type === "unknown") {
    warn("Could not detect plugin, mod, or Discord bot project");
    return 3;
  }

  if (isDiscordBot) {
    // already printed above
  } else if (isMod) {
    if (config.gradleSubproject) {
      phase(`Gradle subproject: ${config.gradleSubproject}`);
    }
    phase("Mod path: Gradle runClient/runServer (Paper bootstrap skipped)");
    info("Reload: assets F3+T / data /reload / java restart — no plugin-style hot reload");
    if (config.watch.reloadJava === "hotswap") {
      info(
        "hotswap mode: PlugDev will try JDWP redefine after ./gradlew classes; structural changes still need restart",
      );
    }
  } else {
    if (bootstrap.ok) {
      phase(`Bootstrap JAR: ${bootstrap.path}`);
    } else {
      warn("Bootstrap JAR not found — safe reload will fail");
      info("Hint: reinstall CLI — npm i -g @plugdev/cli@latest");
    }

    if (config.watch.reloadJava === "hotswap") {
      info(
        `Hotswap enabled — JDWP port ${config.jvm.debugPort || 5005}; method bodies only; falls back to safe reload`,
      );
    }

    if (config.server === "folia") {
      if (foliaSupport === "declared") {
        warn(
          "Folia: metadata declares support, but safe reload may still be unsafe — prefer restart",
        );
      } else {
        warn(
          "Folia: plugin metadata does not declare Folia support — prefer watch.reload.java: restart",
        );
      }
    }

    if (spigotMissing && spigotJarPath) {
      warn(`Spigot jar missing at ${spigotJarPath}`);
      info(
        `Hint: Run BuildTools for ${config.version} and copy spigot-${config.version}.jar there`,
      );
    }

    if (serverCached) {
      phase(`Cache: ${serverLabel} ${config.version} cached`);
    } else {
      warn(`Cache: ${serverLabel} ${config.version} not cached`);
    }

    if (embeddedReady) {
      phase(`Cache: Minecraft client ${config.version} ready`);
    } else {
      warn(`Cache: Minecraft client ${config.version} not ready (run plugdev setup)`);
    }

    if (client.tier === "embedded" || (embeddedReady && !client.ready)) {
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
  }

  if (!toolchainReady) {
    warn("Not ready — fix toolchain issues above");
    return 3;
  }

  if (!setupReady) {
    warn(
      isDiscordBot
        ? `Not ready — set ${tokenEnvName ?? "DISCORD_TOKEN"} then re-run doctor`
        : "Not ready — run: plugdev setup",
    );
    return 2;
  }

  phase("Ready for plugdev");
  return 0;
}
