import { mkdir, writeFile, access, symlink, cp, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { constants } from "node:fs";
import { projectRunDir } from "../paths.js";
import { ensurePaperDevTemplate, copyTemplateFiles, seedWorldCache } from "./templates.js";
import { writeDevRunConfig } from "./dev-run-config.js";
import type { ResolvedConfig } from "../config/loader.js";
import { info } from "../util/log.js";

export interface RconConfig {
  rconPort: number;
  rconPassword: string;
}

const WORLD_TYPE_MARKER = ".plugdev-world-type";
const SERVER_JAR_MARKER = ".plugdev-server-jar.json";

interface ServerJarMarker {
  source: string;
  size: number;
  mtimeMs: number;
}

/** Normalized world type used for marker + banner. */
export function resolveWorldType(config: ResolvedConfig): "void" | "flat" | "default" {
  const w = config.dev?.world;
  if (w === "void") return "void";
  if (w === "default") return "default";
  return "flat";
}

function buildServerProperties(config: ResolvedConfig, rcon?: RconConfig): string {
  const dev = config.dev ?? {};
  const gamemode = dev.gamemode ?? "creative";
  const difficulty = dev.peaceful === false ? "easy" : "peaceful";
  const onlineMode = dev.onlineMode === true ? "true" : "false";

  let levelType = "minecraft\\:flat";
  // Default flat: solid plains platform
  let generatorSettings =
    '{"biome":"minecraft:plains","layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":2},{"block":"minecraft:grass_block","height":1}],"structures":{"structures":{}}}';

  if (dev.world === "default") {
    levelType = "minecraft\\:normal";
    generatorSettings = "";
  } else if (dev.world === "void") {
    // Void biome + thin solid platform so players do not fall out of the world
    levelType = "minecraft\\:flat";
    generatorSettings =
      '{"biome":"minecraft:the_void","layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:stone","height":3},{"block":"minecraft:smooth_stone","height":1}],"structures":{"structures":{}}}';
  }

  const lines = [
    `server-port=${config.port}`,
    `online-mode=${onlineMode}`,
    `gamemode=${gamemode}`,
    `difficulty=${difficulty}`,
    `level-type=${levelType}`,
    `spawn-protection=0`,
    `max-players=4`,
    `view-distance=4`,
    `simulation-distance=4`,
    `white-list=false`,
    `enable-command-block=true`,
  ];

  if (rcon) {
    lines.push(`enable-rcon=true`);
    lines.push(`rcon.port=${rcon.rconPort}`);
    lines.push(`rcon.password=${rcon.rconPassword}`);
  }

  if (generatorSettings) {
    lines.splice(5, 0, `generator-settings=${generatorSettings}`);
  }

  return lines.join("\n") + "\n";
}

async function regenerateWorldsIfTypeChanged(
  runDir: string,
  worldType: string,
): Promise<void> {
  const markerPath = join(runDir, WORLD_TYPE_MARKER);
  let previous: string | undefined;
  try {
    previous = (await readFile(markerPath, "utf8")).trim();
  } catch {
    // no marker yet
  }

  if (previous !== undefined && previous !== worldType) {
    info(`World type changed (${previous} → ${worldType}) — regenerating worlds`);
    for (const name of ["world", "world_nether", "world_the_end"]) {
      await rm(join(runDir, name), { recursive: true, force: true });
    }
  }

  // First boot with void after air-only void: if marker missing but world exists
  // and we're now void-with-platform, force regen once by writing marker after wipe
  // when previous was missing and world folder exists from old air void.
  if (previous === undefined && worldType === "void") {
    try {
      await access(join(runDir, "world"), constants.F_OK);
      info("Regenerating void world with solid platform");
      for (const name of ["world", "world_nether", "world_the_end"]) {
        await rm(join(runDir, name), { recursive: true, force: true });
      }
    } catch {
      // no existing world
    }
  }

  await writeFile(markerPath, worldType + "\n");
}

export async function prepareRunDirectory(
  cwd: string,
  config: ResolvedConfig,
  rcon?: RconConfig,
): Promise<string> {
  return prepareRunDirectoryAt(projectRunDir(cwd), config, rcon);
}

export async function prepareRunDirectoryAt(
  runDir: string,
  config: ResolvedConfig,
  rcon?: RconConfig,
): Promise<string> {
  const pluginsDir = join(runDir, "plugins");
  await mkdir(pluginsDir, { recursive: true });

  const worldType = resolveWorldType(config);
  await regenerateWorldsIfTypeChanged(runDir, worldType);

  const cacheKey = worldType === "void" ? "void" : "flat-creative";
  await seedWorldCache(cacheKey);
  const templateDir = await ensurePaperDevTemplate();
  await copyTemplateFiles(templateDir, runDir);

  const eulaPath = join(runDir, "eula.txt");
  try {
    await access(eulaPath, constants.F_OK);
  } catch {
    await writeFile(eulaPath, "eula=true\n");
  }

  const propsPath = join(runDir, "server.properties");
  await writeFile(propsPath, buildServerProperties(config, rcon));

  const bukkitPath = join(runDir, "bukkit.yml");
  try {
    await access(bukkitPath, constants.F_OK);
  } catch {
    const allowNether = config.dev?.world === "default" ? "true" : "false";
    await writeFile(
      bukkitPath,
      `settings:\n  allow-end: false\n  allow-nether: ${allowNether}\n`,
    );
  }

  // Bootstrap reads this on enable — auto-OP players on join when op is true.
  const opEnabled = config.dev?.op !== false;
  await writeDevRunConfig(runDir, opEnabled);

  const opsPath = join(runDir, "ops.json");
  if (opEnabled) {
    try {
      await access(opsPath, constants.F_OK);
    } catch {
      await writeFile(opsPath, "[]\n");
    }
  }

  const paperConfigDir = join(runDir, "config");
  const paperGlobalPath = join(paperConfigDir, "paper-global.yml");
  try {
    await access(paperGlobalPath, constants.F_OK);
  } catch {
    await mkdir(paperConfigDir, { recursive: true });
    await writeFile(
      paperGlobalPath,
      [
        "chunk-loading-basic:",
        "  player-max-concurrent-loads: 2",
        "",
      ].join("\n"),
    );
  }

  return runDir;
}

export async function copyPaperToRun(
  runDir: string,
  paperJarPath: string,
): Promise<string> {
  const dest = join(runDir, "server.jar");
  const markerPath = join(runDir, SERVER_JAR_MARKER);
  const source = resolve(paperJarPath);
  const sourceStat = await stat(source);

  try {
    const marker = JSON.parse(
      await readFile(markerPath, "utf8"),
    ) as ServerJarMarker;
    const destStat = await stat(dest);
    if (
      resolve(marker.source) === source &&
      marker.size === sourceStat.size &&
      marker.mtimeMs === sourceStat.mtimeMs &&
      destStat.size === sourceStat.size
    ) {
      return dest;
    }
  } catch {
    // Missing or stale marker/JAR — replace it from the selected cache entry.
  }

  await rm(dest, { force: true });

  try {
    await symlink(source, dest);
  } catch {
    await cp(source, dest);
  }

  const marker: ServerJarMarker = {
    source,
    size: sourceStat.size,
    mtimeMs: sourceStat.mtimeMs,
  };
  await writeFile(markerPath, JSON.stringify(marker, null, 2) + "\n");
  return dest;
}

/** Write reload.list only — used at boot so Paper's first load is not race-reloaded. */
export async function writeReloadList(
  cwd: string,
  jarPaths: string[],
): Promise<void> {
  const runDir = projectRunDir(cwd);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "reload.list"), jarPaths.join("\n") + "\n");
}

/** Write reload.list and bump .reload-trigger (watch / live sync). */
export async function writeReloadTrigger(
  cwd: string,
  jarPaths: string[],
): Promise<void> {
  await writeReloadList(cwd, jarPaths);
  const runDir = projectRunDir(cwd);
  await writeFile(join(runDir, ".reload-trigger"), String(Date.now()));
}
