import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
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

/**
 * Prefer shaded / non-original artifacts, then largest file, then name sort.
 */
export async function pickBestJar(
  dir: string,
  candidates: string[],
): Promise<string> {
  if (candidates.length === 0) {
    throw new Error("no candidates");
  }
  if (candidates.length === 1) {
    return join(dir, candidates[0]!);
  }

  const scored = await Promise.all(
    candidates.map(async (name) => {
      const path = join(dir, name);
      let size = 0;
      try {
        size = (await stat(path)).size;
      } catch {
        size = 0;
      }
      const lower = name.toLowerCase();
      const shadedBonus =
        lower.includes("-shaded") || lower.includes("-all") ? 2 : 0;
      const originalPenalty = lower.startsWith("original-") ? -10 : 0;
      return { name, path, size, score: shadedBonus + originalPenalty };
    }),
  );

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
  return pickBestJar(dirPart, jars);
}
