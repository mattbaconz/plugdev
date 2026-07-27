import assert from "node:assert/strict";
import { test } from "node:test";
import { readyFoliaHint, readyWatchHint } from "./spawner.js";

test("readyWatchHint describes safe / restart / hotswap", () => {
  assert.equal(readyWatchHint("safe"), "Edit src/ → save → safe reload");
  assert.equal(
    readyWatchHint("restart"),
    "Edit src/ → save → full server restart",
  );
  assert.equal(
    readyWatchHint("hotswap"),
    "Edit src/ → save → hotswap (falls back to safe reload)",
  );
});

test("readyFoliaHint only for Folia", () => {
  assert.equal(readyFoliaHint("paper"), undefined);
  assert.equal(readyFoliaHint(undefined), undefined);
  assert.match(readyFoliaHint("folia") ?? "", /watch\.reload\.java: restart/);
});
