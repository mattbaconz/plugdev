import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { captureReloadLogOffset, confirmReload } from "./reload-feedback.js";

test("confirmReload ignores matching lines written before the captured offset", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "plugdev-reload-offset-"));
  try {
    const logs = join(cwd, ".plugdev", "run", "logs");
    await mkdir(logs, { recursive: true });
    const log = join(logs, "latest.log");
    await writeFile(log, "[PlugDev] Reload complete\n", "utf8");
    const offset = await captureReloadLogOffset(cwd);
    await appendFile(log, "ordinary server output\n", "utf8");
    assert.equal(await confirmReload(cwd, 120, offset), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("confirmReload accepts a new reload marker after the captured offset", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "plugdev-reload-new-"));
  try {
    const logs = join(cwd, ".plugdev", "run", "logs");
    await mkdir(logs, { recursive: true });
    const log = join(logs, "latest.log");
    await writeFile(log, "old output\n", "utf8");
    const offset = await captureReloadLogOffset(cwd);
    setTimeout(() => {
      void appendFile(log, "[PlugDev] Reload complete\n", "utf8");
    }, 30);
    assert.equal(await confirmReload(cwd, 1_000, offset), true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
