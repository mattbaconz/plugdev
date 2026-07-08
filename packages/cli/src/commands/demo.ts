import { access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runDev } from "./dev.js";
import { banner, info } from "../util/log.js";
import { isJsonMode } from "../util/output.js";
import { CLI_VERSION } from "../constants.js";
import type { CliOverrides } from "../config/loader.js";

export async function resolveDemoFixturePathAsync(): Promise<string> {
  const fromEnv = process.env.PLUGDEV_DEMO_FIXTURE;
  if (fromEnv) return fromEnv;

  const cliSrc = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(cliSrc, "..", "..", "..", "test", "fixtures", "paper-plugin"),
    join(process.cwd(), "test", "fixtures", "paper-plugin"),
  ];

  for (const p of candidates) {
    try {
      await access(p);
      return p;
    } catch {
      // next
    }
  }

  throw new Error(
    "Demo fixture not found. Run from plugdev repo or set PLUGDEV_DEMO_FIXTURE.",
  );
}

export async function runDemo(
  opts: { join?: boolean; quiet?: boolean } = {},
): Promise<number> {
  const fixture = await resolveDemoFixturePathAsync();

  if (!isJsonMode()) {
    banner(CLI_VERSION);
    info("Demo fixture: test/fixtures/paper-plugin");
    info("Edit src/.../FixturePlugin.java and save to trigger reload");
    info("In-game: /hello or /fixture — Ctrl+C to stop");
    console.log("");
  }

  const overrides: CliOverrides & { watch?: boolean } = {
    join: opts.join !== false,
    quiet: opts.quiet,
    watch: true,
  };

  return runDev(fixture, overrides);
}
