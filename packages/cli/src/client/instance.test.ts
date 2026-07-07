import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { provisionInstance, getManifest } from "./instance.js";
import type { DetectedLauncher } from "./detect.js";

test("provisionInstance writes mmc-pack and updates manifest", async () => {
  const plugdevHome = await mkdtemp(join(tmpdir(), "plugdev-home-"));
  const prev = process.env.PLUGDEV_HOME;
  process.env.PLUGDEV_HOME = plugdevHome;

  try {
    const dataDir = await mkdtemp(join(tmpdir(), "plugdev-inst-"));
    const launcher: DetectedLauncher = {
      type: "prism",
      executable: join(dataDir, "prismlauncher.exe"),
      dataDir,
      probeSource: "test",
    };

    const instanceId = "plugdev-1.21.4";
    const instanceDir = await provisionInstance(launcher, "1.21.4", instanceId);

    const mmcRaw = await readFile(join(instanceDir, "mmc-pack.json"), "utf8");
    const mmc = JSON.parse(mmcRaw) as {
      components: Array<{ uid: string; version: string }>;
    };
    assert.equal(mmc.components[0].uid, "net.minecraft");
    assert.equal(mmc.components[0].version, "1.21.4");

    const manifest = await getManifest();
    assert.equal(manifest.instances["1.21.4"]?.instanceId, instanceId);
    assert.equal(manifest.instances["1.21.4"]?.launcher, "prism");
  } finally {
    if (prev === undefined) delete process.env.PLUGDEV_HOME;
    else process.env.PLUGDEV_HOME = prev;
  }
});
