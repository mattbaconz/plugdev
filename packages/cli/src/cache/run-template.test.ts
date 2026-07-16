import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, rm, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { constants } from "node:fs";
import {
  copyPaperToRun,
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
    watch: { paths: ["src/"], configs: ["config.yml"], debounceMs: 300, reloadJava: "safe" },
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
      const devJson = JSON.parse(
        await readFile(join(runDir, "plugdev-dev.json"), "utf8"),
      ) as { op: boolean };
      assert.equal(devJson.op, true);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("writes plugdev-dev.json op false when dev.op is false", async () => {
    const runDir = join(tmpdir(), `plugdev-noop-${Date.now()}`);
    await mkdir(runDir, { recursive: true });
    try {
      const cfg = baseConfig("flat");
      cfg.dev = { ...cfg.dev, op: false };
      await prepareRunDirectoryAt(runDir, cfg);
      const devJson = JSON.parse(
        await readFile(join(runDir, "plugdev-dev.json"), "utf8"),
      ) as { op: boolean };
      assert.equal(devJson.op, false);
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

describe("server JAR selection", () => {
  it("replaces a persistent run JAR when the configured server version changes", async () => {
    const root = join(tmpdir(), `plugdev-server-version-${Date.now()}`);
    const runDir = join(root, "run");
    const oldJar = join(root, "paper-1.21.4.jar");
    const configuredJar = join(root, "paper-1.20.6.jar");
    await mkdir(runDir, { recursive: true });
    await writeFile(oldJar, "paper-1.21.4");
    await writeFile(configuredJar, "paper-1.20.6");

    try {
      const runJar = await copyPaperToRun(runDir, oldJar);
      assert.equal(await readFile(runJar, "utf8"), "paper-1.21.4");

      await mkdir(join(runDir, "config"), { recursive: true });
      await mkdir(join(runDir, "world"), { recursive: true });
      await mkdir(join(runDir, "plugins", "WorldEvents"), { recursive: true });
      await writeFile(
        join(runDir, "config", "paper-world-defaults.yml"),
        "max-leash-distance: default\n",
      );
      await writeFile(join(runDir, "world", "level.dat"), "newer-world");
      await writeFile(
        join(runDir, "plugins", "WorldEvents", "config.yml"),
        "kept: true\n",
      );

      await copyPaperToRun(runDir, configuredJar);
      assert.equal(await readFile(runJar, "utf8"), "paper-1.20.6");
      await assert.rejects(
        () => access(join(runDir, "config"), constants.F_OK),
      );
      await assert.rejects(
        () => access(join(runDir, "world"), constants.F_OK),
      );
      assert.equal(
        await readFile(join(runDir, "plugins", "WorldEvents", "config.yml"), "utf8"),
        "kept: true\n",
      );
      const backups = await readdir(join(runDir, ".plugdev-version-backups"));
      assert.equal(backups.length, 1);
      assert.equal(
        await readFile(
          join(runDir, ".plugdev-version-backups", backups[0]!, "world", "level.dat"),
          "utf8",
        ),
        "newer-world",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("repairs config created before prepared-source tracking without deleting worlds", async () => {
    const root = join(tmpdir(), `plugdev-server-config-upgrade-${Date.now()}`);
    const runDir = join(root, "run");
    const jar = join(root, "paper-1.20.6.jar");
    await mkdir(join(runDir, "config"), { recursive: true });
    await mkdir(join(runDir, "world"), { recursive: true });
    await writeFile(jar, "paper-1.20.6");

    try {
      await copyPaperToRun(runDir, jar);
      const markerPath = join(runDir, ".plugdev-server-jar.json");
      const marker = JSON.parse(await readFile(markerPath, "utf8")) as Record<string, unknown>;
      delete marker.preparedSource;
      await writeFile(markerPath, JSON.stringify(marker));
      await writeFile(
        join(runDir, "config", "paper-world-defaults.yml"),
        "max-leash-distance: default\n",
      );
      await writeFile(join(runDir, "world", "level.dat"), "existing-world");

      await copyPaperToRun(runDir, jar);

      await assert.rejects(
        () => access(join(runDir, "config"), constants.F_OK),
      );
      assert.equal(
        await readFile(join(runDir, "world", "level.dat"), "utf8"),
        "existing-world",
      );
      const backups = await readdir(join(runDir, ".plugdev-version-backups"));
      assert.equal(backups.length, 1);
      assert.equal(
        await readFile(
          join(
            runDir,
            ".plugdev-version-backups",
            backups[0]!,
            "config",
            "paper-world-defaults.yml",
          ),
          "utf8",
        ),
        "max-leash-distance: default\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
