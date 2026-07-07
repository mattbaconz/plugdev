import { test } from "node:test";
import assert from "node:assert/strict";
import { DEP_ALIASES, listPresetNames, hangarPlatform } from "./presets.js";

test("DEP_ALIASES includes essentials and mineconomy", () => {
  assert.equal(DEP_ALIASES.essentials.author, "EssentialsX");
  assert.equal(DEP_ALIASES.mineconomy.slug, "MineConomy");
  assert.equal(DEP_ALIASES.papi.author, "HelpChat");
});

test("listPresetNames returns primary aliases", () => {
  const names = listPresetNames();
  assert.ok(names.includes("essentials"));
  assert.ok(names.includes("vault"));
});

test("hangarPlatform maps folia to FOLIA", () => {
  assert.equal(hangarPlatform("folia"), "FOLIA");
  assert.equal(hangarPlatform("paper"), "PAPER");
  assert.equal(hangarPlatform("purpur"), "PAPER");
});
