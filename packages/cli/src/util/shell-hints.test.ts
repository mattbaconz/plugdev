import assert from "node:assert/strict";
import { test } from "node:test";
import { formatNextSteps, initNextSteps, npxRunHint } from "./shell-hints.js";

test("initNextSteps global path uses @latest and plug run", () => {
  assert.deepEqual(initNextSteps(), [
    "npm i -g @plugdev/cli@latest",
    "plugdev init --setup",
    "plug run",
  ]);
});

test("initNextSteps npx path uses init --setup then run", () => {
  assert.deepEqual(initNextSteps({ usedNpx: true }), [
    "npx @plugdev/cli@latest init --setup",
    "npx @plugdev/cli@latest run",
  ]);
});

test("initNextSteps npx keeps agents/mcp flags", () => {
  assert.deepEqual(initNextSteps({ usedNpx: true, agents: true, mcp: true }), [
    "npx @plugdev/cli@latest init --setup --agents --mcp",
    "npx @plugdev/cli@latest run",
  ]);
});

test("formatNextSteps is PowerShell-safe (no &&)", () => {
  const text = formatNextSteps(initNextSteps());
  assert.doesNotMatch(text, /&&/);
  assert.match(text, /1\. npm i -g/);
});

test("npxRunHint is a single npx run command", () => {
  assert.equal(npxRunHint(), "npx @plugdev/cli@latest run");
});
