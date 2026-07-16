import { writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { detectProject, printDetectionSummary } from "../detect/project.js";
import {
  detectProjectDeps,
  formatDepsYaml,
  type DetectedHangarDep,
} from "../detect/deps.js";
import {
  defaultJarPatternForModule,
  defaultWatchPathsForModule,
  autoSelectModule,
} from "../detect/modules.js";
import { loadConfig } from "../config/loader.js";
import { CLI_VERSION } from "../constants.js";
import { heading, success, info, warn } from "../util/log.js";
import { formatNextSteps, initNextSteps } from "../util/shell-hints.js";
import { runSetup } from "./setup.js";
import { runAgentInstall } from "./agent.js";

function buildPluginTemplate(opts: {
  server: string;
  version: string;
  buildSystem: "gradle" | "maven";
  jarTask: string;
  deps: DetectedHangarDep[];
  reloadJava: string;
  module?: string;
  jarPattern?: string;
  watchPaths?: string[];
}): string {
  const depsBlock = formatDepsYaml(opts.deps);
  const watchPaths = opts.watchPaths?.length ? opts.watchPaths : ["src/"];
  const watchBlock = watchPaths.map((p) => `    - ${p}`).join("\n");

  let buildBlock: string;
  if (opts.buildSystem === "maven") {
    const lines = [
      "build:",
      "  system: maven",
      "  task: package",
    ];
    if (opts.module) lines.push(`  module: ${opts.module}`);
    lines.push(
      `  jarPattern: "${opts.jarPattern ?? (opts.module ? `${opts.module}/target/*.jar` : "target/*.jar")}"`,
    );
    buildBlock = lines.join("\n");
  } else {
    const lines = [
      "build:",
      "  system: gradle",
      "  task: build",
      `  jarTask: ${opts.jarTask}`,
    ];
    if (opts.module) {
      lines.push(`  module: ${opts.module}`);
      lines.push(
        `  jarPattern: "${opts.jarPattern ?? `${opts.module}/build/libs/*.jar`}"`,
      );
    }
    buildBlock = lines.join("\n");
  }

  return `# PlugDev configuration — auto-generated
type: plugin
server: ${opts.server}
version: "${opts.version}"
port: 25565

${buildBlock}

client:
  launcher: auto
  offline: false
  offlineName: DevPlayer

jvm:
  memory: 1G

# Keep .plugdev/run between sessions (fast). Options: never | on-exit | worlds
run:
  cleanup: never

dev:
  gamemode: creative
  world: void
  op: true
  peaceful: true
  onlineMode: false

# Via* for cross-version join + deps detected from plugin.yml / build files.
# Add more with: plugdev deps add <name>   Remove with: plugdev deps remove <name>
deps:
${depsBlock}

watch:
  paths:
${watchBlock}
  # Live files under .plugdev/run/plugins/<PluginName>/ that reload on save.
  configs:
    - config.yml
  debounceMs: 300
  reload:
    java: ${opts.reloadJava}
`;
}

const MOD_TEMPLATE = `# PlugDev configuration — auto-generated
type: mod
loader: {{loader}}
version: "{{version}}"

dev:
  mode: client
  gamemode: creative
  world: flat

watch:
  paths:
    - src/
    - src/main/resources/
  debounceMs: 500
  reload:
    java: restart
    assets: f3t
    data: reload
`;

const DISCORD_BOT_TEMPLATE = `# PlugDev configuration — auto-generated (experimental)
type: discord-bot

bot:
  runtime: node
  entry: auto
  tokenEnv: DISCORD_TOKEN

watch:
  paths:
    - src/
  debounceMs: 400
`;

const DEFAULT_SCRIPTS: Record<string, string> = {
  setup: "plugdev setup",
  dev: "plugdev run",
  "dev:server": "plugdev",
  "dev:watch": "plugdev watch",
};

export async function runInit(
  cwd: string,
  force = false,
  opts: { setup?: boolean; agents?: boolean; mcp?: boolean } = {},
): Promise<number> {
  heading("PlugDev Init\n");

  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const selectedModule =
    config.build.module ??
    project.suggestedModule ??
    autoSelectModule(project.modules ?? [])?.id;
  const detectedDeps = await detectProjectDeps(cwd, {
    module: selectedModule,
  });
  const configPath = join(cwd, "plugdev.yml");

  const jarTask = project.hasShadowJar ? "shadowJar" : "jar";
  const server =
    project.suggestedServer === "folia" || project.foliaSupported
      ? "folia"
      : "paper";
  const reloadJava = server === "folia" ? "restart" : "safe";

  printDetectionSummary(project, {
    version: project.type === "discord-bot" ? undefined : config.version,
    jarTask:
      project.type === "plugin" ||
      (project.buildSystem !== "none" && project.type !== "discord-bot")
        ? jarTask
        : undefined,
    server:
      project.type === "mod" || project.type === "discord-bot"
        ? undefined
        : server,
  });

  if (project.modules?.length) {
    const plugins = project.modules.filter((m) => m.kind === "plugin");
    info(
      `Modules: ${project.modules
        .map((m) => `${m.id}[${m.kind}]`)
        .join(", ")}`,
    );
    if (project.needsModuleSelection) {
      info(
        `Selected module (first plugin): ${selectedModule} — switch with: plugdev module use <name>`,
      );
      info(`Plugin modules: ${plugins.map((m) => m.id).join(", ")}`);
    } else if (selectedModule) {
      info(`Build module: ${selectedModule}`);
    }
  }

  if (
    detectedDeps.deps.length > 0 &&
    project.type !== "mod" &&
    project.type !== "discord-bot"
  ) {
    info(
      `Deps: ${detectedDeps.deps.map((d) => d.slug).join(", ")}` +
        (detectedDeps.sources.length
          ? ` (project: ${detectedDeps.sources.map((s) => s.slug).join(", ")})`
          : " (Via* defaults)"),
    );
  }
  if (detectedDeps.unmapped.length > 0 && project.type !== "discord-bot") {
    info(
      `Unmapped plugin.yml deps (add manually): ${detectedDeps.unmapped.join(", ")}`,
    );
  }

  let configExists = false;
  try {
    await access(configPath, constants.F_OK);
    configExists = true;
    if (!force) {
      info("plugdev.yml already exists (use --force to overwrite)");
    }
  } catch {
    // will create
  }

  let content: string;

  if (project.type === "mod") {
    content = MOD_TEMPLATE.replace("{{loader}}", project.loader ?? "fabric").replace(
      "{{version}}",
      config.version,
    );
  } else if (project.type === "discord-bot") {
    content = DISCORD_BOT_TEMPLATE;
  } else {
    const buildSystem = project.buildSystem === "maven" ? "maven" : "gradle";
    const moduleMeta = (project.modules ?? []).find((m) => m.id === selectedModule);
    const watchPaths =
      selectedModule && project.modules?.length
        ? defaultWatchPathsForModule(project.modules, selectedModule)
        : undefined;
    const jarPattern = selectedModule
      ? defaultJarPatternForModule(
          selectedModule,
          buildSystem,
          moduleMeta?.finalName,
        )
      : undefined;
    content = buildPluginTemplate({
      server,
      version: config.version,
      buildSystem,
      jarTask,
      deps: detectedDeps.deps,
      reloadJava,
      module: selectedModule,
      jarPattern,
      watchPaths,
    });
  }

  if (!configExists || force) {
    await writeFile(configPath, content);
    success(configExists ? `Updated ${configPath}` : `Created ${configPath}`);
  }

  const pkgPath = join(cwd, "package.json");
  let pkg: Record<string, unknown> = {};
  let pkgExists = false;
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
    pkgExists = true;
  } catch {
    pkg = {
      name:
        project.pluginName?.toLowerCase() ??
        (project.type === "discord-bot" ? "my-discord-bot" : "my-plugin"),
      private: true,
    };
  }

  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {};
  if (!devDeps["@plugdev/cli"]) {
    devDeps["@plugdev/cli"] = `^${CLI_VERSION}`;
    pkg.devDependencies = devDeps;
  }

  const scripts = (pkg.scripts as Record<string, string>) ?? {};
  // Only fill missing scripts unless --force (avoid clobbering custom scripts)
  for (const [key, value] of Object.entries(DEFAULT_SCRIPTS)) {
    if (force || !scripts[key]) {
      scripts[key] = value;
    }
  }
  pkg.scripts = scripts;

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  success(pkgExists ? `Updated ${pkgPath}` : `Created ${pkgPath}`);

  if (opts.agents || opts.mcp) {
    info("");
    await runAgentInstall(cwd, {
      all: opts.agents === true,
      mcp: opts.mcp === true,
      force,
      silent: true,
    });
    if (opts.agents) {
      success("Agent wiring: .cursor/rules/plugdev.mdc, CLAUDE.md, AGENTS.md, project skills");
    }
    if (opts.mcp) {
      success("MCP config: .cursor/mcp.json, .mcp.json");
    }
  }

  if (opts.setup) {
    info("");
    const setupCode = await runSetup(cwd);
    if (setupCode !== 0) {
      warn("Setup did not finish cleanly — fix the issues above, then run: plug setup");
      return setupCode;
    }
    info("");
    info("Next:");
    info(formatNextSteps(["plug run"]));
    info("Same as: plugdev run");
    if (opts.agents) {
      info("Agent rules written — Cursor / Claude / Codex will prefer plug run");
    }
    if (opts.mcp) {
      info("MCP configs written — restart the ADE to load @plugdev/mcp");
    }
    info("(PowerShell tip: run each command on its own line — do not use &&)");
    return 0;
  }

  info("");
  info("Next (global install — recommended):");
  info(formatNextSteps(initNextSteps({ agents: opts.agents, mcp: opts.mcp })));
  info("Or with npx only:");
  info(formatNextSteps(initNextSteps({ usedNpx: true, agents: opts.agents, mcp: opts.mcp })));
  info("Faster one-shot: npx @plugdev/cli@latest init --setup");
  return 0;
}
