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
  assert.equal(DEP_ALIASES.mineconomy.slug, "Mineconomy");
  assert.equal(DEP_ALIASES.papi.author, "HelpChat");
  // EssentialsX is Modrinth-only — not in Hangar DEP_ALIASES
  assert.equal(DEP_ALIASES.essentials, undefined);
});

test("DEP_ALIASES includes Via* presets", () => {
  assert.equal(DEP_ALIASES.viaversion.author, "ViaVersion");
  assert.equal(DEP_ALIASES.viaversion.slug, "ViaVersion");
  assert.equal(DEP_ALIASES.viabackwards.slug, "ViaBackwards");
  assert.equal(DEP_ALIASES.viarewind.slug, "ViaRewind");
  assert.equal(DEP_ALIASES.via.slug, "ViaVersion");
});

test("DEFAULT_COMPAT_DEPS includes Via* plus Vault/Essentials/MineConomy", () => {
  assert.equal(DEFAULT_COMPAT_DEPS.length, 6);
  assert.deepEqual(
    DEFAULT_COMPAT_DEPS.map((d) => d.slug),
    [
      "ViaVersion",
      "ViaBackwards",
      "ViaRewind",
      "VaultUnlocked",
      "essentialsx",
      "Mineconomy",
    ],
  );
});

test("listPresetNames includes expanded ecosystem presets", () => {
  const names = listPresetNames();
  assert.ok(names.includes("worldguard"));
  assert.ok(names.includes("protocollib"));
  assert.ok(names.includes("luckperms"));
  assert.ok(names.includes("discordsrv"));
  assert.ok(!names.includes("citizens"));
  assert.ok(!names.includes("lands"));
});

test("findPreset resolves modrinth luckperms", async () => {
  const { findPreset } = await import("./presets.js");
  const p = findPreset("luckperms");
  assert.ok(p);
  assert.equal(p!.source, "modrinth");
  assert.equal(p!.modrinthSlug, "luckperms");
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
