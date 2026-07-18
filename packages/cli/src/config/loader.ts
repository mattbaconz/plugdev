import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import type { DetectedProject } from "../detect/project.js";
import { info, warn } from "../util/log.js";

export interface PlugDevConfig {
  type?: "plugin" | "mod" | "network" | "pack" | "discord-bot";
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
  /** Discord bot (experimental) */
  bot?: {
    runtime?: "node";
    entry?: string;
    tokenEnv?: string;
  };
  build?: {
    system?: "gradle" | "maven";
    task?: string;
    jarTask?: string;
    jarPattern?: string;
    /** Maven reactor module for `-pl <module> -am` (multi-module). */
    module?: string;
  };
  dev?: {
    mode?: "client" | "server" | "datagen";
    subproject?: string;
    gamemode?: string;
    world?: string;
    op?: boolean;
    peaceful?: boolean;
    onlineMode?: boolean;
    /** Preferred editor for live config open (default auto). */
    configEditor?: "auto" | "cursor" | "code" | "notepad" | "system";
  };
  watch?: {
    paths?: string[];
    /** Live plugin-data files that trigger reload, relative to plugins/<name>/. */
    configs?: string[];
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
    /** When true, Prism/MultiMC launches with --offline offlineName. Default false (Microsoft account). */
    offline?: boolean;
    offlineName?: string;
    /** Extra offline players launched after the primary client on plug run. */
    players?: Array<{ name: string }>;
    joinOnReady?: boolean;
  };
  jvm?: {
    memory?: string;
    args?: string[];
    debugPort?: number;
  };
  /** Dev server folder lifecycle under .plugdev/run */
  run?: {
    /** never (default) | on-exit | worlds */
    cleanup?: "never" | "on-exit" | "worlds";
  };
  update?: {
    /** When true, auto-install @plugdev/cli@latest when outdated. */
    auto?: boolean;
  };
  /** Optional private PlugTrace dogfood integration (local JAR copy + identity). */
  integrations?: {
    plugtrace?: {
      enabled?: boolean;
      /** Path to built PlugTrace fat JAR (relative to project or absolute). */
      jar?: string;
      /** Which PlugTrace artifact to prefer when jar is unset / auto-resolving. */
      artifact?: "paper-modern" | "folia" | "auto";
    };
  };
}

