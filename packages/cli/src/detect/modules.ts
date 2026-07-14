import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";

export type ModuleKind = "plugin" | "library" | "unknown";

export interface ModuleCandidate {
  /** Module id as used by Maven `-pl` / Gradle subproject (e.g. "worldevents-core"). */
  id: string;
  /** Relative directory from reactor root. */
  path: string;
  buildSystem: "maven" | "gradle";
  /** plugin = has plugin.yml/paper-plugin.yml; library = jar packaging without plugin metadata. */
  kind: ModuleKind;
  pluginName?: string;
  mainClass?: string;
  apiVersion?: string;
  foliaSupported?: boolean;
  artifactId?: string;
  finalName?: string;
  hasShade?: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** True when `main` maps to a .java/.kt file under the module's source tree. */
async function moduleHasMainSource(moduleBase: string, mainClass: string): Promise<boolean> {
  const rel = mainClass.replace(/\./g, "/");
  const candidates = [
    join(moduleBase, "src", "main", "java", `${rel}.java`),
    join(moduleBase, "src", "main", "kotlin", `${rel}.kt`),
  ];
  for (const p of candidates) {
    if (await exists(p)) return true;
  }
  return false;
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function parsePluginYml(content: string): {
  name?: string;
  apiVersion?: string;
  main?: string;
  foliaSupported: boolean;
} {
  const name = content.match(/^name:\s*['"]?(.+?)['"]?\s*$/m)?.[1];
  const apiVersion = content.match(/^api-version:\s*['"]?(.+?)['"]?\s*$/m)?.[1];
  const main = content.match(/^main:\s*['"]?(.+?)['"]?\s*$/m)?.[1];
  const foliaSupported =
    /folia-supported:\s*true/i.test(content) ||
    /folia:\s*true/i.test(content) ||
    /supports-folia:\s*true/i.test(content);
  return { name, apiVersion, main, foliaSupported };
}

/** Extract `<module>…</module>` entries from a reactor pom. */
export function parseMavenModuleIds(pom: string): string[] {
  const modules: string[] = [];
  const block = pom.match(/<modules\b[^>]*>([\s\S]*?)<\/modules>/i);
  if (!block?.[1]) return modules;
  for (const m of block[1].matchAll(/<module>\s*([^<]+?)\s*<\/module>/gi)) {
    const id = m[1]?.trim();
    if (id) modules.push(id.replace(/\\/g, "/").replace(/\/$/, ""));
  }
  return modules;
}

/** Extract `include(...)` subprojects from settings.gradle(.kts). */
export function parseGradleModuleIds(settings: string): string[] {
  const modules: string[] = [];
  // include("a", "b") / include 'a', 'b' / include(":a")
  const includeRe =
    /include\s*\(?\s*((?:['"][^'"]+['"]\s*,?\s*)+)\)?/gi;
  for (const m of settings.matchAll(includeRe)) {
    const args = m[1] ?? "";
    for (const part of args.matchAll(/['"]([^'"]+)['"]/g)) {
      let id = part[1]?.trim() ?? "";
      if (!id) continue;
      id = id.replace(/^:/, "").replace(/\\/g, "/");
      if (id && !modules.includes(id)) modules.push(id);
    }
  }
  return modules;
}

function parseArtifactId(pom: string): string | undefined {
  // Prefer project-level artifactId (first after modelVersion / parent), not dependency ones.
  // Strip dependencyManagement / dependencies blocks for a rough project-level read.
  const stripped = pom
    .replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/gi, "")
    .replace(/<dependencies>[\s\S]*?<\/dependencies>/gi, "")
    .replace(/<parent>[\s\S]*?<\/parent>/gi, "");
  return stripped.match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/i)?.[1]?.trim();
}

function parseFinalName(pom: string): string | undefined {
  return pom.match(/<finalName>\s*([^<]+?)\s*<\/finalName>/i)?.[1]?.trim();
}

async function classifyModuleDir(
  cwd: string,
  moduleId: string,
  buildSystem: "maven" | "gradle",
): Promise<ModuleCandidate> {
  const modPath = moduleId.replace(/\\/g, "/");
  const base = join(cwd, ...modPath.split("/"));
  const candidate: ModuleCandidate = {
    id: modPath,
    path: modPath,
    buildSystem,
    kind: "unknown",
  };

  const pluginPaths = [
    join(base, "src", "main", "resources", "plugin.yml"),
    join(base, "src", "main", "resources", "paper-plugin.yml"),
  ];
  for (const p of pluginPaths) {
    const content = await readText(p);
    if (!content) continue;
    const parsed = parsePluginYml(content);
    candidate.pluginName = parsed.name;
    candidate.mainClass = parsed.main;
    candidate.apiVersion = parsed.apiVersion;
    candidate.foliaSupported = parsed.foliaSupported;
    // Main class must exist in this module — otherwise vestigial / copied metadata.
    const mainLooksReal = parsed.main
      ? await moduleHasMainSource(base, parsed.main)
      : false;
    candidate.kind = mainLooksReal ? "plugin" : "library";
    break;
  }

  if (buildSystem === "maven") {
    const pom = await readText(join(base, "pom.xml"));
    if (pom) {
      candidate.artifactId = parseArtifactId(pom);
      candidate.finalName = parseFinalName(pom);
      candidate.hasShade = pom.includes("maven-shade-plugin");
      if (candidate.kind === "unknown") {
        const packaging =
          pom.match(/<packaging>\s*([^<]+?)\s*<\/packaging>/i)?.[1]?.trim() ??
          "jar";
        candidate.kind = packaging === "jar" ? "library" : "unknown";
      }
    }
  } else {
    const gradle =
      (await readText(join(base, "build.gradle.kts"))) ??
      (await readText(join(base, "build.gradle"))) ??
      "";
    if (gradle) {
      candidate.hasShade =
        gradle.includes("shadow") ||
        gradle.includes("com.github.johnrengelman.shadow") ||
        gradle.includes("com.gradleup.shadow");
      if (candidate.kind === "unknown") {
        // Subproject with a build file but no plugin.yml → treat as library
        candidate.kind = "library";
      }
    }
  }

  return candidate;
}

export async function detectMavenModules(cwd: string): Promise<ModuleCandidate[]> {
  const pom = await readText(join(cwd, "pom.xml"));
  if (!pom) return [];
  const ids = parseMavenModuleIds(pom);
  if (ids.length === 0) return [];
  const out: ModuleCandidate[] = [];
  for (const id of ids) {
    out.push(await classifyModuleDir(cwd, id, "maven"));
  }
  return demoteVestigialPluginModules(out);
}

export async function detectGradleModules(cwd: string): Promise<ModuleCandidate[]> {
  const settings =
    (await readText(join(cwd, "settings.gradle.kts"))) ??
    (await readText(join(cwd, "settings.gradle")));
  if (!settings) return [];
  const ids = parseGradleModuleIds(settings);
  if (ids.length === 0) return [];
  const out: ModuleCandidate[] = [];
  for (const id of ids) {
    out.push(await classifyModuleDir(cwd, id, "gradle"));
  }
  return demoteVestigialPluginModules(out);
}

/**
 * When the reactor has shaded / finalName deployable plugins, demote sibling
 * modules that only carry vestigial plugin.yml (no shade, no finalName) to library.
 * Matches layouts like WorldEvents (common + core + pro).
 */
export function demoteVestigialPluginModules(
  modules: ModuleCandidate[],
): ModuleCandidate[] {
  const deployables = modules.filter(
    (m) => m.kind === "plugin" && (m.hasShade === true || Boolean(m.finalName)),
  );
  if (deployables.length === 0) return modules;
  return modules.map((m) => {
    if (m.kind !== "plugin") return m;
    if (m.hasShade || m.finalName) return m;
    return { ...m, kind: "library" as const };
  });
}

export async function detectModules(
  cwd: string,
  buildSystem: "maven" | "gradle" | "node" | "none",
): Promise<ModuleCandidate[]> {
  if (buildSystem === "maven") return detectMavenModules(cwd);
  if (buildSystem === "gradle") return detectGradleModules(cwd);
  // Try both if unknown
  const maven = await detectMavenModules(cwd);
  if (maven.length > 0) return maven;
  return detectGradleModules(cwd);
}

export function pluginModules(modules: ModuleCandidate[]): ModuleCandidate[] {
  return modules.filter((m) => m.kind === "plugin");
}

export function needsModuleSelection(modules: ModuleCandidate[]): boolean {
  return pluginModules(modules).length >= 2;
}

/** Prefer first plugin-kind module in reactor declaration order. */
export function autoSelectModule(modules: ModuleCandidate[]): ModuleCandidate | undefined {
  return pluginModules(modules)[0];
}

export function defaultJarPatternForModule(
  moduleId: string,
  buildSystem: "maven" | "gradle",
  finalName?: string,
): string {
  const id = moduleId.replace(/\\/g, "/").replace(/\/$/, "");
  if (buildSystem === "maven") {
    if (finalName && !finalName.includes("${")) {
      return `${id}/target/${finalName}.jar`;
    }
    return `${id}/target/*.jar`;
  }
  return `${id}/build/libs/*.jar`;
}

export function defaultWatchPathsForModule(
  modules: ModuleCandidate[],
  selectedId: string,
): string[] {
  const paths = new Set<string>();
  for (const m of modules) {
    if (m.kind === "library" || m.id === selectedId) {
      paths.add(`${m.path.replace(/\\/g, "/")}/src/`);
    }
  }
  if (paths.size === 0) paths.add("src/");
  return [...paths];
}

/** Resolve Folia support from a specific module (or root when module unset). */
export async function detectFoliaSupportForModule(
  cwd: string,
  moduleId?: string,
): Promise<"declared" | "unknown" | "absent"> {
  const base = moduleId
    ? join(cwd, ...moduleId.replace(/\\/g, "/").split("/"))
    : cwd;
  const paths = [
    join(base, "src", "main", "resources", "paper-plugin.yml"),
    join(base, "src", "main", "resources", "plugin.yml"),
  ];
  let sawMetadata = false;
  for (const p of paths) {
    const content = await readText(p);
    if (!content) continue;
    sawMetadata = true;
    if (
      /folia-supported:\s*true/i.test(content) ||
      /folia:\s*true/i.test(content) ||
      /supports-folia:\s*true/i.test(content)
    ) {
      return "declared";
    }
  }
  return sawMetadata ? "absent" : "unknown";
}

export async function moduleDirExists(cwd: string, moduleId: string): Promise<boolean> {
  return exists(join(cwd, ...moduleId.replace(/\\/g, "/").split("/")));
}
