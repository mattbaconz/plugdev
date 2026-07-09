import { writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { CLI_VERSION } from "../constants.js";
import { heading, success, info, warn } from "../util/log.js";
import { formatNextSteps, initNextSteps } from "../util/shell-hints.js";
import { runSetup } from "./setup.js";

const PLUGIN_GRADLE_TEMPLATE = `# PlugDev configuration — auto-generated
type: plugin
server: paper
version: "{{version}}"
port: 25565

build:
  system: gradle
  task: build
  jarTask: {{jarTask}}

client:
  launcher: auto
  instance: plugdev-{{version}}
  offlineName: DevPlayer

jvm:
  memory: 1G

dev:
  gamemode: creative
  world: void
  op: true
  peaceful: true
  onlineMode: false

watch:
  paths:
    - src/
  debounceMs: 300
  reload:
    java: safe
`;

const PLUGIN_MAVEN_TEMPLATE = `# PlugDev configuration — auto-generated
type: plugin
server: paper
version: "{{version}}"
port: 25565

build:
  system: maven
  task: package
  jarPattern: "target/*.jar"

client:
  launcher: auto
  instance: plugdev-{{version}}
  offlineName: DevPlayer

jvm:
  memory: 1G

dev:
  gamemode: creative
  world: void
  op: true
  peaceful: true
  onlineMode: false

watch:
  paths:
    - src/
  debounceMs: 300
  reload:
    java: safe
`;

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

const DEFAULT_SCRIPTS: Record<string, string> = {
  setup: "plugdev setup",
  dev: "plugdev run",
  "dev:server": "plugdev",
  "dev:watch": "plugdev watch",
};

export async function runInit(
  cwd: string,
  force = false,
  opts: { setup?: boolean } = {},
): Promise<number> {
  heading("PlugDev Init\n");

  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const configPath = join(cwd, "plugdev.yml");

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

  const jarTask = project.hasShadowJar ? "shadowJar" : "jar";
  let content: string;

  if (project.type === "mod") {
    content = MOD_TEMPLATE.replace("{{loader}}", project.loader ?? "fabric").replace(
      "{{version}}",
      config.version,
    );
  } else if (project.buildSystem === "maven") {
    content = PLUGIN_MAVEN_TEMPLATE.replaceAll("{{version}}", config.version);
  } else {
    content = PLUGIN_GRADLE_TEMPLATE.replaceAll("{{version}}", config.version).replace(
      "{{jarTask}}",
      jarTask,
    );
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
    pkg = { name: project.pluginName?.toLowerCase() ?? "my-plugin", private: true };
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

  if (opts.setup) {
    info("");
    const setupCode = await runSetup(cwd);
    if (setupCode !== 0) {
      warn("Setup did not finish cleanly — fix the issues above, then run: npm run setup");
      return setupCode;
    }
    info("");
    info("Next:");
    info(formatNextSteps(["npm run dev"]));
    info("(PowerShell tip: run each command on its own line — do not use &&)");
    return 0;
  }

  info("");
  info("Next (run each line separately — PowerShell does not need &&):");
  info(formatNextSteps(initNextSteps()));
  info("Or with npx only:");
  info(formatNextSteps(initNextSteps({ usedNpx: true })));
  info("Faster: npx @plugdev/cli init --setup");
  return 0;
}
