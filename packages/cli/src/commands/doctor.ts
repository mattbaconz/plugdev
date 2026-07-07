import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { checkGradle, checkJava, checkMaven } from "../util/tools.js";
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
  if (java.ok) success(`Java: ${java.version}`);
  else warn("Java not found on PATH");

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

  success("Ready for plugdev");
  return 0;
}
