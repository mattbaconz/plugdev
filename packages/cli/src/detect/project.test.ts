import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject, detectFoliaSupport } from "../detect/project.js";

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
  assert.equal(project.pluginName, "FixtureMaven");
  // api-version from plugin.yml wins over paper-api in pom
  assert.equal(project.minecraftVersion, "1.21");
});

test("detectProject parses paper-api version and shade from pom", async () => {
  const { mkdtemp, writeFile, mkdir, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "plugdev-pom-"));
  try {
    await writeFile(
      join(dir, "pom.xml"),
      `<?xml version="1.0"?>
<project>
  <dependencies>
    <dependency>
      <groupId>io.papermc.paper</groupId>
      <artifactId>paper-api</artifactId>
      <version>1.21.1-R0.1-SNAPSHOT</version>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <artifactId>maven-shade-plugin</artifactId>
      </plugin>
      <plugin>
        <groupId>blue.lhf</groupId>
        <artifactId>run-paper-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>`,
    );
    const project = await detectProject(dir);
    assert.equal(project.type, "plugin");
    assert.equal(project.buildSystem, "maven");
    assert.equal(project.minecraftVersion, "1.21.1");
    assert.equal(project.hasShadowJar, true);
    assert.equal(project.hasRunPaperMaven, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detectProject treats mvnw as maven signal", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "plugdev-mvnw-det-"));
  try {
    await writeFile(join(dir, "mvnw"), "#!/bin/sh\n");
    await writeFile(
      join(dir, "pom.xml"),
      `<project><dependencies><dependency><artifactId>paper-api</artifactId><version>1.21.4-R0.1-SNAPSHOT</version></dependency></dependencies></project>`,
    );
    const project = await detectProject(dir);
    assert.equal(project.buildSystem, "maven");
    assert.equal(project.type, "plugin");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detectProject treats Gradle paper-api without plugin.yml as plugin", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "plugdev-gradle-paper-"));
  try {
    await writeFile(
      join(dir, "build.gradle.kts"),
      `plugins {
  java
  id("xyz.jpenilla.run-paper") version "2.3.1"
}
dependencies {
  compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
}
`,
    );
    const project = await detectProject(dir);
    assert.equal(project.type, "plugin");
    assert.equal(project.buildSystem, "gradle");
    assert.equal(project.minecraftVersion, "1.21.4");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detectProject sets suggestedServer folia when declared", async () => {
  const { mkdtemp, writeFile, mkdir, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "plugdev-folia-"));
  try {
    await mkdir(join(dir, "src", "main", "resources"), { recursive: true });
    await writeFile(join(dir, "build.gradle"), "plugins { id 'java' }\n");
    await writeFile(
      join(dir, "src", "main", "resources", "plugin.yml"),
      "name: FoliaPlug\nmain: a.B\napi-version: '1.21'\nfolia-supported: true\n",
    );
    const project = await detectProject(dir);
    assert.equal(project.type, "plugin");
    assert.equal(project.foliaSupported, true);
    assert.equal(project.suggestedServer, "folia");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detectFoliaSupport is absent for paper-plugin fixture without Folia flag", async () => {
  const support = await detectFoliaSupport(fixtureRoot);
  assert.equal(support, "absent");
});

test("detectProject sets foliaSupported false when metadata lacks Folia flag", async () => {
  const project = await detectProject(fixtureRoot);
  assert.equal(project.foliaSupported, false);
});
