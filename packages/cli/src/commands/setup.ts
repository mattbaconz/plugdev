import { detectProject, printDetectionSummary } from "../detect/project.js";
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
import { recommendClientInstance } from "../client/recommend.js";
import {
  embeddedClientDir,
  ensureEmbeddedClient,
  isEmbeddedClientReady,
} from "../client/prefetch.js";
import { VIA_COMPAT_DEPS } from "../detect/deps.js";
import { prefetchDeps } from "../deps/hangar.js";
import { writeClientInstanceToYml } from "../deps/config-write.js";
import { banner, phase, info, success, warn } from "../util/log.js";
import { createDownloadProgress, endDownloadProgress } from "../util/progress.js";
import {
  requireJava,
  requireJava21,
  checkGradle,
  checkMaven,
  minJavaMajorForServerVersion,
} from "../util/tools.js";
import { isJsonMode, emitJson } from "../util/output.js";

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

export async function runSetup(
  cwd: string,
  opts: { instance?: string } = {},
): Promise<number> {
  banner("setup");

  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);

  printDetectionSummary(project, {
    version: config.type === "discord-bot" ? undefined : config.version,
    jarTask: config.type === "discord-bot" ? undefined : config.build.jarTask,
    server:
      config.type === "mod" || config.type === "discord-bot"
        ? undefined
        : config.server,
  });

  // Discord bot (experimental): Node + token env — skip Paper/client
  if (project.type === "discord-bot" || config.type === "discord-bot") {
    const { loadDotEnv, resolveBotTokenEnv } = await import("../util/dotenv.js");
    await loadDotEnv(cwd);
    try {
      const { execa } = await import("execa");
      const node = await execa("node", ["--version"], { reject: false });
      if (node.exitCode === 0) {
        phase(`Node ${String(node.stdout).trim()}`);
      } else {
        warn("Node.js not found on PATH");
        return 2;
      }
    } catch {
      warn("Node.js not found on PATH");
      return 2;
    }
    const token = resolveBotTokenEnv(config.bot?.tokenEnv);
    if (token.present) {
      phase(`Token env: ${token.name} is set`);
    } else {
      warn(
        `Token env not set — export ${token.name} (or DISCORD_BOT_TOKEN) or add it to .env`,
      );
    }
    phase("Discord bot (experimental) — setup skips Paper/Via*/client");
    info("");
    success("Setup complete — ready to run");
    info("  Run: plug run");
    info("  Tip: edit code → save → process restarts");
    if (isJsonMode()) {
      emitJson({
        ok: true,
        data: {
          type: "discord-bot",
          tokenEnv: token.name,
          tokenPresent: token.present,
        },
      });
    }
    return token.present ? 0 : 2;
  }

  // Mod projects: Gradle owns the client — skip Paper/Via*/embedded prefetch
  if (project.type === "mod" || config.type === "mod") {
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
    phase(
      `Mod project (${config.loader ?? project.loader ?? "unknown"}) — setup skips Paper/Via*`,
    );
    if (config.gradleSubproject) {
      phase(`Gradle subproject: ${config.gradleSubproject}`);
    }
    info("");
    success("Setup complete — ready to run");
    info(`  Run: plugdev${config.loader ? ` --loader ${config.loader}` : ""}`);
    info("  Tip: mods use Gradle runClient/runServer — no Paper cache needed");
    if (isJsonMode()) {
      emitJson({
        ok: true,
        data: {
          type: "mod",
          loader: config.loader ?? project.loader,
          gradleSubproject: config.gradleSubproject,
        },
      });
    }
    return 0;
  }

  const serverProject = resolveServerProject(config.server);
  const serverLabel = serverDisplayName(config.server);

  const minJava = minJavaMajorForServerVersion(config.version);
  try {
    const java = await requireJava(minJava);
    phase(`Java ${java.version ?? minJava + "+"}`);
  } catch {
    warn(
      `Java ${minJava}+ required — install from https://adoptium.net/ (or: scoop install temurin${minJava}-jdk)`,
    );
    return 2;
  }

  if (project.buildSystem === "gradle") {
    const gradleOk = await checkGradle(cwd);
    if (gradleOk) phase("Gradle wrapper");
    else warn("Gradle wrapper not found — build may fail");
  }

  if (project.buildSystem === "maven") {
    const mavenOk = await checkMaven(cwd);
    if (mavenOk) phase("Maven (mvnw or mvn)");
    else warn("Maven not found — install Maven or add mvnw wrapper");
  }

  const serverCached = await isServerJarCached(config.version, serverProject);
  let clientReady = await isEmbeddedClientReady(config.version);
  const launcherEarly = await detectLauncher("auto", config.client);
  let wantsExternal =
    Boolean(opts.instance) ||
    Boolean(config.client?.instance) ||
    config.client?.launcher === "prism" ||
    config.client?.launcher === "multimc";

  // Auto-pick unambiguous Prism/MultiMC instance matching MC version
  if (!wantsExternal && !opts.instance && !config.client?.instance && launcherEarly) {
    const rec = await recommendClientInstance(launcherEarly, config.version);
    if (rec?.unambiguous) {
      const wrote = await writeClientInstanceToYml(cwd, {
        launcher: launcherEarly.type,
        instance: rec.instanceId,
      });
      if (wrote) {
        success(
          `Detected ${launcherEarly.type} instance "${rec.instanceId}" (${rec.mcVersion ?? config.version}) — wrote client.instance`,
        );
      }
      wantsExternal = true;
      config.client = {
        ...config.client,
        launcher: launcherEarly.type,
        instance: rec.instanceId,
      };
    } else if (rec && !rec.unambiguous) {
      info(
        `Optional ${launcherEarly.type}: plugdev setup --instance "${rec.instanceId}"` +
          (rec.mcVersion ? ` (MC ${rec.mcVersion})` : ""),
      );
    }
  }

  const configuredInstance =
    opts.instance ??
    config.client?.instance ??
    defaultInstanceId(config.version);
  const usingExternalClient =
    wantsExternal &&
    launcherEarly !== undefined &&
    (Boolean(opts.instance) ||
      Boolean(config.client?.instance) ||
      (await instanceExists(launcherEarly, configuredInstance)));

  let serverJar: Awaited<ReturnType<typeof ensureServerJar>>;

  if (serverCached) {
    phase(`Cache hit — ${serverLabel} ${config.version}`);
    serverJar = await ensureServerJar(config.version, serverProject);
  } else {
    const report = createDownloadProgress(
      `Downloading ${serverLabel} ${config.version}…`,
    );
    try {
      serverJar = await ensureServerJar(config.version, serverProject, {
        onProgress: (percent, label) => report(percent, label),
      });
    } finally {
      endDownloadProgress();
    }
    phase(`Downloaded ${serverLabel} ${config.version}`);
  }

  let embeddedClientFailed = false;

  if (usingExternalClient) {
    phase(
      `Skip embedded client — using ${launcherEarly!.type} "${configuredInstance}"`,
    );
    clientReady = true;
  } else if (clientReady) {
    phase(`Cache hit — Minecraft client ${config.version}`);
  } else {
    const report = createDownloadProgress(
      `Ensuring Minecraft client ${config.version}…`,
    );
    try {
      const result = await ensureEmbeddedClient(config.version, {
        onProgress: (percent, label) => report(percent, label),
      });
      if (result.repaired) {
        phase(`Repaired Minecraft client ${config.version}`);
      } else if (result.cacheHit) {
        phase(`Cache hit — Minecraft client ${config.version}`);
      } else {
        phase(`Downloaded Minecraft client ${config.version}`);
      }
      clientReady = await isEmbeddedClientReady(config.version);
    } catch (err) {
      embeddedClientFailed = true;
      warn(
        `Embedded client download failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      warn(
        'OK if you use Prism — plugdev setup --instance "YourInstance"',
      );
    } finally {
      endDownloadProgress();
    }
  }

  // Prefetch configured deps (or Via* fallback) into ~/.plugdev/deps
  const depsToPrefetch =
    config.deps && config.deps.length > 0 ? config.deps : VIA_COMPAT_DEPS;
  phase("Prefetch test deps", "active");
  try {
    await prefetchDeps(depsToPrefetch, config.server, config.version);
    phase(`Prefetch test deps (${depsToPrefetch.length})`);
  } catch (err) {
    warn(
      `Deps prefetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    warn("You can retry later with: plugdev deps add viaversion");
  }

  const launcher = launcherEarly;
  let resolvedInstance = configuredInstance;

  if (wantsExternal && launcher) {
    if (opts.instance) {
      const wrote = await writeClientInstanceToYml(cwd, {
        launcher: launcher.type,
        instance: opts.instance,
      });
      if (wrote) {
        success(`Wrote client.instance: "${opts.instance}" to plugdev.yml`);
      }
      resolvedInstance = opts.instance;
    }

    if (!(await instanceExists(launcher, resolvedInstance))) {
      if (resolvedInstance.startsWith("plugdev-")) {
        phase(`Provision ${launcher.type} instance ${resolvedInstance}`, "active");
        await ensureInstance(launcher, config.version, resolvedInstance);
        phase(`Provision ${launcher.type} instance ${resolvedInstance}`);
        clientReady = true;
      } else {
        warn(
          `Instance "${resolvedInstance}" not found under ${launcher.dataDir}/instances`,
        );
        info("Run: plugdev client list");
        clientReady = false;
      }
    } else {
      phase(`${launcher.type} instance ${resolvedInstance} ready`);
      clientReady = true;
    }
  } else {
    phase("Client: embedded (matches server MC version)");
    if (launcher) {
      info(
        'Optional Prism: plugdev setup --instance "FO 26.1.2" (uses Microsoft account)',
      );
    }
  }

  // External client ready counts even if embedded download failed
  const setupComplete = usingExternalClient
    ? clientReady
    : clientReady && !embeddedClientFailed;

  info("");
  if (setupComplete) {
    success("Setup complete — ready to run");
  } else {
    warn("Setup incomplete — client not ready");
    info("  Fix: re-run plug setup, or plugdev setup --instance \"YourPrismInstance\"");
  }
  info(`  Server cache: ${join(serversCacheDir(config.version, serverProject), serverJar.jarName)}`);
  info(`  Client cache: ${embeddedClientDir()}`);
  info(`  Run: plugdev run`);

  if (isJsonMode()) {
    emitJson({
      ok: setupComplete,
      data: {
        version: config.version,
        server: config.server,
        serverJar: join(serversCacheDir(config.version, serverProject), serverJar.jarName),
        clientCache: embeddedClientDir(),
        launcher: launcher?.type ?? "embedded",
        instance: resolvedInstance,
        clientReady: setupComplete,
      },
    });
  }

  return setupComplete ? 0 : 2;
}
