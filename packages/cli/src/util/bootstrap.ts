import { access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constants } from "node:fs";
import { bootstrapCacheDir } from "../paths.js";
import { CLI_VERSION } from "../constants.js";
import { Errors } from "./errors.js";

/**
 * Resolve the Paper bootstrap JAR shipped with the CLI (or built from source).
 * Shared by `plugdev` / `doctor` so readiness checks match the runtime path.
 */
export async function resolveBootstrapJar(): Promise<string> {
  const found = await findBootstrapJar();
  if (!found) throw Errors.bootstrapMissing();
  return found;
}

/** Returns path if found, otherwise null (for doctor / soft checks). */
export async function findBootstrapJar(): Promise<string | null> {
  const here = dirname(fileURLToPath(import.meta.url));
  // Cover: dist/cli.js, dist/chunk-*.js, and src/util/bootstrap.ts (tsx)
  const packageRoots = [
    join(here, ".."), // dist → packages/cli
    join(here, "..", ".."), // src/util → packages/cli
  ];

  const candidates: string[] = [];
  for (const root of packageRoots) {
    candidates.push(
      join(root, "bootstrap", "plugdev-bootstrap-paper.jar"),
      join(root, "bootstrap", `plugdev-bootstrap-paper-${CLI_VERSION}.jar`),
      join(root, "..", "bootstrap-paper", "build", "libs", "plugdev-bootstrap-paper.jar"),
      join(
        root,
        "..",
        "bootstrap-paper",
        "build",
        "libs",
        `plugdev-bootstrap-paper-${CLI_VERSION}.jar`,
      ),
    );
  }
  candidates.push(join(bootstrapCacheDir(), `plugdev-bootstrap-paper-${CLI_VERSION}.jar`));

  for (const p of candidates) {
    try {
      await access(p, constants.F_OK);
      return p;
    } catch {
      // try next
    }
  }
  return null;
}

/** Soft check used by doctor — never throws. */
export async function checkBootstrapJar(): Promise<{
  ok: boolean;
  path?: string;
}> {
  const path = await findBootstrapJar();
  return path ? { ok: true, path } : { ok: false };
}
