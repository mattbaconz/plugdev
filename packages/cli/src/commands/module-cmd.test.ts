import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runModuleUse } from "../commands/module-cmd.js";
import { parse as parseYaml } from "yaml";

test("runModuleUse writes build.module and jarPattern", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-moduse-"));
  try {
    await writeFile(
      join(dir, "pom.xml"),
      `<project><modules><module>lib</module><module>core</module></modules></project>`,
    );
    await mkdir(join(dir, "lib"), { recursive: true });
    await writeFile(join(dir, "lib", "pom.xml"), `<project><artifactId>lib</artifactId></project>`);
    await mkdir(join(dir, "core", "src", "main", "resources"), { recursive: true });
    await mkdir(join(dir, "core", "src", "main", "java", "com", "ex"), { recursive: true });
    await writeFile(join(dir, "core", "pom.xml"), `<project><artifactId>core</artifactId></project>`);
    await writeFile(
      join(dir, "core", "src", "main", "resources", "plugin.yml"),
      `name: Core\nmain: com.ex.Main\napi-version: "1.21"\n`,
    );
    await writeFile(
      join(dir, "core", "src", "main", "java", "com", "ex", "Main.java"),
      "package com.ex;\npublic class Main {}\n",
    );
    await writeFile(
      join(dir, "plugdev.yml"),
      `type: plugin\nserver: paper\nversion: "1.21.4"\n`,
    );

    const code = await runModuleUse(dir, "core");
    assert.equal(code, 0);
    const yml = parseYaml(await readFile(join(dir, "plugdev.yml"), "utf8")) as {
      build?: { module?: string; jarPattern?: string };
    };
    assert.equal(yml.build?.module, "core");
    assert.ok(yml.build?.jarPattern?.includes("core/"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
