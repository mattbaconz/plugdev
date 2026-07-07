import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { checkGradle, checkJava, checkMaven, parseJavaMajor } from "../util/tools.js";
import {
  detectLauncher,
  instanceExists,
  defaultInstanceId,
  readInstanceMcVersion,
} from "../client/detect.js";
import { heading, info, success, warn } from "../util/log.js";
import pc from "picocolors";

export async function runDoctor(cwd: string): Promise<number> {
  heading("PlugDev Doctor\n");

  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);

  info(`Project type: ${pc.bold(project.type)}`);
  info(`Build system: ${pc.bold(project.buildSystem)}`);
  if (project.pluginName) info(`Plugin name: ${project.pluginName}`);
  if (project.loader) info(`Mod loader: ${project.loader}`);
  info(`Minecraft version: ${config.version}`);
  info(`Config jar task: ${config.build.jarTask}`);

  const java = await checkJava();
  if (java.ok) {
    const major = java.major ?? parseJavaMajor(java.version);
    if (major !== undefined && major < 21) {
      warn(`Java ${java.version} found — Paper 1.21+ needs Java 21+`);
    } else {
      success(`Java: ${java.version}`);
    }
  } else warn("Java not found on PATH");

  if (project.buildSystem === "gradle") {
    const g = await checkGradle(cwd);
    if (g) success("Gradle wrapper: OK");
    else warn("Gradle wrapper not found");
  }

  if (project.buildSystem === "maven") {
    const m = await checkMaven(cwd);
    if (m) success("Maven: OK");
    else warn("Maven not found");
  }

  if (project.type === "unknown") {
    warn("Could not detect plugin or mod project");
    return 3;
  }

  const launcher = await detectLauncher("auto", config.client);
  if (launcher) {
    success(`MC launcher: ${launcher.type} (${launcher.probeSource})`);
    info(`  ${launcher.executable}`);
    const instanceId =
      config.client?.instance ?? defaultInstanceId(config.version);
    if (await instanceExists(launcher, instanceId)) {
      const instanceMc = await readInstanceMcVersion(launcher, instanceId);
      if (instanceMc === config.version) {
        success(`Client instance: ${instanceId} (MC ${instanceMc})`);
      } else if (instanceMc) {
        warn(
          `Client instance "${instanceId}" is MC ${instanceMc}, server uses ${config.version}`,
        );
        info("Run: plugdev client setup --force");
      } else {
        success(`Client instance: ${instanceId} (version unknown — launch once in Prism)`);
      }
    } else {
      warn(`Client instance "${instanceId}" not found — run: plugdev client setup`);
    }
  } else if (project.type === "plugin") {
    warn("No Prism/MultiMC found — run: plugdev client detect");
    info("Or set client.executable in plugdev.yml");
    info("Or use: plugdev open --embedded");
  }

  success("Ready for plugdev");
  return 0;
}
