import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLiveConfigChangeHandler } from "./watcher.js";

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "plugdev-config-watch-"));
  const config = join(root, "config.yml");
  const data = join(root, "data.yml");
  await mkdir(root, { recursive: true });
  await writeFile(config, "value: one\n");
  await writeFile(data, "players: 1\n");
  return { root, config, data };
}

test("allowlisted config save reloads once without a build callback", async () => {
  const fixture = await setup();
  let reloads = 0;
  let handler!: (path: string) => Promise<void>;
  try {
    handler = createLiveConfigChangeHandler({
      dataDir: fixture.root,
      reloadMode: "safe",
      getWatchedPaths: async () => ["config.yml"],
      onSafeReload: async () => {
        reloads += 1;
        await writeFile(fixture.config, "value: normalized\n");
        await handler(fixture.config);
      },
      onRestart: async () => assert.fail("restart should not run"),
    });

    await writeFile(fixture.config, "value: two\n");
    await handler(fixture.config);
    await handler(fixture.config);
    assert.equal(reloads, 1);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("unlisted runtime data changes do not reload", async () => {
  const fixture = await setup();
  let reloads = 0;
  try {
    const handler = createLiveConfigChangeHandler({
      dataDir: fixture.root,
      reloadMode: "safe",
      getWatchedPaths: async () => ["config.yml"],
      onSafeReload: async () => { reloads += 1; },
      onRestart: async () => { reloads += 1; },
    });
    await writeFile(fixture.data, "players: 2\n");
    await handler(fixture.data);
    assert.equal(reloads, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("restart mode invokes restart instead of safe reload", async () => {
  const fixture = await setup();
  let safeReloads = 0;
  let restarts = 0;
  try {
    const handler = createLiveConfigChangeHandler({
      dataDir: fixture.root,
      reloadMode: "restart",
      getWatchedPaths: async () => ["config.yml"],
      onSafeReload: async () => { safeReloads += 1; },
      onRestart: async () => { restarts += 1; },
    });
    await writeFile(fixture.config, "value: restarted\n");
    await handler(fixture.config);
    assert.equal(safeReloads, 0);
    assert.equal(restarts, 1);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
