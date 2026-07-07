import { writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { heading, success, info } from "../util/log.js";

const PLUGIN_TEMPLATE = `# PlugDev configuration — auto-generated
type: plugin
server: paper
version: "{{version}}"
port: 25565

build:
  system: gradle
  task: build
  jarTask: {{jarTask}}

dev:
  gamemode: creative
  world: flat
  op: true
  peaceful: true
  onlineMode: false

watch:
  paths:
    - src/
  debounceMs: 500
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

export async function runInit(cwd: string, force = false): Promise<number> {
  heading("PlugDev Init\n");

  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const configPath = join(cwd, "plugdev.yml");

  try {
    await access(configPath, constants.F_OK);
    if (!force) {
      info("plugdev.yml already exists (use --force to overwrite)");
    }
  } catch {
    // create
  }

  const jarTask = project.hasShadowJar ? "shadowJar" : "jar";
  let content: string;

  if (project.type === "mod") {
    content = MOD_TEMPLATE.replace("{{loader}}", project.loader ?? "fabric").replace(
      "{{version}}",
      config.version,
    );
  } else {
    content = PLUGIN_TEMPLATE.replace("{{version}}", config.version).replace(
      "{{jarTask}}",
      jarTask,
    );
  }

  await writeFile(configPath, content);
  success(`Created ${configPath}`);

  const pkgPath = join(cwd, "package.json");
  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
  } catch {
    pkg = { name: project.pluginName?.toLowerCase() ?? "my-plugin", private: true };
  }

  const scripts = (pkg.scripts as Record<string, string>) ?? {};
  scripts.dev = "plugdev run";
  scripts["dev:server"] = "plugdev";
  scripts["dev:watch"] = "plugdev watch";
  pkg.scripts = scripts;

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  success(`Updated ${pkgPath} scripts`);

  info('Run: npm run dev');
  return 0;
}
