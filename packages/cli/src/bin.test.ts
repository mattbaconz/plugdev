import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_VERSION } from "./constants.js";

test("package.json exposes plugdev and plug bins", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(
    await readFile(join(here, "..", "package.json"), "utf8"),
  ) as { bin: Record<string, string>; version: string };
  assert.equal(pkg.bin.plugdev, "dist/cli.js");
  assert.equal(pkg.bin.plug, "dist/cli.js");
  assert.equal(pkg.version, CLI_VERSION);
});
