import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  defaultInstanceId,
  readInstanceMcVersion,
  probeAllLaunchers,
} from "./detect.js";
import type { DetectedLauncher } from "./detect.js";

test("defaultInstanceId formats plugdev version slug", () => {
  assert.equal(defaultInstanceId("1.21.4"), "plugdev-1.21.4");
});

test("readInstanceMcVersion parses net.minecraft from mmc-pack.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "plugdev-detect-"));
  const instanceId = "plugdev-1.21.4";
  const instanceDir = join(root, "instances", instanceId);
  await mkdir(instanceDir, { recursive: true });
  await writeFile(
    join(instanceDir, "mmc-pack.json"),
    JSON.stringify({
      formatVersion: 1,
      components: [{ uid: "net.minecraft", version: "1.21.4" }],
    }),
  );

  const launcher: DetectedLauncher = {
    type: "prism",
    executable: "C:\\fake\\prismlauncher.exe",
    dataDir: root,
    probeSource: "test",
  };

  const version = await readInstanceMcVersion(launcher, instanceId);
  assert.equal(version, "1.21.4");
});

test("probeAllLaunchers includes client.executable override probe", async () => {
  const root = await mkdtemp(join(tmpdir(), "plugdev-exe-"));
  const exePath = join(root, "prismlauncher.exe");
  await writeFile(exePath, "");

  const probes = await probeAllLaunchers({ executable: exePath });
  const override = probes.find((p) => p.source === "config:client.executable");
  assert.ok(override);
  assert.equal(override.found, true);
  assert.equal(override.path, exePath);
});
