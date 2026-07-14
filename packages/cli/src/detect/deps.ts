import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { DEP_PRESETS, DEFAULT_COMPAT_DEPS } from "../deps/presets.js";

export interface DetectedHangarDep {
  name: string;
  source: "hangar" | "modrinth";
  author?: string;
  slug: string;
}

export interface DetectedDepsResult {
  /** Hangar deps to write into plugdev.yml (Via* + mapped project deps). */
  deps: DetectedHangarDep[];
  /** Raw plugin names from metadata that did not map to a Hangar preset. */
  unmapped: string[];
  /** Where each mapped slug came from. */
  sources: Array<{ slug: string; from: "plugin.yml" | "build" }>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/** Via* only — always included for cross-version client join. */
export const VIA_COMPAT_DEPS: DetectedHangarDep[] = DEFAULT_COMPAT_DEPS.filter((d) =>
  d.slug.toLowerCase().startsWith("via"),
);

function normalizeName(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "").toLowerCase().replace(/[\s_-]+/g, "");
}

/** Map a plugin.yml / build dependency name to a Hangar/Modrinth preset, if known. */
export function mapDepNameToPreset(raw: string): DetectedHangarDep | undefined {
  const key = normalizeName(raw);
  if (!key) return undefined;

  // Exact alias or slug match
  for (const preset of DEP_PRESETS) {
    const slugKey = normalizeName(preset.slug);
    if (preset.aliases.some((a) => normalizeName(a) === key) || slugKey === key) {
      return presetToDetected(preset);
    }
  }

  // Common plugin.yml spellings → preset alias
  const aliases: Record<string, string> = {
    vault: "vault",
    vaultapi: "vault",
    vaultunlocked: "vault",
    essentials: "essentials",
    essentialsx: "essentials",
    luckperms: "luckperms",
    placeholderapi: "papi",
    papi: "papi",
    mineconomy: "mineconomy",
    viaversion: "viaversion",
    viabackwards: "viabackwards",
    viarewind: "viarewind",
    worldguard: "worldguard",
    worldedit: "worldedit",
    griefprevention: "griefprevention",
    towny: "towny",
    floodgate: "floodgate",
    mythicmobs: "mythicmobs",
    protocollib: "protocollib",
    multiverse: "multiverse",
    multiversecore: "multiverse",
    coreprotect: "coreprotect",
    discordsrv: "discordsrv",
  };
  const alias = aliases[key];
  if (alias) {
    const preset = DEP_PRESETS.find((p) => p.aliases.includes(alias));
    if (preset) return presetToDetected(preset);
  }

  // Prefix/contains only for multi-char slugs (avoid "via" false positives)
  for (const preset of DEP_PRESETS) {
    const slugKey = normalizeName(preset.slug);
    if (slugKey.length < 4) continue;
    if (key.includes(slugKey) || (key.length >= 4 && slugKey.includes(key))) {
      return presetToDetected(preset);
    }
  }

  return undefined;
}

function presetToDetected(preset: (typeof DEP_PRESETS)[number]): DetectedHangarDep {
  if (preset.source === "modrinth" || (!preset.author && preset.modrinthSlug)) {
    return {
      name: preset.slug,
      source: "modrinth",
      slug: preset.modrinthSlug ?? preset.slug,
    };
  }
  return {
    name: preset.slug,
    source: "hangar",
    author: preset.author!,
    slug: preset.slug,
  };
}

/** Parse depend / softdepend / loadbefore lists from plugin.yml-style YAML. */
export function parsePluginYmlDepNames(content: string): string[] {
  const names: string[] = [];
  const keys = ["depend", "softdepend", "soft-depend", "loadbefore", "load-before"];

  for (const key of keys) {
    // Inline list: depend: [Vault, LuckPerms]
    const inline = content.match(
      new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]\\s*$`, "im"),
    );
    if (inline?.[1]) {
      for (const part of inline[1].split(",")) {
        const n = part.trim().replace(/^['"]|['"]$/g, "");
        if (n) names.push(n);
      }
      continue;
    }

    // Block list:
    // depend:
    //   - Vault
    //   - LuckPerms
    const block = content.match(
      new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)*)`, "im"),
    );
    if (block?.[1]) {
      for (const line of block[1].split("\n")) {
        const m = line.match(/^\s*-\s+['"]?(.+?)['"]?\s*$/);
        if (m?.[1]) names.push(m[1].trim());
      }
    }
  }

  return names;
}

