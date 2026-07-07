import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { DetectedProject } from "../detect/project.js";

export interface PlugDevConfig {
  type?: "plugin" | "mod" | "network" | "pack";
  server?: "paper" | "spigot" | "folia" | "purpur";
  version?: string;
  port?: number;
  loader?: string;
  build?: {
    system?: "gradle" | "maven";
    task?: string;
    jarTask?: string;
  };
  dev?: {
    mode?: "client" | "server" | "datagen";
    subproject?: string;
    gamemode?: string;
    world?: string;
    op?: boolean;
    peaceful?: boolean;
    onlineMode?: boolean;
  };
  watch?: {
    paths?: string[];
    debounceMs?: number;
    reload?: {
      java?: string;
      assets?: string;
      data?: string;
    };
  };
  deps?: Array<{
    name: string;
    source?: "hangar" | "modrinth" | "url";
    version?: string;
    url?: string;
    author?: string;
    slug?: string;
  }>;
  jvm?: {
    memory?: string;
    args?: string[];
    debugPort?: number;
  };
}

export interface ResolvedConfig {
  type: "plugin" | "mod" | "network" | "pack";
  server: string;
  version: string;
  port: number;
  build: { system: "gradle" | "maven"; task: string; jarTask: string };
  watch: { paths: string[]; debounceMs: number };
  jvm: { memory: string; debugPort: number };
  dev: PlugDevConfig["dev"];
  deps: PlugDevConfig["deps"];
  loader?: string;
  devMode?: string;
  gradleSubproject?: string;
  raw: PlugDevConfig;
}

export interface CliOverrides {
  minecraftVersion?: string;
  port?: number;
  noWatch?: boolean;
  folia?: boolean;
  server?: boolean;
  loader?: string;
  configPath?: string;
}

export async function loadConfig(
  cwd: string,
  project: DetectedProject,
  overrides: CliOverrides = {},
): Promise<ResolvedConfig> {
  let raw: PlugDevConfig = {};

  const configPath =
    overrides.configPath ??
    project.configPath ??
    (await tryConfig(join(cwd, "plugdev.yml"))) ??
    (await tryConfig(join(cwd, ".plugdev", "plugdev.yml")));

  if (configPath) {
    raw = parseYaml(await readFile(configPath, "utf8")) as PlugDevConfig;
  }

  const type =
    raw.type ??
    (project.type !== "unknown" ? project.type : "plugin");

  const version =
    overrides.minecraftVersion ??
    raw.version ??
    project.minecraftVersion ??
    "1.21.4";

  // Normalize api-version 1.21 -> pick latest patch in cache layer
  const normalizedVersion = version.includes(".") && version.split(".").length === 2
    ? `${version}.4`
    : version;

  return {
    type: type as ResolvedConfig["type"],
    server: overrides.folia ? "folia" : raw.server ?? "paper",
    version: normalizedVersion,
    port: overrides.port ?? raw.port ?? 25565,
    build: {
      system:
        raw.build?.system ??
        (project.buildSystem === "maven" ? "maven" : "gradle"),
      task: raw.build?.task ?? "build",
      jarTask: raw.build?.jarTask ?? (project.hasShadowJar ? "shadowJar" : "jar"),
    },
    watch: {
      paths: raw.watch?.paths ?? ["src/"],
      debounceMs: raw.watch?.debounceMs ?? 500,
    },
    jvm: {
      memory: raw.jvm?.memory ?? "2G",
      debugPort: raw.jvm?.debugPort ?? 0,
    },
    dev: raw.dev,
    deps: raw.deps ?? [],
    loader: overrides.loader ?? raw.loader ?? project.loader,
    devMode: overrides.server ? "server" : raw.dev?.mode ?? "client",
    gradleSubproject: raw.dev?.subproject ?? project.gradleSubproject,
    raw,
  };
}

async function tryConfig(path: string): Promise<string | undefined> {
  try {
    await readFile(path, "utf8");
    return path;
  } catch {
    return undefined;
  }
}

export function getBundledBootstrapPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "bootstrap", "plugdev-bootstrap-paper.jar");
}
