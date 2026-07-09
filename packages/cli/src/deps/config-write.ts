import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { PlugDevConfig } from "../config/loader.js";

export type DepEntry = NonNullable<PlugDevConfig["deps"]>[number];

async function configPath(cwd: string): Promise<string | undefined> {
  const candidates = [join(cwd, "plugdev.yml"), join(cwd, ".plugdev", "plugdev.yml")];
  for (const p of candidates) {
    try {
      await access(p, constants.F_OK);
      return p;
    } catch {
      // try next
    }
  }
  return undefined;
}

export async function readPlugdevYml(cwd: string): Promise<{
  path: string;
  raw: PlugDevConfig;
} | null> {
  const path = await configPath(cwd);
  if (!path) return null;
  const text = await readFile(path, "utf8");
  const raw = parseYaml(text) as PlugDevConfig;
  return { path, raw: raw ?? {} };
}

/** Append a dep to plugdev.yml if not already present (by name/slug). */
export async function appendDepToYml(cwd: string, entry: DepEntry): Promise<boolean> {
  const loaded = await readPlugdevYml(cwd);
  if (!loaded) return false;

  const deps = [...(loaded.raw.deps ?? [])];
  const key = entry.name.toLowerCase().replace(/\s+/g, "");
  const slugKey = (entry.slug ?? "").toLowerCase();
  const exists = deps.some((d) => {
    const n = d.name.toLowerCase().replace(/\s+/g, "");
    const s = (d.slug ?? "").toLowerCase();
    return n === key || (slugKey && s === slugKey);
  });
  if (exists) return false;

  deps.push(entry);
  loaded.raw.deps = deps;
  await writeFile(loaded.path, stringifyYaml(loaded.raw, { lineWidth: 0 }));
  return true;
}

/** Set client.launcher / client.instance in plugdev.yml. */
export async function writeClientInstanceToYml(
  cwd: string,
  opts: { launcher: "prism" | "multimc" | "auto"; instance: string },
): Promise<boolean> {
  const loaded = await readPlugdevYml(cwd);
  if (!loaded) return false;

  loaded.raw.client = {
    ...(loaded.raw.client ?? {}),
    launcher: opts.launcher,
    instance: opts.instance,
    offlineName: loaded.raw.client?.offlineName ?? "DevPlayer",
  };
  await writeFile(loaded.path, stringifyYaml(loaded.raw, { lineWidth: 0 }));
  return true;
}
