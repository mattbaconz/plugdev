import { test } from "node:test";
import assert from "node:assert/strict";
import { isConfigConsoleCommand } from "./console-config.js";

test("isConfigConsoleCommand detects .config meta-commands", () => {
  assert.equal(isConfigConsoleCommand(".config"), true);
  assert.equal(isConfigConsoleCommand(".config open"), true);
  assert.equal(isConfigConsoleCommand(".config set key value"), true);
  assert.equal(isConfigConsoleCommand("  .config list  "), true);
  assert.equal(isConfigConsoleCommand("config"), false);
  assert.equal(isConfigConsoleCommand("plugins reload"), false);
  assert.equal(isConfigConsoleCommand(".help"), false);
});
