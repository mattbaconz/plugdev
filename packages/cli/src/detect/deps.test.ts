import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  detectProjectDeps,
  mapDepNameToPreset,
  parsePluginYmlDepNames,
  parseBuildDepTokens,
  VIA_COMPAT_DEPS,
} from "./deps.js";

test("VIA_COMPAT_DEPS is Via* only", () => {
  assert.equal(VIA_COMPAT_DEPS.length, 3);
  assert.deepEqual(
    VIA_COMPAT_DEPS.map((d) => d.slug),
    ["ViaVersion", "ViaBackwards", "ViaRewind"],
  );
});

test("mapDepNameToPreset maps Vault and LuckPerms", () => {
  assert.equal(mapDepNameToPreset("Vault")?.slug, "VaultUnlocked");
  const luck = mapDepNameToPreset("LuckPerms");
  assert.ok(luck);
  assert.equal(luck!.source, "modrinth");
  assert.equal(luck!.slug, "luckperms");
  assert.equal(mapDepNameToPreset("PlaceholderAPI")?.slug, "PlaceholderAPI");
  assert.equal(mapDepNameToPreset("SomeCustomPlugin"), undefined);
});

test("parsePluginYmlDepNames reads inline and block lists", () => {
  const inline = parsePluginYmlDepNames("depend: [Vault, LuckPerms]\nsoftdepend: [PlaceholderAPI]\n");
  assert.deepEqual(inline.sort(), ["LuckPerms", "PlaceholderAPI", "Vault"].sort());

  const block = parsePluginYmlDepNames(`softdepend:
  - Vault
  - Essentials
`);
  assert.deepEqual(block.sort(), ["Essentials", "Vault"].sort());
});

test("parseBuildDepTokens finds compileOnly signals", () => {
  const tokens = parseBuildDepTokens(
    `compileOnly("net.luckperms:api:5.4")\ncompileOnly("com.github.MilkBowl:VaultAPI:1.7")\n`,
  );
  assert.ok(tokens.some((t) => /luckperms/i.test(t)));
  assert.ok(tokens.some((t) => /vault/i.test(t)));
});

test("detectProjectDeps merges Via* with plugin.yml softdepend", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-deps-"));
  try {
    await mkdir(join(dir, "src", "main", "resources"), { recursive: true });
    await writeFile(
      join(dir, "src", "main", "resources", "plugin.yml"),
      `name: DepPlugin
main: a.B
api-version: '1.21'
softdepend: [Vault, LuckPerms, WeirdLib]
`,
    );
    await writeFile(join(dir, "build.gradle"), "plugins { id 'java' }\n");

    const result = await detectProjectDeps(dir);
    const slugs = result.deps.map((d) => d.slug);
    assert.ok(slugs.includes("ViaVersion"));
    assert.ok(slugs.includes("ViaBackwards"));
    assert.ok(slugs.includes("ViaRewind"));
    assert.ok(slugs.includes("VaultUnlocked"));
    assert.ok(slugs.includes("luckperms") || slugs.includes("LuckPerms"));
    assert.ok(!slugs.includes("EssentialsX"));
    assert.ok(!slugs.includes("MineConomy"));
    assert.ok(result.unmapped.includes("WeirdLib"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
