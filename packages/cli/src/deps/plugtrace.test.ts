import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolvePlugTraceIntegration,
  writePlugDevIdentity,
  plugTraceBuildHint,
} from "./plugtrace.js";

test("resolvePlugTraceIntegration defaults", () => {
  assert.deepEqual(resolvePlugTraceIntegration(undefined), {
    enabled: false,
    jar: undefined,
    artifact: "auto",
  });
  assert.deepEqual(resolvePlugTraceIntegration({ enabled: true, artifact: "folia", jar: "./x.jar" }), {
    enabled: true,
    jar: "./x.jar",
    artifact: "folia",
  });
});

test("writePlugDevIdentity writes schema fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "plugdev-pt-"));
  try {
    const runDir = join(root, ".plugdev", "run");
    await mkdir(runDir, { recursive: true });
    const projectJar = join(root, "Demo.jar");
    await writeFile(projectJar, "fake-jar-bytes");

    const dest = await writePlugDevIdentity({
      cwd: root,
      runDir,
      projectName: "DemoShop",
      buildSystem: "gradle",
      buildTask: "shadowJar",
      projectJarPath: projectJar,
      plugdevVersion: "0.11.0",
      sessionId: "test-session",
    });

    const raw = JSON.parse(await readFile(dest, "utf8"));
    assert.equal(raw.schemaVersion, "1");
    assert.equal(raw.projectName, "DemoShop");
    assert.equal(raw.buildSystem, "gradle");
    assert.match(raw.artifactHash, /^[a-f0-9]{64}$/);
    assert.equal(raw.plugdevVersion, "0.11.0");
    assert.equal(typeof raw.recordedAt, "string");
    assert.match(plugTraceBuildHint(), /private/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writePlugDevIdentity skips rewrite when stable fields match", async () => {
  const root = await mkdtemp(join(tmpdir(), "plugdev-pt-stable-"));
  try {
    const runDir = join(root, ".plugdev", "run");
    await mkdir(runDir, { recursive: true });
    const projectJar = join(root, "Demo.jar");
    await writeFile(projectJar, "fake-jar-bytes");

    const input = {
      cwd: root,
      runDir,
      projectName: "DemoShop",
      buildSystem: "gradle" as const,
      buildTask: "shadowJar",
      projectJarPath: projectJar,
      plugdevVersion: "1.0.4",
      sessionId: "sess-1",
    };

    const dest = await writePlugDevIdentity(input);
    const first = await readFile(dest, "utf8");
    await new Promise((r) => setTimeout(r, 20));
    const dest2 = await writePlugDevIdentity(input);
    const second = await readFile(dest2, "utf8");

    assert.equal(dest, dest2);
    assert.equal(first, second);
    assert.equal(JSON.parse(first).recordedAt, JSON.parse(second).recordedAt);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writePlugDevIdentity rewrites when artifactHash changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "plugdev-pt-hash-"));
  try {
    const runDir = join(root, ".plugdev", "run");
    await mkdir(runDir, { recursive: true });
    const projectJar = join(root, "Demo.jar");
    await writeFile(projectJar, "bytes-v1");

    const dest = await writePlugDevIdentity({
      cwd: root,
      runDir,
      projectName: "DemoShop",
      buildSystem: "gradle",
      buildTask: "jar",
      projectJarPath: projectJar,
      plugdevVersion: "1.0.4",
    });
    const firstAt = JSON.parse(await readFile(dest, "utf8")).recordedAt as string;

    await writeFile(projectJar, "bytes-v2");
    await new Promise((r) => setTimeout(r, 20));
    await writePlugDevIdentity({
      cwd: root,
      runDir,
      projectName: "DemoShop",
      buildSystem: "gradle",
      buildTask: "jar",
      projectJarPath: projectJar,
      plugdevVersion: "1.0.4",
    });
    const second = JSON.parse(await readFile(dest, "utf8"));
    assert.notEqual(second.recordedAt, firstAt);
    assert.match(second.artifactHash, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
