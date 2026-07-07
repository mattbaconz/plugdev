import { cp, mkdir, writeFile, access, symlink } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { projectRunDir } from "../paths.js";
import type { ResolvedConfig } from "../config/loader.js";

const SERVER_PROPERTIES = (port: number) => `\
server-port=${port}
online-mode=false
gamemode=creative
difficulty=peaceful
level-type=minecraft\\:flat
generator-settings={"biome":"minecraft:plains","layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":2},{"block":"minecraft:grass_block","height":1}],"structures":{"structures":{}}}
spawn-protection=0
max-players=20
white-list=false
enable-command-block=true
`;

export async function prepareRunDirectory(
  cwd: string,
  config: ResolvedConfig,
): Promise<string> {
  const runDir = projectRunDir(cwd);
  const pluginsDir = join(runDir, "plugins");
  await mkdir(pluginsDir, { recursive: true });

  const eulaPath = join(runDir, "eula.txt");
  try {
    await access(eulaPath, constants.F_OK);
  } catch {
    await writeFile(eulaPath, "eula=true\n");
  }

  const propsPath = join(runDir, "server.properties");
  await writeFile(propsPath, SERVER_PROPERTIES(config.port));

  const bukkitPath = join(runDir, "bukkit.yml");
  try {
    await access(bukkitPath, constants.F_OK);
  } catch {
    await writeFile(
      bukkitPath,
      "settings:\n  allow-end: false\n  allow-nether: false\n",
    );
  }

  // ops.json — offline dev UUID for first joiner (common dev pattern)
  const opsPath = join(runDir, "ops.json");
  try {
    await access(opsPath, constants.F_OK);
  } catch {
    await writeFile(opsPath, "[]\n");
  }

  return runDir;
}

export async function copyPaperToRun(
  runDir: string,
  paperJarPath: string,
): Promise<string> {
  const dest = join(runDir, "server.jar");

  try {
    await access(dest, constants.F_OK);
    return dest;
  } catch {
    // need to create link or copy
  }

  try {
    await symlink(paperJarPath, dest);
    return dest;
  } catch {
    try {
      await cp(paperJarPath, dest);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "EBUSY" || err.code === "EPERM") {
        return dest;
      }
      throw e;
    }
    return dest;
  }
}

export async function writeReloadTrigger(
  cwd: string,
  jarPaths: string[],
): Promise<void> {
  const runDir = projectRunDir(cwd);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "reload.list"), jarPaths.join("\n") + "\n");
  await writeFile(join(runDir, ".reload-trigger"), String(Date.now()));
}
