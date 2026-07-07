import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveServerProject } from "./server.js";

test("resolveServerProject maps server types", () => {
  assert.equal(resolveServerProject("paper"), "paper");
  assert.equal(resolveServerProject("folia"), "folia");
  assert.equal(resolveServerProject("purpur"), "purpur");
  assert.equal(resolveServerProject("pufferfish"), "pufferfish");
  assert.equal(resolveServerProject("spigot"), "spigot");
});
