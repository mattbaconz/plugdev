import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkForUpdate,
  compareSemver,
  formatUpdateReminder,
  readUpdateAuto,
} from "./update-check.js";

test("compareSemver orders versions", () => {
  assert.ok(compareSemver("1.0.1", "1.0.0") > 0);
  assert.ok(compareSemver("1.0.0", "1.0.1") < 0);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
});

test("formatUpdateReminder mentions plugdev update", () => {
  assert.match(
    formatUpdateReminder({
      current: "1.0.0",
      latest: "1.0.1",
      outdated: true,
      skipped: false,
    }),
    /plugdev update/,
  );
});

test("checkForUpdate detects outdated from mocked registry", async () => {
  const home = await mkdtemp(join(tmpdir(), "plugdev-update-"));
  const prev = process.env.PLUGDEV_HOME;
  process.env.PLUGDEV_HOME = home;
  try {
    const result = await checkForUpdate({
      force: true,
      current: "1.0.0",
      fetchImpl: async () =>
        new Response(JSON.stringify({ version: "1.0.1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    assert.equal(result.outdated, true);
    assert.equal(result.latest, "1.0.1");
    assert.equal(result.skipped, false);
  } finally {
    if (prev === undefined) delete process.env.PLUGDEV_HOME;
    else process.env.PLUGDEV_HOME = prev;
    await rm(home, { recursive: true, force: true });
  }
});

test("readUpdateAuto reads plugdev.yml update.auto", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "plugdev-update-yml-"));
  await writeFile(join(cwd, "plugdev.yml"), "type: plugin\nupdate:\n  auto: true\n");
  assert.equal(await readUpdateAuto(cwd), true);
  await rm(cwd, { recursive: true, force: true });
});

test("PLUGDEV_NO_UPDATE skips check", async () => {
  const prev = process.env.PLUGDEV_NO_UPDATE;
  process.env.PLUGDEV_NO_UPDATE = "1";
  try {
    const result = await checkForUpdate({ force: true, current: "1.0.0" });
    assert.equal(result.skipped, true);
    assert.equal(result.outdated, false);
  } finally {
    if (prev === undefined) delete process.env.PLUGDEV_NO_UPDATE;
    else process.env.PLUGDEV_NO_UPDATE = prev;
  }
});
