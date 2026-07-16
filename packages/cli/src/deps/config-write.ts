import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { PlugDevConfig } from "../config/loader.js";

export type DepEntry = NonNullable<PlugDevConfig["deps"]>[number];

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object | undefined
      ? DeepPartial<NonNullable<T[K]>>
      : T[K];
};

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge patch into base (arrays replaced, not concatenated). */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  patch: DeepPartial<T>,
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const prev = out[key];
    if (isPlainObject(value) && isPlainObject(prev)) {
      out[key] = deepMerge(prev, value as DeepPartial<Record<string, unknown>>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
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

/**
 * Merge a partial config into plugdev.yml and write it back.
 * Note: YAML comments are not preserved (stringify round-trip).
 */
export async function updatePlugdevYml(
  cwd: string,
  patch: DeepPartial<PlugDevConfig>,
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const loaded = await readPlugdevYml(cwd);
  if (!loaded) {
    return { ok: false, reason: "No plugdev.yml found — run plugdev init first" };
  }
  const merged = deepMerge(
    loaded.raw as Record<string, unknown>,
    patch as DeepPartial<Record<string, unknown>>,
  ) as PlugDevConfig;
  await writeFile(loaded.path, stringifyYaml(merged, { lineWidth: 0 }));
  return { ok: true, path: loaded.path };
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
  const result = await updatePlugdevYml(cwd, {
    client: {
      launcher: opts.launcher,
      instance: opts.instance,
    },
  });
  return result.ok;
}

/** Set build.module (+ jarPattern / watch.paths) for multi-module projects. */
export async function writeModuleToYml(
  cwd: string,
  opts: {
    module: string;
    system: "maven" | "gradle";
    jarPattern?: string;
    watchPaths?: string[];
  },
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const id = opts.module.replace(/^:/, "").replace(/\\/g, "/").replace(/\/$/, "");
  const jarPattern =
    opts.jarPattern ??
    (opts.system === "maven" ? `${id}/target/*.jar` : `${id}/build/libs/*.jar`);
  const patch: DeepPartial<PlugDevConfig> = {
    build: {
      system: opts.system,
      module: id,
      jarPattern,
    },
  };
  if (opts.watchPaths?.length) {
    patch.watch = { paths: opts.watchPaths };
  }
  return updatePlugdevYml(cwd, patch);
}

/** Replace the project-wide allowlist of live plugin config files. */
export async function writeWatchedConfigsToYml(
  cwd: string,
  configs: string[],
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  return updatePlugdevYml(cwd, { watch: { configs } });
}

/** Remove a dep from plugdev.yml by name/slug (does not delete JARs). */
export async function removeDepFromYml(cwd: string, name: string): Promise<boolean> {
  const loaded = await readPlugdevYml(cwd);
  if (!loaded) return false;
  const key = name.toLowerCase().replace(/\s+/g, "");
  const before = loaded.raw.deps?.length ?? 0;
  loaded.raw.deps = (loaded.raw.deps ?? []).filter((d) => {
    const n = d.name.toLowerCase().replace(/\s+/g, "");
    const s = (d.slug ?? "").toLowerCase();
    return n !== key && s !== key;
  });
  if ((loaded.raw.deps?.length ?? 0) === before) return false;
  await writeFile(loaded.path, stringifyYaml(loaded.raw, { lineWidth: 0 }));
  return true;
}
