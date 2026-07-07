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

test("loadConfig defaults watch reload to safe", async () => {
  const config = await loadConfig("/tmp", baseProject, {});
  assert.equal(config.watch.reloadJava, "safe");
});
