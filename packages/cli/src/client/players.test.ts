import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePlayerNames } from "./players.js";
import type { ResolvedConfig } from "../config/loader.js";

function baseConfig(client?: ResolvedConfig["client"]): ResolvedConfig {
  return {
    type: "plugin",
    server: "paper",
    version: "1.20.6",
    port: 25565,
    build: { system: "gradle", task: "build", jarTask: "shadowJar" },
    watch: { paths: ["src/"], debounceMs: 300, reloadJava: "safe" },
    jvm: { memory: "1G", debugPort: 5005 },
    run: { cleanup: "never" },
    dev: undefined,
    deps: undefined,
    client,
    raw: {},
  };
}

test("resolvePlayerNames defaults to DevPlayer", () => {
  assert.deepEqual(resolvePlayerNames(baseConfig()), ["DevPlayer"]);
});

test("resolvePlayerNames includes extras and dedupes", () => {
  assert.deepEqual(
    resolvePlayerNames(
      baseConfig({
        offlineName: "DevPlayer",
        players: [{ name: "Tester2" }, { name: "devplayer" }, { name: "Alice" }],
      }),
    ),
    ["DevPlayer", "Tester2", "Alice"],
  );
});
