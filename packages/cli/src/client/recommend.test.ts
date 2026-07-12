import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { recommendClientInstance } from "./recommend.js";
import type { DetectedLauncher } from "./detect.js";

test("recommendClientInstance prefers unambiguous version match", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-rec-"));
  try {
    const instances = join(dir, "instances");
    await mkdir(join(instances, "Dev-1.21.4"), { recursive: true });
    await writeFile(
      join(instances, "Dev-1.21.4", "instance.cfg"),
      "name=Dev 1.21.4\nlastLaunchTime=100\ntotalTimePlayed=1\n",
    );
    await writeFile(
      join(instances, "Dev-1.21.4", "mmc-pack.json"),
      JSON.stringify({
        components: [{ uid: "net.minecraft", version: "1.21.4" }],
      }),
    );

    const launcher: DetectedLauncher = {
      type: "prism",
      executable: join(dir, "prismlauncher.exe"),
      dataDir: dir,
      probeSource: "test",
    };

    const rec = await recommendClientInstance(launcher, "1.21.4");
    assert.ok(rec);
    assert.equal(rec!.instanceId, "Dev-1.21.4");
    assert.equal(rec!.unambiguous, true);
    assert.equal(rec!.reason, "version-match");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("recommendClientInstance marks multiple matches as ambiguous", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-rec-multi-"));
  try {
    const instances = join(dir, "instances");
    for (const id of ["A-1.21.4", "B-1.21.4"]) {
      await mkdir(join(instances, id), { recursive: true });
      await writeFile(
        join(instances, id, "instance.cfg"),
        `name=${id}\nlastLaunchTime=${id.startsWith("B") ? 200 : 100}\ntotalTimePlayed=1\n`,
      );
      await writeFile(
        join(instances, id, "mmc-pack.json"),
        JSON.stringify({
          components: [{ uid: "net.minecraft", version: "1.21.4" }],
        }),
      );
    }

    const launcher: DetectedLauncher = {
      type: "prism",
      executable: join(dir, "prismlauncher.exe"),
      dataDir: dir,
      probeSource: "test",
    };

    const rec = await recommendClientInstance(launcher, "1.21.4");
    assert.ok(rec);
    assert.equal(rec!.unambiguous, false);
    assert.equal(rec!.instanceId, "B-1.21.4");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
