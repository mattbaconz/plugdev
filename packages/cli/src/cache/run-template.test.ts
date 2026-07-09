import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { constants } from "node:fs";
import {
  prepareRunDirectoryAt,
  resolveWorldType,
} from "./run-template.js";
import type { ResolvedConfig } from "../config/loader.js";

function baseConfig(world: "void" | "flat" | "default"): ResolvedConfig {
  return {
    type: "plugin",
    server: "paper",
    version: "1.20.6",
    port: 25565,
    build: { system: "gradle", task: "build", jarTask: "jar" },
    watch: { paths: ["src/"], debounceMs: 300, reloadJava: "safe" },
    jvm: { memory: "1G", debugPort: 0 },
    run: { cleanup: "never" },
    dev: { world, gamemode: "creative", peaceful: true, op: true },
    deps: [],
    raw: {},
  };
}

describe("void world platform", () => {
  it("resolveWorldType maps void/default/flat", () => {
    assert.equal(resolveWorldType(baseConfig("void")), "void");
    assert.equal(resolveWorldType(baseConfig("default")), "default");
    assert.equal(resolveWorldType(baseConfig("flat")), "flat");
  });

  it("writes void generator with solid platform layers", async () => {
    const runDir = join(tmpdir(), `plugdev-void-${Date.now()}`);
    await mkdir(runDir, { recursive: true });
    try {
      await prepareRunDirectoryAt(runDir, baseConfig("void"));
      const props = await readFile(join(runDir, "server.properties"), "utf8");
      assert.match(props, /the_void/);
      assert.match(props, /minecraft:bedrock/);
      assert.match(props, /minecraft:stone/);
      assert.doesNotMatch(
        props,
        /"layers":\[\{"block":"minecraft:air","height":1\}\]/,
      );
      const marker = await readFile(join(runDir, ".plugdev-world-type"), "utf8");
      assert.equal(marker.trim(), "void");
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("regenerates worlds when world type changes", async () => {
    const runDir = join(tmpdir(), `plugdev-regen-${Date.now()}`);
    await mkdir(join(runDir, "world"), { recursive: true });
    await writeFile(join(runDir, ".plugdev-world-type"), "flat\n");
    await writeFile(join(runDir, "world", "level.dat"), "fake");
    try {
      await prepareRunDirectoryAt(runDir, baseConfig("void"));
      await assert.rejects(
        () => access(join(runDir, "world", "level.dat"), constants.F_OK),
      );
      const marker = await readFile(join(runDir, ".plugdev-world-type"), "utf8");
      assert.equal(marker.trim(), "void");
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });
});
