import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import type { DetectedProject } from "../detect/project.js";
import { warn } from "../util/log.js";

export interface PlugDevConfig {
  type?: "plugin" | "mod" | "network" | "pack";
  proxy?: {
    software?: "velocity" | "waterfall";
    port?: number;
    version?: string;
  };
  backends?: Array<{
    name: string;
    software?: string;
    version?: string;
    port: number;
  }>;
  forwarding?: {
    secret?: string;
    generate?: boolean;
  };
  server?: "paper" | "spigot" | "folia" | "purpur" | "pufferfish";
  version?: string;
  port?: number;
  loader?: string;
  build?: {
    system?: "gradle" | "maven";
    task?: string;
    jarTask?: string;
    jarPattern?: string;
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
    enabled?: boolean;
    source?: "hangar" | "modrinth" | "url";
    version?: string;
    url?: string;
    author?: string;
    slug?: string;
  }>;
  client?: {
    launcher?: "auto" | "prism" | "multimc" | "embedded" | "none";
    executable?: string;
    instance?: string;
    offlineName?: string;
    joinOnReady?: boolean;
  };
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
  build: {
    system: "gradle" | "maven";
    task: string;
    jarTask: string;
    jarPattern?: string;
  };
  watch: {
    paths: string[];
    debounceMs: number;
    reloadJava: "safe" | "restart" | "hotswap";
  };
  jvm: { memory: string; debugPort: number };
  dev: PlugDevConfig["dev"];
  deps: PlugDevConfig["deps"];
  client?: PlugDevConfig["client"];
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
  paper?: boolean;
  purpur?: boolean;
  pufferfish?: boolean;
  spigot?: boolean;
  join?: boolean;
  debug?: boolean;
  server?: boolean;
  loader?: string;
  configPath?: string;
}

let cachedValidator: ReturnType<Ajv2020["compile"]> | undefined;

async function getValidator() {
  if (cachedValidator) return cachedValidator;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "spec", "plugdev.schema.json"),
    join(here, "..", "spec", "plugdev.schema.json"),
    join(here, "..", "..", "spec", "plugdev.schema.json"),
  ];
  let schemaRaw: string | undefined;
  for (const p of candidates) {
    try {
      schemaRaw = await readFile(p, "utf8");
      break;
    } catch {
      // try next
    }
  }
  if (!schemaRaw) return undefined;

  const schema = JSON.parse(schemaRaw);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

async function validateConfig(raw: PlugDevConfig, configPath?: string): Promise<void> {
  if (!raw || Object.keys(raw).length === 0) return;

  const validate = await getValidator();
  if (!validate) return;

  const payload = { type: raw.type ?? "plugin", ...raw };
  if (!validate(payload)) {
    const detail =
      validate.errors
        ?.map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim())
        .join("; ") ?? "unknown schema error";
    warn(
      `plugdev.yml validation warning${configPath ? ` (${configPath})` : ""}: ${detail}`,
    );
  }
}

function resolveServer(
  raw: PlugDevConfig,
  overrides: CliOverrides,
): string {
  if (overrides.folia) return "folia";
  if (overrides.purpur) return "purpur";
  if (overrides.pufferfish) return "pufferfish";
  if (overrides.spigot) return "spigot";
  if (overrides.paper) return "paper";
  return raw.server ?? "paper";
}

function resolveReloadJava(raw: PlugDevConfig): "safe" | "restart" | "hotswap" {
  const mode = raw.watch?.reload?.java;
  if (mode === "restart" || mode === "hotswap" || mode === "safe") return mode;
  return "safe";
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
    await validateConfig(raw, configPath);
  }

  const type =
    raw.type ?? (project.type !== "unknown" ? project.type : "plugin");

  const version =
    overrides.minecraftVersion ??
    raw.version ??
    project.minecraftVersion ??
    "1.21.4";

  const normalizedVersion =
    version.includes(".") && version.split(".").length === 2
      ? `${version}.4`
      : version;

  const debugPort =
    overrides.debug === true
      ? raw.jvm?.debugPort && raw.jvm.debugPort > 0
        ? raw.jvm.debugPort
        : 5005
      : (raw.jvm?.debugPort ?? 0);

  return {
    type: type as ResolvedConfig["type"],
    server: resolveServer(raw, overrides),
    version: normalizedVersion,
    port: overrides.port ?? raw.port ?? 25565,
    build: {
      system:
        raw.build?.system ??
        (project.buildSystem === "maven" ? "maven" : "gradle"),
      task: raw.build?.task ?? "build",
      jarTask:
        raw.build?.jarTask ?? (project.hasShadowJar ? "shadowJar" : "jar"),
      jarPattern: raw.build?.jarPattern,
    },
    watch: {
      paths: raw.watch?.paths ?? ["src/"],
      debounceMs: raw.watch?.debounceMs ?? 500,
      reloadJava: resolveReloadJava(raw),
    },
    jvm: {
      memory: raw.jvm?.memory ?? "2G",
      debugPort,
    },
    dev: raw.dev,
    deps: (raw.deps ?? []).filter((d) => d.enabled !== false),
    client: raw.client,
    loader: overrides.loader ?? raw.loader ?? project.loader,
    devMode: overrides.server ? "server" : (raw.dev?.mode ?? "client"),
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
