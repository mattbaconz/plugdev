import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isExcludedJar,
  matchGlob,
  pickBestJar,
  findJarByPattern,
} from "./jars.js";
import { writeMinimalPluginJar } from "./deploy.js";
import {
  findMavenJar,
  resolveMavenCommand,
  mavenBuildArgs,
  defaultMavenJarPattern,
  pomHasModules,
} from "./maven.js";

test("isExcludedJar filters sources, javadoc, original, tests", () => {
  assert.equal(isExcludedJar("foo-sources.jar"), true);
  assert.equal(isExcludedJar("foo-javadoc.jar"), true);
  assert.equal(isExcludedJar("original-foo.jar"), true);
  assert.equal(isExcludedJar("foo-tests.jar"), true);
  assert.equal(isExcludedJar("foo-1.0.0.jar"), false);
  assert.equal(isExcludedJar("foo-shaded.jar"), false);
});

test("matchGlob supports simple * patterns", () => {
  assert.equal(matchGlob("fixture-1.0.0.jar", "*.jar"), true);
  assert.equal(matchGlob("fixture-1.0.0.jar", "fixture-*.jar"), true);
  assert.equal(matchGlob("other.jar", "fixture-*.jar"), false);
});

test("pickBestJar prefers finalName plugin jar over module-shaded sibling", async () => {
  const dir = join(tmpdir(), `plugdev-jar-pick-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    await writeMinimalPluginJar(join(dir, "WorldEvents-1.0.jar"), "WorldEvents");
    await writeMinimalPluginJar(
      join(dir, "worldevents-core-1.0-shaded.jar"),
      "WorldEvents",
    );
    const chosen = await pickBestJar(dir, [
      "worldevents-core-1.0-shaded.jar",
      "WorldEvents-1.0.jar",
    ]);
    assert.ok(chosen.endsWith("WorldEvents-1.0.jar"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pickBestJar keeps lone shaded jar when it is the only plugin.yml jar", async () => {
  const dir = join(tmpdir(), `plugdev-jar-lone-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(join(dir, "noise.jar"), "not a plugin");
    await writeMinimalPluginJar(join(dir, "app-1.0-shaded.jar"), "App");
    const chosen = await pickBestJar(dir, ["noise.jar", "app-1.0-shaded.jar"]);
    assert.ok(chosen.endsWith("app-1.0-shaded.jar"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("findJarByPattern excludes original- and sources", async () => {
  const dir = join(tmpdir(), `plugdev-jar-pat-${Date.now()}`);
  const target = join(dir, "target");
  await mkdir(target, { recursive: true });
  try {
    await writeFile(join(target, "original-app-1.0.0.jar"), "orig");
    await writeFile(join(target, "app-1.0.0-sources.jar"), "src");
    await writeFile(join(target, "app-1.0.0.jar"), "real artifact bytes");
    const path = await findJarByPattern(dir, "target/*.jar", "package");
    assert.ok(path.endsWith("app-1.0.0.jar"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("findMavenJar uses jarPattern when provided", async () => {
  const dir = join(tmpdir(), `plugdev-mvn-pat-${Date.now()}`);
  const target = join(dir, "target");
  await mkdir(target, { recursive: true });
  try {
    await writeFile(join(target, "noise.jar"), "n");
    await writeFile(join(target, "fixture-maven-plugin-1.0.0.jar"), "plugin");
    const path = await findMavenJar(
      dir,
      "target/fixture-maven-plugin-*.jar",
      "package",
    );
    assert.ok(path.includes("fixture-maven-plugin-1.0.0.jar"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("findMavenJar picks best jar in target/ without pattern", async () => {
  const dir = join(tmpdir(), `plugdev-mvn-def-${Date.now()}`);
  const target = join(dir, "target");
  await mkdir(target, { recursive: true });
  try {
    await writeFile(join(target, "original-app-1.0.0.jar"), "o");
    await writeFile(join(target, "app-1.0.0-sources.jar"), "s");
    await writeFile(join(target, "app-1.0.0.jar"), "real");
    const path = await findMavenJar(dir);
    assert.ok(path.endsWith("app-1.0.0.jar"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveMavenCommand prefers mvnw when present", async () => {
  const dir = join(tmpdir(), `plugdev-mvnw-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    const name = process.platform === "win32" ? "mvnw.cmd" : "mvnw";
    await writeFile(join(dir, name), "#!/bin/sh\necho ok\n");
    const resolved = await resolveMavenCommand(dir);
    assert.equal(resolved.viaWrapper, true);
    assert.ok(resolved.command.includes("mvnw"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveMavenCommand falls back to mvn", async () => {
  const dir = join(tmpdir(), `plugdev-mvn-sys-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    const resolved = await resolveMavenCommand(dir);
    assert.equal(resolved.viaWrapper, false);
    assert.equal(resolved.command, "mvn");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mavenBuildArgs adds -pl -am when module set", () => {
  assert.deepEqual(mavenBuildArgs({ task: "package" }), [
    "package",
    "-DskipTests",
    "-q",
  ]);
  assert.deepEqual(mavenBuildArgs({ task: "package", module: "plugin-module" }), [
    "-pl",
    "plugin-module",
    "-am",
    "package",
    "-DskipTests",
    "-q",
  ]);
});

test("defaultMavenJarPattern uses module path", () => {
  assert.equal(defaultMavenJarPattern(), "target/*.jar");
  assert.equal(
    defaultMavenJarPattern("plugin-module"),
    "plugin-module/target/*.jar",
  );
  assert.equal(
    defaultMavenJarPattern("plugin-module/"),
    "plugin-module/target/*.jar",
  );
});

test("pomHasModules detects reactor pom", async () => {
  const dir = join(tmpdir(), `plugdev-reactor-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(
      join(dir, "pom.xml"),
      `<project><modules><module>plugin-module</module></modules></project>`,
    );
    assert.equal(await pomHasModules(dir), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