export interface ResolvedConfig {
  type: "plugin" | "mod" | "network" | "pack" | "discord-bot";
  server: string;
  version: string;
  port: number;
  build: {
    system: "gradle" | "maven";
    task: string;
    jarTask: string;
    jarPattern?: string;
    module?: string;
  };
  watch: {
    paths: string[];
    configs: string[];
    debounceMs: number;
    reloadJava: "safe" | "restart" | "hotswap";
  };
  jvm: { memory: string; debugPort: number; args?: string[] };
  run: { cleanup: "never" | "on-exit" | "worlds" };
  bot?: {
    runtime: "node";
    entry?: string;
    tokenEnv: string;
  };
  dev: PlugDevConfig["dev"];
  deps: PlugDevConfig["deps"];
  client?: PlugDevConfig["client"];
  loader?: string;
  devMode?: string;
  gradleSubproject?: string;
  integrations: {
    plugtrace: {
      enabled: boolean;
      jar?: string;
      artifact: "paper-modern" | "folia" | "auto";
    };
  };
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
  /** Optional JDWP hotswap fast path for plugins (method bodies). */
  hotswap?: boolean;
  server?: boolean;
  /** Run datagen Gradle task (mods). */
  datagen?: boolean;
  /** Alias for server mode / headless test (mods). */
  test?: boolean;
  loader?: string;
  /** Override build.module for one-off runs (multi-module Maven/Gradle). */
  module?: string;
  configPath?: string;
  detach?: boolean;
  quiet?: boolean;
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

function resolveReloadJava(
  raw: PlugDevConfig,
  overrides: CliOverrides = {},
): "safe" | "restart" | "hotswap" {
  if (overrides.hotswap) return "hotswap";
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

  if (normalizedVersion !== version) {
    info(`Normalized MC version ${version} → ${normalizedVersion}`);
  }

  const wantsJdwp =
    overrides.debug === true ||
    overrides.hotswap === true ||
    raw.watch?.reload?.java === "hotswap";

  const debugPort = wantsJdwp
    ? raw.jvm?.debugPort && raw.jvm.debugPort > 0
      ? raw.jvm.debugPort
      : 5005
    : (raw.jvm?.debugPort ?? 0);

  const defaultWatchPaths =
    type === "discord-bot"
      ? (raw.watch?.paths ?? ["src/", "."]).filter((p) => p !== "node_modules")
      : (raw.watch?.paths ?? ["src/"]);

  return {
    type: type as ResolvedConfig["type"],
    server: resolveServer(raw, overrides),
    version: normalizedVersion,
    port: overrides.port ?? raw.port ?? 25565,
    build: {
      system:
        raw.build?.system ??
        (project.buildSystem === "maven" ? "maven" : "gradle"),
      task:
        raw.build?.task ??
        (project.buildSystem === "maven" || raw.build?.system === "maven"
          ? "package"
          : "build"),
      jarTask:
        raw.build?.jarTask ?? (project.hasShadowJar ? "shadowJar" : "jar"),
      module: (() => {
        const fromOverride = overrides.module?.trim();
        if (fromOverride) return fromOverride.replace(/^:/, "");
        if (raw.build?.module) return raw.build.module;
        // Auto-select single plugin module when config omits build.module
        if (project.suggestedModule && !project.needsModuleSelection) {
          return project.suggestedModule;
        }
        return undefined;
      })(),
      jarPattern: (() => {
        if (raw.build?.jarPattern && !overrides.module) return raw.build.jarPattern;
        const module =
          overrides.module?.trim().replace(/^:/, "") ||
          raw.build?.module ||
          (project.suggestedModule && !project.needsModuleSelection
            ? project.suggestedModule
            : undefined);
        const isMaven =
          project.buildSystem === "maven" || raw.build?.system === "maven";
        if (module) {
          const id = module.replace(/\\/g, "/").replace(/\/$/, "");
          return isMaven ? `${id}/target/*.jar` : `${id}/build/libs/*.jar`;
        }
        if (isMaven) return "target/*.jar";
        return undefined;
      })(),
    },
    watch: {
      paths: defaultWatchPaths,
      configs: raw.watch?.configs ?? ["config.yml"],
      debounceMs: raw.watch?.debounceMs ?? (type === "discord-bot" ? 400 : 300),
      reloadJava: resolveReloadJava(raw, overrides),
    },
    jvm: {
      memory: raw.jvm?.memory ?? "1G",
      debugPort,
      args: raw.jvm?.args,
    },
    run: {
      cleanup:
        raw.run?.cleanup === "on-exit" || raw.run?.cleanup === "worlds"
          ? raw.run.cleanup
          : "never",
    },
    bot:
      type === "discord-bot"
        ? {
            runtime: "node",
            entry: raw.bot?.entry ?? project.botEntry,
            tokenEnv: raw.bot?.tokenEnv ?? project.botTokenEnv ?? "DISCORD_TOKEN",
          }
        : undefined,
    dev: raw.dev,
    deps: (raw.deps ?? []).filter((d) => d.enabled !== false),
    client: raw.client,
    loader: overrides.loader ?? raw.loader ?? project.loader,
    integrations: {
      plugtrace: (() => {
        const pt = raw.integrations?.plugtrace;
        const artifact =
          pt?.artifact === "folia" || pt?.artifact === "paper-modern" || pt?.artifact === "auto"
            ? pt.artifact
            : "auto";
        return {
          enabled: pt?.enabled === true,
          jar: pt?.jar,
          artifact,
        };
      })(),
    },
    devMode: (() => {
      if (overrides.datagen) return "datagen";
      if (overrides.server || overrides.test) return "server";
      return raw.dev?.mode ?? "client";
    })(),
    gradleSubproject: (() => {
      if (raw.dev?.subproject) return raw.dev.subproject;
      const loader = (overrides.loader ?? raw.loader ?? project.loader)?.toLowerCase();
      if (loader === "fabric" || loader === "quilt") {
        return project.gradleSubproject?.includes("fabric")
          ? project.gradleSubproject
          : ":fabric";
      }
      if (loader === "neoforge") {
        return project.gradleSubproject?.includes("neoforge")
          ? project.gradleSubproject
          : ":neoforge";
      }
      if (loader === "forge") {
        return project.gradleSubproject ?? undefined;
      }
      // When --loader is set but no known mapping, still prefer detected subproject
      if (overrides.loader && !project.gradleSubproject) {
        return `:${overrides.loader.replace(/^:/, "")}`;
      }
      return project.gradleSubproject;
    })(),
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
