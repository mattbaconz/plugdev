import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deepMerge, updatePlugdevYml } from "./config-write.js";

test("deepMerge merges nested objects and replaces arrays", () => {
  const merged = deepMerge(
    { a: 1, client: { offlineName: "Dev", launcher: "auto" }, deps: [{ name: "a" }] },
    {
      client: { offlineName: "Tester" },
      deps: [{ name: "b" }],
    },
  );
  assert.equal(merged.a, 1);
  assert.deepEqual(merged.client, { offlineName: "Tester", launcher: "auto" });
  assert.deepEqual(merged.deps, [{ name: "b" }]);
});

test("updatePlugdevYml patches version and client fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-yml-"));
  try {
    await writeFile(
      join(dir, "plugdev.yml"),
      "type: plugin\nversion: \"1.20.6\"\nport: 25565\nclient:\n  offlineName: DevPlayer\n",
      "utf8",
    );
    const result = await updatePlugdevYml(dir, {
      version: "1.21.4",
      port: 25566,
      client: { offlineName: "Tester2", joinOnReady: true },
    });
    assert.equal(result.ok, true);
    const text = await readFile(join(dir, "plugdev.yml"), "utf8");
    assert.match(text, /version: ["']?1\.21\.4["']?/);
    assert.match(text, /port: 25566/);
    assert.match(text, /offlineName: Tester2/);
    assert.match(text, /joinOnReady: true/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("updatePlugdevYml fails when no plugdev.yml", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-yml-missing-"));
  try {
    const result = await updatePlugdevYml(dir, { version: "1.21.4" });
    assert.equal(result.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
