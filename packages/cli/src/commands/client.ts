import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import {
  detectLauncher,
  defaultInstanceId,
  probeAllLaunchers,
  readInstanceMcVersion,
  instanceExists,
} from "../client/detect.js";
import { ensureInstance } from "../client/instance.js";
import { listLauncherInstances } from "../client/instances-list.js";
import { writeClientInstanceToYml } from "../deps/config-write.js";
import { heading, info, success, warn } from "../util/log.js";
import pc from "picocolors";

export async function runClientDetect(cwd: string): Promise<number> {
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);

  heading("PlugDev client detect\n");

  const probes = await probeAllLaunchers(config.client);
  for (const probe of probes) {
    const mark = probe.found ? pc.green("found") : pc.dim("miss");
    info(`${mark.padEnd(8)} ${probe.source}`);
    if (probe.found) info(`         ${probe.path}`);
  }

  const launcher = await detectLauncher("auto", config.client);
  if (launcher) {
    success(`\nResolved: ${launcher.type} via ${launcher.probeSource}`);
    info(`Executable: ${launcher.executable}`);
    info(`Data dir:   ${launcher.dataDir}`);
  } else {
    warn("\nNo launcher resolved.");
    info("Set client.executable in plugdev.yml or PLUGDEV_PRISM_EXE env var.");
  }

  return launcher ? 0 : 1;
}

export async function runClientList(cwd: string): Promise<number> {
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);

  heading("Prism / MultiMC instances\n");

  const launcher = await detectLauncher("auto", config.client);
  if (!launcher) {
    warn("Prism Launcher or MultiMC not found.");
    info("Run: plugdev client detect");
    return 1;
  }

  success(`${launcher.type}: ${launcher.dataDir}`);
  const instances = await listLauncherInstances(launcher);
  if (instances.length === 0) {
    warn("No instances found.");
    return 1;
  }

  info("");
  info(`${"Folder id".padEnd(28)} ${"MC".padEnd(12)} Last launch`);
  info("─".repeat(60));
  for (const inst of instances) {
    const when =
      inst.lastLaunchTime > 0
        ? new Date(inst.lastLaunchTime).toLocaleString()
        : "never";
    const mark =
      config.client?.instance === inst.id ? pc.green("*") : " ";
    info(
      `${mark} ${inst.id.padEnd(26)} ${(inst.mcVersion ?? "?").padEnd(12)} ${when}`,
    );
    if (inst.name !== inst.id) {
      info(`    display: ${inst.name}`);
    }
  }

  info("");
  info("Use in plugdev.yml:");
  info(`  client:`);
  info(`    launcher: ${launcher.type}`);
  info(`    instance: "${instances[0].id}"`);
  info("");
  info(`Or: plugdev setup --instance "${instances[0].id}"`);
  return 0;
}

export async function runClientSetup(
  cwd: string,
  opts: { force?: boolean; download?: boolean; instance?: string } = {},
): Promise<number> {
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);

  heading("PlugDev client setup\n");

  const launcher = await detectLauncher("auto", config.client);
  if (!launcher) {
    warn("Prism Launcher or MultiMC not found.");
    info("Run: plugdev client detect");
    info("Or set client.executable in plugdev.yml");
    info("Or use embedded client: plugdev open --embedded");
    return 1;
  }

  success(`Found ${launcher.type}: ${launcher.executable}`);
  info(`Probe: ${launcher.probeSource}`);

  let instanceId =
    opts.instance ?? config.client?.instance ?? defaultInstanceId(config.version);

  if (opts.instance) {
    const wrote = await writeClientInstanceToYml(cwd, {
      launcher: launcher.type,
      instance: opts.instance,
    });
    if (wrote) {
      success(`Wrote client.instance: "${opts.instance}" to plugdev.yml`);
    }
    instanceId = opts.instance;
  }

  const exists = await instanceExists(launcher, instanceId);
  if (exists && !opts.force) {
    const mcVer = await readInstanceMcVersion(launcher, instanceId);
    success(`Instance "${instanceId}" exists (MC ${mcVer ?? "unknown"})`);
    if (mcVer && mcVer !== config.version) {
      warn(`Version mismatch: instance=${mcVer}, plugdev.yml=${config.version}`);
      info("OK if Via* deps are installed. Re-run with --force only to overwrite.");
    }
  } else {
    const result = await ensureInstance(launcher, config.version, instanceId, {
      force: opts.force,
    });
    if (result.created) {
      success(`Created instance "${result.instanceId}"`);
      info("Launch it once in Prism to download game files.");
    } else if (opts.force) {
      success(`Reprovisioned instance "${result.instanceId}" for MC ${config.version}`);
      info("Launch it once in Prism to download game files.");
    } else {
      success(`Instance "${result.instanceId}" ready`);
    }
    if (result.versionMismatch) {
      warn("Instance MC version does not match server — Via* deps recommended");
    }
  }

  if (!opts.instance && !config.client?.instance) {
    const list = await listLauncherInstances(launcher);
    if (list.length > 0) {
      info("\nAvailable instances (plugdev client list):");
      for (const inst of list.slice(0, 8)) {
        info(`  - "${inst.id}" (MC ${inst.mcVersion ?? "?"})`);
      }
      info(`Pick one: plugdev setup --instance "${list[0].id}"`);
    }
  }

  info(`\nMinecraft version: ${config.version}`);
  info(`Suggested plugdev.yml:`);
  info(`  client:`);
  info(`    launcher: ${launcher.type}`);
  if (config.client?.executable) {
    info(`    executable: ${config.client.executable}`);
  }
  info(`    instance: ${instanceId}`);
  info(`    offlineName: DevPlayer`);

  return 0;
}
