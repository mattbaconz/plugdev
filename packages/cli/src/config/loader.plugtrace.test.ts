import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./loader.js";
import type { DetectedProject } from "../detect/project.js";

test("loadConfig reads integrations.plugtrace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-cfg-pt-"));
  try {
    await writeFile(
      join(dir, "plugdev.yml"),
      `type: plugin
server: paper
version: "1.21.4"
integrations:
  plugtrace:
    enabled: true
    jar: ../plugtrace/PlugTrace.jar
    artifact: paper-modern
`,
    );
    const project: DetectedProject = {
      type: "plugin",
      pluginName: "Demo",
      buildSystem: "gradle",
      hasShadowJar: true,
      minecraftVersion: "1.21.4",
      configPath: join(dir, "plugdev.yml"),
    };
    const config = await loadConfig(dir, project);
    assert.equal(config.integrations.plugtrace.enabled, true);
    assert.equal(config.integrations.plugtrace.jar, "../plugtrace/PlugTrace.jar");
    assert.equal(config.integrations.plugtrace.artifact, "paper-modern");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
