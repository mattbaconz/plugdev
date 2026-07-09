import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runInit } from "./init.js";

describe("runInit", () => {
  it("replaces {{version}} in client instance and adds @plugdev/cli", async () => {
    const dir = join(tmpdir(), `plugdev-init-${Date.now()}`);
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "plugin.yml"),
      "name: TestPlugin\nversion: 1.0.0\nmain: test.Main\napi-version: '1.21'\n",
    );
    await writeFile(join(dir, "build.gradle"), "plugins { id 'java' }\n");
    await writeFile(
      join(dir, "gradle.properties"),
      "minecraft_version=1.21.4\n",
    );

    try {
      const code = await runInit(dir, false);
      assert.equal(code, 0);

      const yml = await readFile(join(dir, "plugdev.yml"), "utf8");
      assert.match(yml, /launcher: auto/);
      assert.match(yml, /offline: false/);
      assert.doesNotMatch(yml, /\{\{version\}\}/);
      assert.match(yml, /world: void/);
      assert.match(yml, /ViaVersion/);
      assert.match(yml, /ViaBackwards/);
      assert.match(yml, /ViaRewind/);
      assert.doesNotMatch(yml, /instance: plugdev-/);
      assert.match(yml, /cleanup: never/);

      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      assert.equal(pkg.scripts.setup, "plugdev setup");
      assert.equal(pkg.scripts.dev, "plugdev run");
      assert.ok(pkg.devDependencies["@plugdev/cli"]?.startsWith("^"));
      // init prints PowerShell-safe next steps (no &&)
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not overwrite existing scripts without --force", async () => {
    const dir = join(tmpdir(), `plugdev-init-keep-${Date.now()}`);
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "plugin.yml"),
      "name: TestPlugin\nversion: 1.0.0\nmain: test.Main\napi-version: '1.21'\n",
    );
    await writeFile(join(dir, "build.gradle"), "plugins { id 'java' }\n");
    await writeFile(
      join(dir, "plugdev.yml"),
      'type: plugin\nserver: paper\nversion: "1.21.4"\n',
    );
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "keep-scripts",
          private: true,
          scripts: { dev: "echo custom" },
        },
        null,
        2,
      ),
    );

    try {
      await runInit(dir, false);
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      };
      assert.equal(pkg.scripts.dev, "echo custom");
      assert.equal(pkg.scripts.setup, "plugdev setup");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes maven build.system for pom.xml projects", async () => {
    const dir = join(tmpdir(), `plugdev-init-maven-${Date.now()}`);
    await mkdir(join(dir, "src", "main", "resources"), { recursive: true });
    await writeFile(
      join(dir, "src", "main", "resources", "plugin.yml"),
      "name: MavenPlugin\nversion: 1.0.0\nmain: test.Main\napi-version: '1.21'\n",
    );
    await writeFile(
      join(dir, "pom.xml"),
      `<?xml version="1.0"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>dev.test</groupId>
  <artifactId>maven-plugin</artifactId>
  <version>1.0.0</version>
  <dependencies>
    <dependency>
      <groupId>io.papermc.paper</groupId>
      <artifactId>paper-api</artifactId>
      <version>1.21.4-R0.1-SNAPSHOT</version>
    </dependency>
  </dependencies>
</project>`,
    );

    try {
      const code = await runInit(dir, false);
      assert.equal(code, 0);
      const yml = await readFile(join(dir, "plugdev.yml"), "utf8");
      assert.match(yml, /system:\s*maven/);
      assert.match(yml, /task:\s*package/);
      assert.match(yml, /jarPattern:\s*"target\/\*\.jar"/);
      assert.doesNotMatch(yml, /system:\s*gradle/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
