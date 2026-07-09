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
import { DEFAULT_COMPAT_DEPS } from "../deps/presets.js";
import { prefetchDeps } from "../deps/hangar.js";
import { writeClientInstanceToYml } from "../deps/config-write.js";
import { banner, phase, info, success, warn } from "../util/log.js";
import { createDownloadProgress, endDownloadProgress } from "../util/progress.js";
import { requireJava21, checkGradle, checkMaven } from "../util/tools.js";
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

  if (project.buildSystem === "maven") {
    const mavenOk = await checkMaven(cwd);
    if (mavenOk) phase("Maven (mvnw or mvn)");
    else warn("Maven not found — install Maven or add mvnw wrapper");
  }

  const serverCached = await isServerJarCached(config.version, serverProject);
  const clientCached = await isEmbeddedClientCached(config.version);
  const launcherEarly = await detectLauncher("auto", config.client);
  const wantsExternal =
    Boolean(opts.instance) ||
    Boolean(config.client?.instance) ||
    config.client?.launcher === "prism" ||
    config.client?.launcher === "multimc";
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

  if (usingExternalClient) {
    phase(
      `Skip embedded client — using ${launcherEarly!.type} "${configuredInstance}"`,
    );
  } else if (clientCached) {
    phase(`Cache hit — Minecraft client ${config.version}`);
  } else {
    const report = createDownloadProgress(
      `Downloading Minecraft client ${config.version}…`,
    );
    try {
      await prefetchEmbeddedClient(config.version, {
        onProgress: (percent, label) => report(percent, label),
      });
      phase(`Downloaded Minecraft client ${config.version}`);
    } catch (err) {
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

  // Prefetch Via* (and any configured deps) into ~/.plugdev/deps
  const depsToPrefetch =
    config.deps && config.deps.length > 0 ? config.deps : DEFAULT_COMPAT_DEPS;
  phase("Prefetch Via* compat plugins", "active");
  try {
    await prefetchDeps(depsToPrefetch, config.server, config.version);
    phase("Prefetch Via* compat plugins");
  } catch (err) {
    warn(
      `Via* prefetch failed: ${err instanceof Error ? err.message : String(err)}`,
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
      } else {
        warn(
          `Instance "${resolvedInstance}" not found under ${launcher.dataDir}/instances`,
        );
        info("Run: plugdev client list");
      }
    } else {
      phase(`${launcher.type} instance ${resolvedInstance} ready`);
    }
  } else {
    phase("Client: embedded (matches server MC version)");
    if (launcher) {
      info(
        'Optional Prism: plugdev setup --instance "FO 26.1.2" (uses Microsoft account)',
      );
    }
  }

  info("");
  success("Setup complete — ready to run");
  info(`  Server cache: ${join(serversCacheDir(config.version, serverProject), serverJar.jarName)}`);
  info(`  Client cache: ${embeddedClientDir()}`);
  info(`  Run: plugdev run`);

  if (isJsonMode()) {
    emitJson({
      ok: true,
      data: {
        version: config.version,
        server: config.server,
        serverJar: join(serversCacheDir(config.version, serverProject), serverJar.jarName),
        clientCache: embeddedClientDir(),
        launcher: launcher?.type ?? "embedded",
        instance: resolvedInstance,
      },
    });
  }

  return 0;
}
