import { test } from "node:test";
import assert from "node:assert/strict";
import { isConfigConsoleCommand, isConfigUiCommand } from "./console-config.js";

test("isConfigConsoleCommand detects .config meta-commands", () => {
  assert.equal(isConfigConsoleCommand(".config"), true);
  assert.equal(isConfigConsoleCommand(".config open"), true);
  assert.equal(isConfigConsoleCommand(".config set key value"), true);
  assert.equal(isConfigConsoleCommand("  .config list  "), true);
  assert.equal(isConfigConsoleCommand("config"), false);
  assert.equal(isConfigConsoleCommand("plugins reload"), false);
  assert.equal(isConfigConsoleCommand(".help"), false);
});

test("isConfigUiCommand is bare .config / ui / pick only", () => {
  assert.equal(isConfigUiCommand(".config"), true);
  assert.equal(isConfigUiCommand(".config ui"), true);
  assert.equal(isConfigUiCommand(".config pick"), true);
  assert.equal(isConfigUiCommand(".config open"), false);
  assert.equal(isConfigUiCommand(".config list"), false);
  assert.equal(isConfigUiCommand(".config set a b"), false);
});
