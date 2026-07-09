import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEP_ALIASES,
  listPresetNames,
  hangarPlatform,
  DEFAULT_COMPAT_DEPS,
  hasViaCompatDeps,
} from "./presets.js";

test("DEP_ALIASES includes essentials and mineconomy", () => {
  assert.equal(DEP_ALIASES.essentials.author, "EssentialsX");
  assert.equal(DEP_ALIASES.mineconomy.slug, "MineConomy");
  assert.equal(DEP_ALIASES.papi.author, "HelpChat");
});

test("DEP_ALIASES includes Via* presets", () => {
  assert.equal(DEP_ALIASES.viaversion.author, "ViaVersion");
  assert.equal(DEP_ALIASES.viaversion.slug, "ViaVersion");
  assert.equal(DEP_ALIASES.viabackwards.slug, "ViaBackwards");
  assert.equal(DEP_ALIASES.viarewind.slug, "ViaRewind");
  assert.equal(DEP_ALIASES.via.slug, "ViaVersion");
});

test("DEFAULT_COMPAT_DEPS is ViaVersion trio", () => {
  assert.equal(DEFAULT_COMPAT_DEPS.length, 3);
  assert.deepEqual(
    DEFAULT_COMPAT_DEPS.map((d) => d.slug),
    ["ViaVersion", "ViaBackwards", "ViaRewind"],
  );
});

test("hasViaCompatDeps detects Via*", () => {
  assert.equal(hasViaCompatDeps(undefined), false);
  assert.equal(hasViaCompatDeps([]), false);
  assert.equal(
    hasViaCompatDeps([{ name: "EssentialsX", author: "EssentialsX", slug: "EssentialsX" }]),
    false,
  );
  assert.equal(
    hasViaCompatDeps([{ name: "ViaVersion", author: "ViaVersion", slug: "ViaVersion" }]),
    true,
  );
  assert.equal(
    hasViaCompatDeps([{ name: "viaversion", enabled: false }]),
    false,
  );
});

test("listPresetNames returns primary aliases", () => {
  const names = listPresetNames();
  assert.ok(names.includes("viaversion"));
  assert.ok(names.includes("essentials"));
  assert.ok(names.includes("vault"));
});

test("hangarPlatform maps folia to FOLIA", () => {
  assert.equal(hangarPlatform("folia"), "FOLIA");
  assert.equal(hangarPlatform("paper"), "PAPER");
  assert.equal(hangarPlatform("purpur"), "PAPER");
});
