import { test } from "node:test";
import assert from "node:assert/strict";
import { isInteractiveTty, printNonTtyHelp } from "./tui.js";

test("isInteractiveTty returns boolean", () => {
  assert.equal(typeof isInteractiveTty(), "boolean");
});

test("printNonTtyHelp mentions run and tui", () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    printNonTtyHelp("plugdev");
  } finally {
    console.log = original;
  }
  const text = lines.join("\n");
  assert.match(text, /plugdev run/);
  assert.match(text, /plugdev tui/);
});
