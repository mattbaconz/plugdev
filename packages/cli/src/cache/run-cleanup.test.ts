import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { constants } from "node:fs";
import { runClean, wipeWorldDirs, applyExitCleanup } from "./run-cleanup.js";

describe("runClean", () => {
  it("removes world folders by default", async () => {
    const cwd = join(tmpdir(), `plugdev-clean-${Date.now()}`);
    const runDir = join(cwd, ".plugdev", "run");
    await mkdir(join(runDir, "world"), { recursive: true });
    await mkdir(join(runDir, "plugins"), { recursive: true });
    await writeFile(join(runDir, "world", "level.dat"), "x");
    await writeFile(join(runDir, "plugins", "keep.jar"), "x");

    try {
      const code = await runClean(cwd, { force: true });
      assert.equal(code, 0);
      await assert.rejects(() =>
        access(join(runDir, "world"), constants.F_OK),
      );
      await access(join(runDir, "plugins", "keep.jar"), constants.F_OK);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("--all removes entire .plugdev/run", async () => {
    const cwd = join(tmpdir(), `plugdev-clean-all-${Date.now()}`);
    const runDir = join(cwd, ".plugdev", "run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "server.properties"), "x");

    try {
      const code = await runClean(cwd, { all: true, force: true });
      assert.equal(code, 0);
      await assert.rejects(() => access(runDir, constants.F_OK));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("applyExitCleanup on-exit deletes run dir", async () => {
    const cwd = join(tmpdir(), `plugdev-exit-${Date.now()}`);
    const runDir = join(cwd, ".plugdev", "run");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "x"), "1");
    try {
      await applyExitCleanup(cwd, "on-exit");
      await assert.rejects(() => access(runDir, constants.F_OK));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("wipeWorldDirs only touches world folders", async () => {
    const runDir = join(tmpdir(), `plugdev-wipe-${Date.now()}`);
    await mkdir(join(runDir, "world"), { recursive: true });
    await mkdir(join(runDir, "plugins"), { recursive: true });
    try {
      const removed = await wipeWorldDirs(runDir);
      assert.deepEqual(removed, ["world"]);
      await access(join(runDir, "plugins"), constants.F_OK);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });
});
