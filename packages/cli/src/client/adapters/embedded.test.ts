import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

test("embedded adapter uses gamePath string, not folder.path", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(dir, "embedded.ts"), "utf8");
  assert.equal(src.includes("folder.path"), false);
  assert.match(src, /gamePath,\s*\n\s*resourcePath:\s*gamePath/);
  assert.match(src, /ensureEmbeddedClient/);
});
