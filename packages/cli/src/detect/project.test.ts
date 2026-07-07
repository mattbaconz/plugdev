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
});