/** Extract likely dependency tokens from Gradle / Maven build files. */
export function parseBuildDepTokens(content: string): string[] {
  const tokens: string[] = [];
  const patterns = [
    /luckperms/gi,
    /placeholderapi/gi,
    /vaultunlocked/gi,
    /vaultapi/gi,
    /\bvault\b/gi,
    /essentialsx?/gi,
    /mineconomy/gi,
    /viaversion/gi,
    /viabackwards/gi,
    /viarewind/gi,
    /worldguard/gi,
    /worldedit/gi,
    /griefprevention/gi,
    /\btowny\b/gi,
    /\blands\b/gi,
    /itemsadder/gi,
    /\bnexo\b/gi,
    /floodgate/gi,
    /mythicmobs/gi,
    /protocollib/gi,
    /citizens/gi,
    /multiverse/gi,
    /coreprotect/gi,
    /discordsrv/gi,
  ];
  for (const re of patterns) {
    const matches = content.match(re);
    if (matches) {
      for (const m of matches) tokens.push(m);
    }
  }
  return tokens;
}

function dedupeDeps(deps: DetectedHangarDep[]): DetectedHangarDep[] {
  const seen = new Set<string>();
  const out: DetectedHangarDep[] = [];
  for (const d of deps) {
    const key = d.slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/**
 * Detect test-server Hangar deps from plugin metadata + build files.
 * Always includes Via*; adds mapped depend/softdepend and compileOnly signals.
 * When `opts.module` is set, reads that module's plugin.yml / pom / build.gradle.
 */
export async function detectProjectDeps(
  cwd: string,
  opts: { module?: string } = {},
): Promise<DetectedDepsResult> {
  const mapped: DetectedHangarDep[] = [];
  const unmapped: string[] = [];
  const sources: DetectedDepsResult["sources"] = [];
  const seenSlugs = new Set<string>();

  const addMapped = (dep: DetectedHangarDep, from: "plugin.yml" | "build") => {
    const key = dep.slug.toLowerCase();
    if (seenSlugs.has(key)) return;
    // Skip Via* here — added from VIA_COMPAT_DEPS
    if (key.startsWith("via")) {
      seenSlugs.add(key);
      return;
    }
    seenSlugs.add(key);
    mapped.push(dep);
    sources.push({ slug: dep.slug, from });
  };

  const base = opts.module
    ? join(cwd, ...opts.module.replace(/\\/g, "/").split("/"))
    : cwd;

  const pluginPaths = [
    join(base, "src", "main", "resources", "plugin.yml"),
    join(base, "src", "main", "resources", "paper-plugin.yml"),
    // Also scan root for hybrid layouts
    ...(opts.module
      ? [
          join(cwd, "src", "main", "resources", "plugin.yml"),
          join(cwd, "src", "main", "resources", "paper-plugin.yml"),
        ]
      : []),
  ];

  for (const p of pluginPaths) {
    if (!(await exists(p))) continue;
    const content = await readText(p);
    if (!content) continue;
    for (const name of parsePluginYmlDepNames(content)) {
      const preset = mapDepNameToPreset(name);
      if (preset) addMapped(preset, "plugin.yml");
      else unmapped.push(name);
    }
  }

  const buildFiles = [
    join(base, "build.gradle.kts"),
    join(base, "build.gradle"),
    join(base, "pom.xml"),
    join(cwd, "build.gradle.kts"),
    join(cwd, "build.gradle"),
    join(cwd, "pom.xml"),
  ];
  for (const p of buildFiles) {
    const content = await readText(p);
    if (!content) continue;
    for (const token of parseBuildDepTokens(content)) {
      const preset = mapDepNameToPreset(token);
      if (preset) addMapped(preset, "build");
    }
  }

  const deps = dedupeDeps([...VIA_COMPAT_DEPS, ...mapped]);
  return {
    deps,
    unmapped: [...new Set(unmapped)],
    sources,
  };
}

/** Format deps as YAML list fragment for plugdev.yml templates. */
export function formatDepsYaml(deps: DetectedHangarDep[]): string {
  if (deps.length === 0) return "";
  const lines: string[] = [];
  for (const d of deps) {
    lines.push(`  - name: ${d.name}`);
    lines.push(`    source: ${d.source}`);
    if (d.source === "hangar" && d.author) {
      lines.push(`    author: ${d.author}`);
    }
    lines.push(`    slug: ${d.slug}`);
  }
  return lines.join("\n");
}
