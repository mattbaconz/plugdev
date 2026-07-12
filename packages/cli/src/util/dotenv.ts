import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Load KEY=VALUE pairs from .env into process.env (does not override existing). */
export async function loadDotEnv(cwd: string): Promise<void> {
  const path = join(cwd, ".env");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export function resolveBotTokenEnv(tokenEnv?: string): {
  name: string;
  present: boolean;
} {
  const names = [
    tokenEnv,
    "DISCORD_TOKEN",
    "DISCORD_BOT_TOKEN",
    "BOT_TOKEN",
  ].filter(Boolean) as string[];
  for (const name of names) {
    if (process.env[name]?.trim()) return { name, present: true };
  }
  return { name: tokenEnv || "DISCORD_TOKEN", present: false };
}
