import { test } from "node:test";
import assert from "node:assert/strict";
import { configScreenMessage, configScreenRows } from "./Configs.js";

test("config screen explains that the plugin must run before configs exist", () => {
  assert.match(configScreenMessage(undefined, 0), /run the project once/i);
});

test("config screen rows mark watched live files without exposing contents", () => {
  const rows = configScreenRows([
    { path: "config.yml", absolutePath: "C:/run/config.yml", watched: true },
    { path: "lang/en_US.yml", absolutePath: "C:/run/lang/en_US.yml", watched: false },
  ]);
  assert.deepEqual(rows, [
    { path: "config.yml", marker: "●", watched: true },
    { path: "lang/en_US.yml", marker: "○", watched: false },
  ]);
});
