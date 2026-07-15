import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  deployPluginJar,
  jarMatchesPluginName,
  pruneStalePluginJars,
  readPluginNameFromJar,
  writeMinimalPluginJar,
} from "./deploy.js";

test("jarMatchesPluginName matches versioned and reload jars", () => {
  assert.equal(jarMatchesPluginName("WorldEvents-1.8.29.jar", "WorldEvents"), true);
  assert.equal(jarMatchesPluginName("WorldEvents-1.8.30-reload-123.jar", "WorldEvents"), true);
  assert.equal(jarMatchesPluginName("WorldEvents.jar", "WorldEvents"), true);
  assert.equal(jarMatchesPluginName("ViaVersion-5.jar", "WorldEvents"), false);
  assert.equal(jarMatchesPluginName("plugdev-bootstrap-paper.jar", "WorldEvents"), false);
});

test("readPluginNameFromJar reads name from minimal jar", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-deploy-"));
  const jar = join(dir, "WorldEvents-1.8.30.jar");
  await writeMinimalPluginJar(jar, "WorldEvents");
  assert.equal(await readPluginNameFromJar(jar), "WorldEvents");
});

test("deployPluginJar prunes older same-plugin jars", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-deploy-"));
  const plugins = join(dir, "plugins");
  await mkdir(plugins, { recursive: true });
  const oldA = join(plugins, "WorldEvents-1.8.29.jar");
  const oldB = join(plugins, "WorldEvents-1.8.28-reload-999.jar");
  const other = join(plugins, "ViaVersion-5.jar");
  const src = join(dir, "WorldEvents-1.8.30.jar");

  await writeMinimalPluginJar(oldA, "WorldEvents");
  await writeMinimalPluginJar(oldB, "WorldEvents");
  await writeMinimalPluginJar(other, "ViaVersion");
  await writeMinimalPluginJar(src, "WorldEvents");

  const dest = await deployPluginJar(src, plugins, "WorldEvents", false);
  assert.ok(dest.endsWith("WorldEvents-1.8.30.jar"));

  const names = await readdir(plugins);
  assert.deepEqual(names.sort(), ["ViaVersion-5.jar", "WorldEvents-1.8.30.jar"].sort());
});

test("pruneStalePluginJars keeps destination and bootstrap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-prune-"));
  await writeMinimalPluginJar(join(dir, "WorldEvents-1.jar"), "WorldEvents");
  await writeMinimalPluginJar(join(dir, "WorldEvents-2.jar"), "WorldEvents");
  await writeFile(join(dir, "plugdev-bootstrap-paper.jar"), "x");

  const removed = await pruneStalePluginJars(dir, "WorldEvents", "WorldEvents-2.jar");
  assert.deepEqual(removed.sort(), ["WorldEvents-1.jar"]);
  const names = await readdir(dir);
  assert.ok(names.includes("WorldEvents-2.jar"));
  assert.ok(names.includes("plugdev-bootstrap-paper.jar"));
});
