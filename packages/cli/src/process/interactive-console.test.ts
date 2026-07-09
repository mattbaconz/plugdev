import { test } from "node:test";
import assert from "node:assert/strict";
import { attachInteractiveConsole } from "./interactive-console.js";

test("attachInteractiveConsole is a no-op without TTY", () => {
  const console = attachInteractiveConsole({
    host: "127.0.0.1",
    port: 25575,
    password: "test",
  });
  // In test runner stdin is typically not a TTY — should not throw.
  console.pause();
  console.resume();
  console.close();
  assert.ok(true);
});
