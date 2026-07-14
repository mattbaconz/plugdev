import { test } from "node:test";
import assert from "node:assert/strict";
import { pluginGradleTaskArgs } from "./gradle.js";

test("pluginGradleTaskArgs without module uses bare task", () => {
  assert.deepEqual(pluginGradleTaskArgs(undefined, "shadowJar"), [
    "shadowJar",
    "-x",
    "test",
    "--quiet",
  ]);
});

test("pluginGradleTaskArgs with module uses path task", () => {
  assert.deepEqual(pluginGradleTaskArgs("paper-plugin", "jar"), [
    "paper-plugin:jar",
    "-x",
    "test",
    "--quiet",
  ]);
});

test("pluginGradleTaskArgs strips leading colon", () => {
  assert.deepEqual(pluginGradleTaskArgs(":core", "shadowJar")[0], "core:shadowJar");
});
