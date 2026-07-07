import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";

export type ProjectType = "plugin" | "mod" | "network" | "pack" | "unknown";
export type BuildSystem = "gradle" | "maven" | "none";

export interface DetectedProject {
  type: ProjectType;
  buildSystem: BuildSystem;
  minecraftVersion?: string;
  pluginName?: string;
  mainClass?: string;
  loader?: "fabric" | "neoforge" | "quilt" | "forge";
  gradleSubproject?: string;
  hasShadowJar: boolean;
  configPath?: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function parsePluginYml(content: string): { name?: string; apiVersion?: string; main?: string } {
  const name = content.match(/^name:\s*['"]?(.+?)['"]?\s*$/m)?.[1];
  const apiVersion = content.match(/^api-version:\s*['"]?(.+?)['"]?\s*$/m)?.[1];
  const main = content.match(/^main:\s*['"]?(.+?)['"]?\s*$/m)?.[1];
  return { name, apiVersion, main };
}

function parseGradleProperties(content: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) props[m[1].trim()] = m[2].trim();
  }
  return props;
}

export async function detectProject(cwd: string): Promise<DetectedProject> {
  const result: DetectedProject = {
    type: "unknown",
    buildSystem: "none",
    hasShadowJar: false,
  };

  const plugdevYml = (await exists(join(cwd, "plugdev.yml")))
    ? join(cwd, "plugdev.yml")
    : (await exists(join(cwd, ".plugdev", "plugdev.yml")))
      ? join(cwd, ".plugdev", "plugdev.yml")
      : undefined;

  if (plugdevYml) result.configPath = plugdevYml;

  const hasGradle =
    (await exists(join(cwd, "build.gradle"))) ||
    (await exists(join(cwd, "build.gradle.kts")));
  const hasMaven = await exists(join(cwd, "pom.xml"));
  const hasGradlew =
    (await exists(join(cwd, "gradlew"))) ||
    (await exists(join(cwd, "gradlew.bat")));

  if (hasGradle || hasGradlew) result.buildSystem = "gradle";
  else if (hasMaven) result.buildSystem = "maven";

  const gradleContent =
    (await readText(join(cwd, "build.gradle.kts"))) ??
    (await readText(join(cwd, "build.gradle"))) ??
    "";

  result.hasShadowJar =
    gradleContent.includes("shadow") ||
    gradleContent.includes("com.github.johnrengelman.shadow") ||
    gradleContent.includes("com.gradleup.shadow");

  // Mod detection
  const fabricModJson = await readText(
    join(cwd, "src", "main", "resources", "fabric.mod.json"),
  );
  if (fabricModJson || gradleContent.includes("fabric-loom") || gradleContent.includes("fabric loom")) {
    result.type = "mod";
    result.loader = gradleContent.includes("quilt") ? "quilt" : "fabric";
    const props = parseGradleProperties(
      (await readText(join(cwd, "gradle.properties"))) ?? "",
    );
    result.minecraftVersion = props.minecraft_version ?? props.minecraftVersion;
    if (gradleContent.includes(":fabric")) result.gradleSubproject = ":fabric";
    if (gradleContent.includes(":neoforge")) result.gradleSubproject = ":neoforge";
    return result;
  }

  if (
    gradleContent.includes("net.neoforged.moddev") ||
    gradleContent.includes("neoforge.mods.toml")
  ) {
    result.type = "mod";
    result.loader = "neoforge";
    const props = parseGradleProperties(
      (await readText(join(cwd, "gradle.properties"))) ?? "",
    );
    result.minecraftVersion = props.minecraft_version ?? props.minecraftVersion;
    return result;
  }

  // Plugin detection
  const pluginYmlPaths = [
    join(cwd, "src", "main", "resources", "plugin.yml"),
    join(cwd, "src", "main", "resources", "paper-plugin.yml"),
  ];

  for (const p of pluginYmlPaths) {
    const content = await readText(p);
    if (content) {
      result.type = "plugin";
      const parsed = parsePluginYml(content);
      result.pluginName = parsed.name;
      result.mainClass = parsed.main;
      result.minecraftVersion = parsed.apiVersion;
      break;
    }
  }

  if (result.type === "plugin" && !result.minecraftVersion) {
    const props = parseGradleProperties(
      (await readText(join(cwd, "gradle.properties"))) ?? "",
    );
    result.minecraftVersion = props.minecraftVersion ?? props.paperVersion;
  }

  // Maven plugin
  if (result.type === "unknown" && hasMaven) {
    const pom = (await readText(join(cwd, "pom.xml"))) ?? "";
    if (pom.includes("paper-api")) {
      result.type = "plugin";
      result.buildSystem = "maven";
    }
  }

  return result;
}
