import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBootstrapJar, findBootstrapJar } from "./bootstrap.js";

test("findBootstrapJar locates shipped or built bootstrap JAR", async () => {
  const path = await findBootstrapJar();
  assert.ok(path, "expected bootstrap JAR under packages/cli/bootstrap or bootstrap-paper/build");
  assert.match(path, /plugdev-bootstrap-paper/);
});

test("checkBootstrapJar reports ok when JAR exists", async () => {
  const result = await checkBootstrapJar();
  assert.equal(result.ok, true);
  assert.ok(result.path);
});
