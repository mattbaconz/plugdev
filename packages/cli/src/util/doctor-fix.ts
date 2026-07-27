/** Prioritized copy-paste Fix line for `plugdev doctor` (exit ≠ 0). */

export interface DoctorFixInput {
  isDiscordBot: boolean;
  isMod: boolean;
  projectType: string;
  javaOk: boolean;
  minJava: number;
  gradleOk?: boolean;
  mavenOk?: boolean;
  buildSystem: string;
  bootstrapOk: boolean;
  spigotMissing: boolean;
  spigotJarPath?: string;
  spigotVersion?: string;
  nodeOk?: boolean;
  tokenPresent?: boolean;
  tokenEnvName?: string;
  setupReady: boolean;
  toolchainReady: boolean;
  needsModuleSelection?: boolean;
  pluginModuleIds?: string[];
}

/**
 * Single next command for a failing doctor report.
 * Priority: Java → build wrapper → bootstrap → Spigot → setup → module.
 */
export function doctorFixCommand(input: DoctorFixInput): string | undefined {
  if (input.toolchainReady && input.setupReady) {
    return undefined;
  }

  if (input.isDiscordBot) {
    if (input.nodeOk === false) {
      return "Install Node.js from https://nodejs.org/";
    }
    if (input.tokenPresent === false) {
      return `Set ${input.tokenEnvName ?? "DISCORD_TOKEN"} in the environment or .env`;
    }
    return undefined;
  }

  if (input.projectType === "unknown") {
    return "Add plugin.yml (or fabric.mod.json) in a Maven/Gradle project, then re-run: plugdev doctor";
  }

  if (!input.javaOk) {
    return input.minJava >= 25
      ? `Install JDK ${input.minJava}+ (e.g. scoop install temurin${input.minJava}-jdk) — https://adoptium.net/`
      : `Install JDK ${input.minJava}+ from https://adoptium.net/`;
  }

  if (input.buildSystem === "gradle" && input.gradleOk === false) {
    return "Add a Gradle wrapper (gradlew) in the project root, then re-run: plugdev doctor";
  }

  if (input.buildSystem === "maven" && input.mavenOk === false) {
    return "Install Maven or add mvnw, then re-run: plugdev doctor";
  }

  if (!input.isMod && !input.bootstrapOk) {
    return "npm i -g @plugdev/cli@latest";
  }

  if (input.spigotMissing && input.spigotJarPath && input.spigotVersion) {
    return `Run BuildTools for ${input.spigotVersion} and copy spigot-${input.spigotVersion}.jar to ${input.spigotJarPath}`;
  }

  if (!input.setupReady) {
    return "plugdev setup";
  }

  if (input.needsModuleSelection && input.pluginModuleIds && input.pluginModuleIds.length > 0) {
    return `plugdev module use ${input.pluginModuleIds[0]}`;
  }

  return undefined;
}
