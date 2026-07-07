import { test } from "node:test";
import assert from "node:assert/strict";
import { Errors, formatError, PlugDevError } from "./errors.js";

test("formatError shows what/cause/fix for PlugDevError", () => {
  const err = Errors.portInUse(25565);
  const out = formatError(err, false);
  assert.match(out, /Port 25565 is already in use/);
  assert.match(out, /Cause:/);
  assert.match(out, /Fix:/);
  assert.doesNotMatch(out, /at /);
});

test("formatError includes stack when debug is true", () => {
  const err = new PlugDevError({
    what: "Test error",
    cause: "test cause",
    fix: "test fix",
  });
  const out = formatError(err, true);
  assert.match(out, /PlugDevError/);
});

test("PlugDevError carries exit code", () => {
  assert.equal(Errors.buildFailed("jar").info.code, 1);
  assert.equal(Errors.serverStartFailed("x").info.code, 2);
  assert.equal(Errors.unknownProject().info.code, 3);
});
