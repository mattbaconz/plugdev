import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { info } from "../util/log.js";
import {
  detectModules,
  needsModuleSelection,
  autoSelectModule,
  type ModuleCandidate,
} from "./modules.js";

export type ProjectType =
  | "plugin"
  | "mod"
  | "network"
  | "pack"
  | "discord-bot"
  | "unknown";
export type BuildSystem = "gradle" | "maven" | "node" | "none";

export interface DetectedProject {
  type: ProjectType;
  buildSystem: BuildSystem;
  minecraftVersion?: string;
  pluginName?: string;
  mainClass?: string;
  loader?: "fabric" | "neoforge" | "quilt" | "forge";
  gradleSubproject?: string;
  hasShadowJar: boolean;
  /** True when blue.lhf:run-paper-maven-plugin is present in pom.xml. */
  hasRunPaperMaven?: boolean;
  /** True when paper-plugin.yml / plugin.yml declares Folia support. */
  foliaSupported?: boolean;
  /** Suggested server software for generated plugdev.yml (Folia when declared). */
  suggestedServer?: "paper" | "folia";
  /** Discord bot entry hint from package.json */
  botEntry?: string;
  botTokenEnv?: string;
  configPath?: string;
  /** Multi-module reactor candidates (Maven/Gradle). */
  modules?: ModuleCandidate[];
  /** True when 2+ plugin-kind modules exist and user should pick one. */
  needsModuleSelection?: boolean;
  /** Suggested build.module when auto-selected (single plugin module or first of many). */
  suggestedModule?: string;
}

export type FoliaSupport = "declared" | "unknown" | "absent";

/**
 * Best-effort Folia support signal from plugin metadata.
 * Does not prove the plugin is Folia-safe — only whether authors declared support.
 * When `moduleId` is set, reads that module's resources (multi-module reactors).
 */
