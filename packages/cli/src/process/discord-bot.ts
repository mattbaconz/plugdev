import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { info, warn } from "../util/log.js";

export interface DiscordBotSpawnOpts {
  cwd: string;
  /** Absolute or cwd-relative entry file, or a package.json script command string. */
  entry: string;
  /** Whether entry is a package.json script command (npm run / node -e style). */
  useShell: boolean;
  env?: NodeJS.ProcessEnv;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve how to start a Discord bot from config + package.json.
 * Returns a spawn plan: either `node <file>` or shell `npm run` / script string.
 */
export async function resolveDiscordBotEntry(
  cwd: string,
  configured?: string,
): Promise<{ entry: string; useShell: boolean; label: string }> {
  if (configured && configured !== "auto") {
    const asFile = join(cwd, configured);
    if (await exists(asFile)) {
      return { entry: asFile, useShell: false, label: configured };
    }
    // Treat as a shell command (e.g. "tsx src/index.ts" or "npm run start")
    return { entry: configured, useShell: true, label: configured };
  }

  let pkg: {
    main?: string;
    scripts?: Record<string, string>;
  } = {};
  try {
    pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as typeof pkg;
  } catch {
    // ignore
  }

  if (pkg.scripts?.dev?.trim()) {
    return {
      entry: "npm run dev --silent",
      useShell: true,
      label: "npm run dev",
    };
  }
  if (pkg.scripts?.start?.trim()) {
    return {
      entry: "npm run start --silent",
      useShell: true,
      label: "npm run start",
    };
  }

  const candidates = [
    pkg.main,
    "index.js",
    "src/index.js",
    "src/index.ts",
    "bot.js",
    "src/bot.js",
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    const p = join(cwd, c);
    if (await exists(p)) {
      return { entry: p, useShell: false, label: c };
    }
  }

  throw new Error(
    "Could not resolve Discord bot entry — set bot.entry in plugdev.yml or add scripts.dev / main in package.json",
  );
}

export function spawnDiscordBot(opts: DiscordBotSpawnOpts): ChildProcess {
  const env = { ...process.env, ...opts.env };
  if (opts.useShell) {
    info(`Starting bot: ${opts.entry}`);
    return spawn(opts.entry, {
      cwd: opts.cwd,
      env,
      shell: true,
      stdio: "inherit",
    });
  }

  info(`Starting bot: node ${opts.entry}`);
  return spawn(process.execPath, [opts.entry], {
    cwd: opts.cwd,
    env,
    stdio: "inherit",
  });
}

export async function stopDiscordBot(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.killed || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    child.once("exit", done);
    try {
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        }).on("exit", done);
      } else {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
        }, 2000);
      }
    } catch {
      warn("Failed to stop bot process cleanly");
      resolve();
    }
  });
}
