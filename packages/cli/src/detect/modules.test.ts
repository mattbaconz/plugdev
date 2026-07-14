import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMavenModuleIds,
  parseGradleModuleIds,
  detectMavenModules,
  detectGradleModules,
  needsModuleSelection,
  autoSelectModule,
  defaultJarPatternForModule,
  defaultWatchPathsForModule,
} from "./modules.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("parseMavenModuleIds extracts reactor modules", () => {
  const pom = `
    <project>
      <modules>
        <module>worldevents-common</module>
        <module>worldevents-core</module>
        <module>worldevents-pro</module>
      </modules>
    </project>
  `;
  assert.deepEqual(parseMavenModuleIds(pom), [
    "worldevents-common",
    "worldevents-core",
    "worldevents-pro",
  ]);
});

test("parseGradleModuleIds extracts include() subprojects", () => {
  const settings = `
    rootProject.name = "demo"
    include("common", "plugin-a", "plugin-b")
  `;
  assert.deepEqual(parseGradleModuleIds(settings), [
    "common",
    "plugin-a",
    "plugin-b",
  ]);
});

test("parseGradleModuleIds handles Kotlin dsl with colons", () => {
  const settings = `include(":fabric", ":neoforge")`;
  assert.deepEqual(parseGradleModuleIds(settings), ["fabric", "neoforge"]);
});

test("detectMavenModules classifies plugin vs library", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-mm-"));
  try {
    await writeFile(
      join(dir, "pom.xml"),
      `<project>
        <packaging>pom</packaging>
        <modules>
          <module>lib</module>
          <module>plugin-mod</module>
        </modules>
      </project>`,
    );
    await mkdir(join(dir, "lib", "src", "main", "java"), { recursive: true });
    await writeFile(
      join(dir, "lib", "pom.xml"),
      `<project><artifactId>lib</artifactId><packaging>jar</packaging></project>`,
    );
    await mkdir(join(dir, "plugin-mod", "src", "main", "resources"), {
      recursive: true,
    });
    await writeFile(
      join(dir, "plugin-mod", "pom.xml"),
      `<project>
        <artifactId>plugin-mod</artifactId>
        <packaging>jar</packaging>
        <build><finalName>MyPlugin-1.0</finalName></build>
      </project>`,
    );
    await writeFile(
      join(dir, "plugin-mod", "src", "main", "resources", "plugin.yml"),
      `name: MyPlugin
main: com.example.Plugin
api-version: "1.21"
folia-supported: true
`,
    );
    await mkdir(join(dir, "plugin-mod", "src", "main", "java", "com", "example"), {
      recursive: true,
    });
    await writeFile(
      join(dir, "plugin-mod", "src", "main", "java", "com", "example", "Plugin.java"),
      "package com.example;\npublic class Plugin {}\n",
    );

    const modules = await detectMavenModules(dir);
    assert.equal(modules.length, 2);
    assert.equal(modules[0]!.kind, "library");
    assert.equal(modules[0]!.id, "lib");
    assert.equal(modules[1]!.kind, "plugin");
    assert.equal(modules[1]!.pluginName, "MyPlugin");
    assert.equal(modules[1]!.foliaSupported, true);
    assert.equal(modules[1]!.finalName, "MyPlugin-1.0");
    assert.equal(needsModuleSelection(modules), false);
    assert.equal(autoSelectModule(modules)?.id, "plugin-mod");
    assert.equal(
      defaultJarPatternForModule("plugin-mod", "maven", "MyPlugin-1.0"),
      "plugin-mod/target/MyPlugin-1.0.jar",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("needsModuleSelection true with two plugin modules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-mm2-"));
  try {
    await writeFile(
      join(dir, "pom.xml"),
      `<project><modules>
        <module>a</module><module>b</module>
      </modules></project>`,
    );
    for (const id of ["a", "b"]) {
      await mkdir(join(dir, id, "src", "main", "resources"), { recursive: true });
      await writeFile(
        join(dir, id, "pom.xml"),
        `<project><artifactId>${id}</artifactId></project>`,
      );
      await writeFile(
        join(dir, id, "src", "main", "resources", "plugin.yml"),
        `name: Plugin${id}\nmain: com.${id}.Main\napi-version: "1.21"\n`,
      );
      await mkdir(join(dir, id, "src", "main", "java", "com", id), { recursive: true });
      await writeFile(
        join(dir, id, "src", "main", "java", "com", id, "Main.java"),
        `package com.${id};\npublic class Main {}\n`,
      );
    }
    const modules = await detectMavenModules(dir);
    assert.equal(needsModuleSelection(modules), true);
    assert.deepEqual(defaultWatchPathsForModule(modules, "a"), [
      "a/src/",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detectGradleModules finds plugin subprojects", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-gmm-"));
  try {
    await writeFile(
      join(dir, "settings.gradle"),
      `rootProject.name = "demo"\ninclude("common", "paper-plugin")\n`,
    );
    await mkdir(join(dir, "common"), { recursive: true });
    await writeFile(join(dir, "common", "build.gradle"), `plugins { id 'java' }\n`);
    await mkdir(join(dir, "paper-plugin", "src", "main", "resources"), {
      recursive: true,
    });
    await writeFile(
      join(dir, "paper-plugin", "build.gradle"),
      `plugins { id 'java' }\n`,
    );
    await writeFile(
      join(dir, "paper-plugin", "src", "main", "resources", "plugin.yml"),
      `name: PaperDemo\nmain: com.demo.Main\napi-version: "1.21"\n`,
    );
    await mkdir(join(dir, "paper-plugin", "src", "main", "java", "com", "demo"), {
      recursive: true,
    });
    await writeFile(
      join(dir, "paper-plugin", "src", "main", "java", "com", "demo", "Main.java"),
      "package com.demo;\npublic class Main {}\n",
    );
    const modules = await detectGradleModules(dir);
    assert.equal(modules.length, 2);
    assert.equal(modules[0]!.kind, "library");
    assert.equal(modules[1]!.kind, "plugin");
    assert.equal(modules[1]!.pluginName, "PaperDemo");
    assert.equal(
      defaultJarPatternForModule("paper-plugin", "gradle"),
      "paper-plugin/build/libs/*.jar",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
