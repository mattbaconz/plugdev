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

export async function runClientSetup(
  cwd: string,
  opts: { force?: boolean; download?: boolean } = {},
): Promise<number> {
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const instanceId =
    config.client?.instance ?? defaultInstanceId(config.version);

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

  const exists = await instanceExists(launcher, instanceId);
  if (exists && !opts.force) {
    const mcVer = await readInstanceMcVersion(launcher, instanceId);
    success(`Instance "${instanceId}" exists (MC ${mcVer ?? "unknown"})`);
    if (mcVer && mcVer !== config.version) {
      warn(`Version mismatch: instance=${mcVer}, plugdev.yml=${config.version}`);
      info("Re-run with --force to reprovision.");
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
      warn("Instance MC version does not match server — fix before plugdev run");
    }
  }

  info(`\nMinecraft version: ${config.version}`);
  info(`Suggested plugdev.yml:`);
  info(`  client:`);
  info(`    launcher: auto`);
  if (config.client?.executable) {
    info(`    executable: ${config.client.executable}`);
  }
  info(`    instance: ${instanceId}`);
  info(`    offlineName: DevPlayer`);

  return 0;
}
