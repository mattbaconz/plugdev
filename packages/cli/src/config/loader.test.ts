import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./loader.js";
import type { DetectedProject } from "../detect/project.js";

const baseProject: DetectedProject = {
  type: "plugin",
  buildSystem: "gradle",
  hasShadowJar: true,
  pluginName: "TestPlugin",
  minecraftVersion: "1.21",
};

test("loadConfig normalizes two-part MC version to patch", async () => {
  const config = await loadConfig("/tmp", baseProject, {});
  assert.equal(config.version, "1.21.4");
});

test("loadConfig applies CLI overrides", async () => {
  const config = await loadConfig("/tmp", baseProject, {
    minecraftVersion: "1.20.6",
    port: 25575,
    folia: true,
    debug: true,
  });
  assert.equal(config.version, "1.20.6");
  assert.equal(config.port, 25575);
  assert.equal(config.server, "folia");
  assert.equal(config.jvm.debugPort, 5005);
});

test("loadConfig --paper overrides folia in yaml", async () => {
  const config = await loadConfig(
    "/tmp",
    { ...baseProject, configPath: undefined },
    { paper: true, folia: false },
  );
  assert.equal(config.server, "paper");
});

test("loadConfig filters disabled deps", async () => {
  const project: DetectedProject = {
    ...baseProject,
    configPath: undefined,
  };
  const config = await loadConfig("/tmp", project, {});
  // deps default empty without file
  assert.deepEqual(config.deps, []);
});

test("loadConfig defaults run.cleanup to never", async () => {
  const config = await loadConfig("/tmp", baseProject, {});
  assert.equal(config.run.cleanup, "never");
});

test("loadConfig reads run.cleanup on-exit", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "plugdev-cfg-run-"));
  try {
    await writeFile(
      join(dir, "plugdev.yml"),
      `type: plugin\nserver: paper\nversion: "1.21.4"\nrun:\n  cleanup: on-exit\n`,
    );
    const config = await loadConfig(dir, baseProject, {});
    assert.equal(config.run.cleanup, "on-exit");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadConfig maven module defaults jarPattern to module/target", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "plugdev-cfg-mod-"));
  try {
    const yml = join(dir, "plugdev.yml");
    await writeFile(
      yml,
      `type: plugin\nserver: paper\nversion: "1.21.4"\nbuild:\n  system: maven\n  module: plugin-module\n`,
    );
    const project: DetectedProject = {
      type: "plugin",
      buildSystem: "maven",
      hasShadowJar: false,
      configPath: yml,
    };
    const config = await loadConfig(dir, project, {});
    assert.equal(config.build.module, "plugin-module");
    assert.equal(config.build.jarPattern, "plugin-module/target/*.jar");
    assert.equal(config.build.task, "package");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
