import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../detect/project.js";
import { detectMavenModules, detectGradleModules, needsModuleSelection } from "./modules.js";
import { detectProjectDeps } from "./deps.js";

const fixturesBase = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "test",
  "fixtures",
);

test("maven-multimodule fixture: reactor root detects plugin + modules", async () => {
  const root = join(fixturesBase, "maven-multimodule");
  const project = await detectProject(root);
  assert.equal(project.type, "plugin");
  assert.equal(project.buildSystem, "maven");
  assert.ok(project.modules);
  assert.equal(project.modules!.length, 3);
  assert.equal(project.modules![0]!.kind, "library");
  assert.equal(project.modules![1]!.kind, "plugin");
  assert.equal(project.modules![2]!.kind, "plugin");
  assert.equal(project.modules![2]!.foliaSupported, true);
  assert.equal(project.needsModuleSelection, true);
  assert.equal(project.suggestedModule, "worldevents-core");
});

test("maven-multimodule detectMavenModules jar patterns", async () => {
  const modules = await detectMavenModules(join(fixturesBase, "maven-multimodule"));
  assert.equal(modules.find((m) => m.id === "worldevents-core")?.finalName, "WorldEvents-1.0.0");
  assert.equal(needsModuleSelection(modules), true);
});

test("gradle-multimodule fixture: two plugin modules need selection", async () => {
  const root = join(fixturesBase, "gradle-multimodule");
  const project = await detectProject(root);
  assert.equal(project.type, "plugin");
  assert.equal(project.buildSystem, "gradle");
  const modules = project.modules ?? (await detectGradleModules(root));
  assert.equal(modules.length, 3);
  assert.equal(modules[0]!.kind, "library");
  assert.equal(modules.filter((m) => m.kind === "plugin").length, 2);
  assert.equal(project.needsModuleSelection, true);
});

test("detectProjectDeps reads selected module softdepend", async () => {
  const root = join(fixturesBase, "maven-multimodule");
  const result = await detectProjectDeps(root, { module: "worldevents-core" });
  const names = result.deps.map((d) => d.name.toLowerCase());
  assert.ok(names.some((n) => n.includes("worldguard") || n.includes("vault")));
});
