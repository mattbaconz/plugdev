import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listLauncherInstances, findRecentlyPlayedInstance } from "./instances-list.js";
import type { DetectedLauncher } from "./detect.js";

describe("listLauncherInstances", () => {
  it("reads folder id, name, mc version, and lastLaunchTime", async () => {
    const dataDir = join(tmpdir(), `plugdev-instances-${Date.now()}`);
    const id = "FO 26.1.2";
    const instanceDir = join(dataDir, "instances", id);
    await mkdir(instanceDir, { recursive: true });
    await writeFile(
      join(instanceDir, "instance.cfg"),
      [
        "name=FO 26.1.2",
        "lastLaunchTime=1783601381116",
        "totalTimePlayed=100",
      ].join("\n") + "\n",
    );
    await writeFile(
      join(instanceDir, "mmc-pack.json"),
      JSON.stringify({
        formatVersion: 1,
        components: [{ uid: "net.minecraft", version: "26.1.2", important: true }],
      }),
    );

    const launcher: DetectedLauncher = {
      type: "prism",
      executable: "prismlauncher",
      dataDir,
      probeSource: "test",
    };

    try {
      const list = await listLauncherInstances(launcher);
      assert.equal(list.length, 1);
      assert.equal(list[0].id, "FO 26.1.2");
      assert.equal(list[0].mcVersion, "26.1.2");
      assert.equal(list[0].lastLaunchTime, 1783601381116);

      const recent = await findRecentlyPlayedInstance(launcher);
      assert.equal(recent?.id, "FO 26.1.2");
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
