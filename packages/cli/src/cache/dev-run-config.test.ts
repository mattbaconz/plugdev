import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDevRunConfig,
  PLUGDEV_DEV_JSON,
  writeDevRunConfig,
} from "./dev-run-config.js";

test("buildDevRunConfig mirrors op flag", () => {
  assert.deepEqual(buildDevRunConfig(true), { op: true });
  assert.deepEqual(buildDevRunConfig(false), { op: false });
});

test("writeDevRunConfig writes plugdev-dev.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-dev-cfg-"));
  try {
    const path = await writeDevRunConfig(dir, true);
    assert.equal(path, join(dir, PLUGDEV_DEV_JSON));
    const raw = await readFile(path, "utf8");
    assert.deepEqual(JSON.parse(raw), { op: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
