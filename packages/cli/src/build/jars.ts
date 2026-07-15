import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { Errors } from "../util/errors.js";

export function matchGlob(name: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$",
  );
  return regex.test(name);
}

export function isExcludedJar(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("-sources") ||
    lower.includes("-javadoc") ||
    lower.startsWith("original-") ||
    lower.includes("-tests") ||
    lower.includes("-test-")
  );
}

export function isClassifierJar(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("-shaded") ||
    lower.includes("-all") ||
    lower.includes("-slim")
  );
}

/** Read `name:` from plugin.yml / paper-plugin.yml inside a JAR (ZIP). */
export async function readPluginNameFromJar(jarPath: string): Promise<string | null> {
  try {
    const buf = await readFile(jarPath);
    for (const entry of ["plugin.yml", "paper-plugin.yml"]) {
      const raw = extractZipEntry(buf, entry);
      if (!raw) continue;
      const text = raw.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("name:")) continue;
        let name = trimmed.slice("name:".length).trim();
        if (
          (name.startsWith('"') && name.endsWith('"')) ||
          (name.startsWith("'") && name.endsWith("'"))
        ) {
          name = name.slice(1, -1);
        }
        if (name) return name;
      }
    }
  } catch {
    // fall through
  }
  return null;
}

/** Minimal ZIP local-file extract (stored or deflate) for small text entries. */
function extractZipEntry(buf: Buffer, entryName: string): Buffer | null {
  const nameBuf = Buffer.from(entryName, "utf8");
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    if (nameEnd + extraLen + compSize > buf.length) break;
    const name = buf.subarray(nameStart, nameEnd).toString("utf8");
    const dataStart = nameEnd + extraLen;
    const dataEnd = dataStart + compSize;
    if (name === entryName || Buffer.compare(buf.subarray(nameStart, nameEnd), nameBuf) === 0) {
      const compressed = buf.subarray(dataStart, dataEnd);
      if (method === 0) return Buffer.from(compressed);
      if (method === 8) {
        try {
          return inflateRawSync(compressed, {
            maxOutputLength: Math.max(uncompSize, 64 * 1024),
          });
        } catch {
          return null;
        }
      }
      return null;
    }
    offset = dataEnd;
  }
  return null;
}

export interface PickBestJarOptions {
  /** Prefer jars whose plugin.yml name matches this (case-insensitive). */
  preferredPluginName?: string;
}

/**
 * Prefer JARs that contain plugin.yml, then preferred plugin name,
 * then largest file. Classifier jars (-shaded/-all/-slim) are demoted
 * only when another candidate already has plugin.yml.
 */
export async function pickBestJar(
  dir: string,
  candidates: string[],
  opts: PickBestJarOptions = {},
): Promise<string> {
  if (candidates.length === 0) {
    throw new Error("no candidates");
  }
  if (candidates.length === 1) {
    return join(dir, candidates[0]!);
  }

  const preferred = opts.preferredPluginName?.trim().toLowerCase();

  const scored = await Promise.all(
    candidates.map(async (name) => {
      const path = join(dir, name);
      let size = 0;
      try {
        size = (await stat(path)).size;
      } catch {
        size = 0;
      }
      const pluginName = await readPluginNameFromJar(path);
      const hasPluginYml = Boolean(pluginName);
      let score = 0;
      if (hasPluginYml) score += 10;
      if (
        preferred &&
        pluginName &&
        pluginName.toLowerCase() === preferred
      ) {
        score += 3;
      }
      if (name.toLowerCase().startsWith("original-")) score -= 10;
      return { name, path, size, score, hasPluginYml };
    }),
  );

  const anyPluginYml = scored.some((s) => s.hasPluginYml);
  if (anyPluginYml) {
    for (const s of scored) {
      if (isClassifierJar(s.name) && s.hasPluginYml) {
        // Keep classifier jars viable, but prefer finalName siblings with plugin.yml
        const hasNonClassifierSibling = scored.some(
          (o) => o.hasPluginYml && !isClassifierJar(o.name) && o.name !== s.name,
        );
        if (hasNonClassifierSibling) s.score -= 1;
      } else if (isClassifierJar(s.name) && !s.hasPluginYml) {
        s.score -= 1;
      }
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.size !== a.size) return b.size - a.size;
    return a.name.localeCompare(b.name);
  });

  return scored[0]!.path;
}

export async function findJarByPattern(
  cwd: string,
  pattern: string,
  task: string,
  preferredPluginName?: string,
): Promise<string> {
  const normalized = pattern.replace(/\\/g, "/");
  const dirPart = normalized.includes("/")
    ? join(cwd, normalized.slice(0, normalized.lastIndexOf("/")))
    : cwd;
  const globPart = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;

  let files: string[];
  try {
    files = await readdir(dirPart);
  } catch {
    throw Errors.noJarFound(task);
  }

  const jars = files.filter(
    (f) =>
      f.endsWith(".jar") && !isExcludedJar(f) && matchGlob(f, globPart),
  );
  if (jars.length === 0) throw Errors.noJarFound(task);
  return pickBestJar(dirPart, jars, { preferredPluginName });
}
