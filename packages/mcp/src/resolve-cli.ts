import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function isPlugdevOnPath(): boolean {
  try {
    if (process.platform === "win32") {
      execFileSync("where.exe", ["plugdev"], { stdio: "ignore" });
    } else {
      execFileSync("which", ["plugdev"], { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

export function resolvePlugdevInvocation(): { command: string; baseArgs: string[] } {
  const fromEnv = process.env.PLUGDEV_CLI;
  if (fromEnv) {
    const parts = fromEnv.split(" ").filter(Boolean);
    return { command: parts[0]!, baseArgs: parts.slice(1) };
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const localCli = join(here, "..", "..", "cli", "dist", "cli.js");
  if (existsSync(localCli)) {
    return { command: "node", baseArgs: [localCli] };
  }

  if (isPlugdevOnPath()) {
    return { command: "plugdev", baseArgs: [] };
  }

  return { command: "npx", baseArgs: ["-y", "@plugdev/cli"] };
}
