import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../detect/project.js";

const fixtureRoot = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "test",
  "fixtures",
  "paper-plugin",
);

test("detectProject finds paper plugin fixture", async () => {
  const project = await detectProject(fixtureRoot);
  assert.equal(project.type, "plugin");
  assert.equal(project.buildSystem, "gradle");
  assert.equal(project.pluginName, "FixturePlugin");
  assert.equal(project.minecraftVersion, "1.21");
});

test("detectProject reports shadowJar when shadow plugin absent", async () => {
  const project = await detectProject(fixtureRoot);
  assert.equal(project.hasShadowJar, false);
});

const fixturesBase = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "test",
  "fixtures",
);

test("detectProject finds fabric mod fixture", async () => {
  const project = await detectProject(join(fixturesBase, "fabric-mod"));
  assert.equal(project.type, "mod");
  assert.equal(project.loader, "fabric");
  assert.equal(project.buildSystem, "gradle");
});

test("detectProject finds maven plugin fixture", async () => {
  const project = await detectProject(join(fixturesBase, "maven-plugin"));
  assert.equal(project.type, "plugin");
  assert.equal(project.buildSystem, "maven");
});
