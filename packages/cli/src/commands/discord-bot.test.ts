import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectProject } from "../detect/project.js";
import { runInit } from "./init.js";
import { loadConfig } from "../config/loader.js";

describe("discord-bot init + detect", () => {
  it("detects discord.js package as discord-bot", async () => {
    const dir = join(tmpdir(), `plugdev-discord-det-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "my-bot",
          type: "module",
          main: "index.js",
          dependencies: { "discord.js": "^14.0.0" },
        },
        null,
        2,
      ),
    );
    await writeFile(join(dir, "index.js"), "console.log('bot');\n");

    try {
      const project = await detectProject(dir);
      assert.equal(project.type, "discord-bot");
      assert.equal(project.buildSystem, "node");
      assert.equal(project.botTokenEnv, "DISCORD_TOKEN");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("init writes type: discord-bot template", async () => {
    const dir = join(tmpdir(), `plugdev-discord-init-${Date.now()}`);
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "my-bot",
          private: true,
          main: "src/index.js",
          scripts: { start: "node src/index.js" },
          dependencies: { "discord.js": "^14.0.0" },
        },
        null,
        2,
      ),
    );
    await writeFile(join(dir, "src", "index.js"), "console.log('hi');\n");

    try {
      const code = await runInit(dir, true);
      assert.equal(code, 0);
      const yml = await readFile(join(dir, "plugdev.yml"), "utf8");
      assert.match(yml, /type:\s*discord-bot/);
      assert.match(yml, /tokenEnv:\s*DISCORD_TOKEN/);
      assert.doesNotMatch(yml, /type:\s*plugin/);
      assert.doesNotMatch(yml, /ViaVersion/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("hotswap config override", () => {
  it("--hotswap sets reloadJava and enables JDWP port", async () => {
    const dir = join(tmpdir(), `plugdev-hotswap-cfg-${Date.now()}`);
    await mkdir(join(dir, "src", "main", "resources"), { recursive: true });
    await writeFile(join(dir, "build.gradle"), "plugins { id 'java' }\n");
    await writeFile(
      join(dir, "src", "main", "resources", "plugin.yml"),
      "name: HsPlug\nmain: a.B\napi-version: '1.21'\n",
    );
    await writeFile(
      join(dir, "plugdev.yml"),
      'type: plugin\nserver: paper\nversion: "1.21.4"\nwatch:\n  reload:\n    java: safe\n',
    );

    try {
      const project = await detectProject(dir);
      const config = await loadConfig(dir, project, { hotswap: true });
      assert.equal(config.watch.reloadJava, "hotswap");
      assert.equal(config.jvm.debugPort, 5005);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("yml hotswap enables JDWP without --debug", async () => {
    const dir = join(tmpdir(), `plugdev-hotswap-yml-${Date.now()}`);
    await mkdir(join(dir, "src", "main", "resources"), { recursive: true });
    await writeFile(join(dir, "build.gradle"), "plugins { id 'java' }\n");
    await writeFile(
      join(dir, "src", "main", "resources", "plugin.yml"),
      "name: HsPlug\nmain: a.B\napi-version: '1.21'\n",
    );
    await writeFile(
      join(dir, "plugdev.yml"),
      'type: plugin\nserver: paper\nversion: "1.21.4"\nwatch:\n  reload:\n    java: hotswap\n',
    );

    try {
      const project = await detectProject(dir);
      const config = await loadConfig(dir, project, {});
      assert.equal(config.watch.reloadJava, "hotswap");
      assert.equal(config.jvm.debugPort, 5005);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