export async function detectFoliaSupport(
  cwd: string,
  moduleId?: string,
): Promise<FoliaSupport> {
  const { detectFoliaSupportForModule } = await import("./modules.js");
  return detectFoliaSupportForModule(cwd, moduleId);
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

function parsePaperApiVersionFromPom(pom: string): string | undefined {
  // <artifactId>paper-api</artifactId> ... <version>1.21.4-R0.1-SNAPSHOT</version>
  const block = pom.match(
    /<artifactId>\s*paper-api\s*<\/artifactId>[\s\S]*?<version>\s*([^<]+?)\s*<\/version>/i,
  );
  if (!block?.[1]) return undefined;
  const raw = block[1].trim();
  // Strip Maven classifier suffix like -R0.1-SNAPSHOT → 1.21.4
  const mc = raw.match(/^(\d+\.\d+(?:\.\d+)?)/);
  return mc?.[1];
}

/** Parse MC version from Gradle paper-api / spigot-api dependency coordinates. */
function parsePaperApiVersionFromGradle(gradle: string): string | undefined {
  const patterns = [
    /(?:paper|spigot)-api[:\s"']+(\d+\.\d+(?:\.\d+)?)(?:-R[\d.]+)?(?:-SNAPSHOT)?/i,
    /io\.papermc\.paper:paper-api:(\d+\.\d+(?:\.\d+)?)/i,
    /org\.spigotmc:spigot-api:(\d+\.\d+(?:\.\d+)?)/i,
  ];
  for (const re of patterns) {
    const m = gradle.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function hasGradlePluginSignal(gradle: string): boolean {
  const needles = [
    "paper-api",
    "spigot-api",
    "xyz.jpenilla.run-paper",
    "run-paper",
    "com.rikonardo.papermake",
    "papermake",
    "ru.endlesscode.bukkitgradle",
    "bukkitgradle",
    "io.papermc.paperweight",
    "paperweight",
  ];
  const lower = gradle.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

function parseGradleProperties(content: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) props[m[1].trim()] = m[2].trim();
  }
  return props;
}

function isFoliaDeclared(content: string): boolean {
  return (
    /folia-supported:\s*true/i.test(content) ||
    /folia:\s*true/i.test(content) ||
    /supports-folia:\s*true/i.test(content)
  );
}

/** Human-readable one-line detection summary for init / setup / run. */
export function formatDetectionSummary(
  project: DetectedProject,
  opts?: { version?: string; jarTask?: string; server?: string },
): string {
  const parts: string[] = [];
  const type = project.type === "unknown" ? "unknown" : project.type;
  parts.push(type);
  if (project.pluginName) parts.push(project.pluginName);
  if (project.loader) parts.push(project.loader);
  if (project.buildSystem !== "none") parts.push(project.buildSystem);
  const version = opts?.version ?? project.minecraftVersion;
  if (version) parts.push(`MC ${version}`);
  if (opts?.server) parts.push(opts.server);
  const jarTask = opts?.jarTask ?? (project.hasShadowJar ? "shadowJar" : undefined);
  if (jarTask && project.type === "plugin") parts.push(jarTask);
  if (project.foliaSupported) parts.push("folia-supported");
  return parts.join(" · ");
}

export function printDetectionSummary(
  project: DetectedProject,
  opts?: { version?: string; jarTask?: string; server?: string },
): void {
  info(`Detected: ${formatDetectionSummary(project, opts)}`);
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
    (await exists(join(cwd, "build.gradle.kts"))) ||
    (await exists(join(cwd, "settings.gradle"))) ||
    (await exists(join(cwd, "settings.gradle.kts")));
  const hasMaven = await exists(join(cwd, "pom.xml"));
  const hasGradlew =
    (await exists(join(cwd, "gradlew"))) ||
    (await exists(join(cwd, "gradlew.bat")));
  const hasMvnw =
    (await exists(join(cwd, "mvnw"))) ||
    (await exists(join(cwd, "mvnw.cmd")));

  if (hasGradle || hasGradlew) result.buildSystem = "gradle";
  else if (hasMaven || hasMvnw) result.buildSystem = "maven";

  const gradleContent =
    (await readText(join(cwd, "build.gradle.kts"))) ??
    (await readText(join(cwd, "build.gradle"))) ??
    "";

  const pomContent = hasMaven
    ? ((await readText(join(cwd, "pom.xml"))) ?? "")
    : "";

  result.hasShadowJar =
    gradleContent.includes("shadow") ||
    gradleContent.includes("com.github.johnrengelman.shadow") ||
    gradleContent.includes("com.gradleup.shadow") ||
    pomContent.includes("maven-shade-plugin");

  if (pomContent.includes("run-paper-maven-plugin")) {
    result.hasRunPaperMaven = true;
  }

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
    if (gradleContent.includes(":neoforge")) result.gradleSubproject = ":neoforge";
    return result;
  }

  // Legacy Forge (ForgeGradle / mods.toml without NeoForge)
  const modsToml =
    (await readText(join(cwd, "src", "main", "resources", "META-INF", "mods.toml"))) ||
    (await readText(join(cwd, "src", "main", "resources", "META-INF", "neoforge.mods.toml")));
  if (
    modsToml ||
    gradleContent.includes("net.minecraftforge.gradle") ||
    gradleContent.includes("ForgeGradle") ||
    gradleContent.includes("fg.deobf")
  ) {
    const isNeo =
      gradleContent.includes("net.neoforged") ||
      (modsToml?.includes("neoforge") ?? false);
    if (!isNeo) {
      result.type = "mod";
      result.loader = "forge";
      const props = parseGradleProperties(
        (await readText(join(cwd, "gradle.properties"))) ?? "",
      );
      result.minecraftVersion =
        props.minecraft_version ?? props.minecraftVersion ?? props.mc_version;
      return result;
    }
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
      result.foliaSupported = isFoliaDeclared(content);
      if (result.foliaSupported) result.suggestedServer = "folia";
      break;
    }
  }

  if (result.type === "plugin" && !result.minecraftVersion) {
    const props = parseGradleProperties(
      (await readText(join(cwd, "gradle.properties"))) ?? "",
    );
    result.minecraftVersion =
      props.minecraftVersion ??
      props.paperVersion ??
      props.minecraft_version ??
      parsePaperApiVersionFromGradle(gradleContent);
  }

  if (result.type === "plugin" && !result.minecraftVersion && pomContent) {
    result.minecraftVersion = parsePaperApiVersionFromPom(pomContent);
  }

  // Gradle plugin (no plugin.yml yet, but paper/spigot signals in build)
  if (result.type === "unknown" && (hasGradle || hasGradlew) && hasGradlePluginSignal(gradleContent)) {
    result.type = "plugin";
    result.buildSystem = "gradle";
    const props = parseGradleProperties(
      (await readText(join(cwd, "gradle.properties"))) ?? "",
    );
    result.minecraftVersion =
      props.minecraftVersion ??
      props.paperVersion ??
      props.minecraft_version ??
      parsePaperApiVersionFromGradle(gradleContent);
  }

  // Maven plugin (no plugin.yml yet, but paper-api in pom)
  if (result.type === "unknown" && (hasMaven || hasMvnw)) {
    const pom = pomContent || ((await readText(join(cwd, "pom.xml"))) ?? "");
    if (pom.includes("paper-api") || pom.includes("spigot-api")) {
      result.type = "plugin";
      result.buildSystem = "maven";
      result.minecraftVersion = parsePaperApiVersionFromPom(pom);
      if (pom.includes("maven-shade-plugin")) result.hasShadowJar = true;
      if (pom.includes("run-paper-maven-plugin")) result.hasRunPaperMaven = true;
    }
  }

  // Multi-module reactor: scan submodules when root has no plugin signal
  if (
    result.type === "unknown" ||
    (result.type === "plugin" && !result.pluginName)
  ) {
    const buildSys =
      result.buildSystem === "maven" || result.buildSystem === "gradle"
        ? result.buildSystem
        : hasMaven
          ? "maven"
          : hasGradle || hasGradlew
            ? "gradle"
            : "none";
    if (buildSys === "maven" || buildSys === "gradle") {
      const modules = await detectModules(cwd, buildSys);
      if (modules.length > 0) {
        result.modules = modules;
        result.needsModuleSelection = needsModuleSelection(modules);
        const selected = autoSelectModule(modules);
        if (selected) {
          result.type = "plugin";
          result.buildSystem = buildSys;
          result.suggestedModule = selected.id;
          if (!result.pluginName) result.pluginName = selected.pluginName;
          if (!result.mainClass) result.mainClass = selected.mainClass;
          if (!result.minecraftVersion) result.minecraftVersion = selected.apiVersion;
          if (selected.foliaSupported) {
            result.foliaSupported = true;
            result.suggestedServer = "folia";
          }
          if (selected.hasShade) result.hasShadowJar = true;
        } else if (modules.some((m) => m.hasShade)) {
          result.hasShadowJar = true;
        }

        // Root pom paper-api version as fallback
        if (!result.minecraftVersion && pomContent) {
          result.minecraftVersion = parsePaperApiVersionFromPom(pomContent);
        }
        if (
          !result.minecraftVersion &&
          (hasGradle || hasGradlew) &&
          gradleContent
        ) {
          result.minecraftVersion = parsePaperApiVersionFromGradle(gradleContent);
        }
      }
    }
  } else if (result.buildSystem === "maven" || result.buildSystem === "gradle") {
    // Still attach module list when root already detected as plugin (single-module or hybrid)
    const modules = await detectModules(cwd, result.buildSystem);
    if (modules.length > 0) {
      result.modules = modules;
      result.needsModuleSelection = needsModuleSelection(modules);
      if (!result.suggestedModule) {
        const selected = autoSelectModule(modules);
        if (selected) result.suggestedModule = selected.id;
      }
    }
  }

  // Discord bot (Node) — only if not already a Minecraft project
  if (result.type === "unknown") {
    const pkgRaw = await readText(join(cwd, "package.json"));
    if (pkgRaw) {
      try {
        const pkg = JSON.parse(pkgRaw) as {
          main?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = {
          ...(pkg.dependencies ?? {}),
          ...(pkg.devDependencies ?? {}),
        };
        const discordLibs = [
          "discord.js",
          "@discordjs/core",
          "oceanic.js",
          "eris",
        ];
        if (discordLibs.some((name) => name in deps)) {
          result.type = "discord-bot";
          result.buildSystem = "node";
          result.botTokenEnv = "DISCORD_TOKEN";
          result.botEntry =
            pkg.scripts?.dev?.trim() ||
            pkg.scripts?.start?.trim() ||
            pkg.main?.trim() ||
            undefined;
          result.pluginName = undefined;
        }
      } catch {
        // ignore invalid package.json
      }
    }
  }

  return result;
}
