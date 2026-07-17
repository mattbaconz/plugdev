import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runConfigGet,
  runConfigList,
  runConfigOpen,
  runConfigSet,
  runConfigWatch,
} from "./config-cmd.js";
import { readPlugdevYml } from "../deps/config-write.js";
import { setJsonMode } from "../util/output.js";

async function fixture(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "plugdev-config-command-"));
  await mkdir(join(cwd, "src", "main", "resources"), { recursive: true });
  await mkdir(join(cwd, ".plugdev", "run", "plugins", "ConfigCommand"), {
    recursive: true,
  });
  await writeFile(
    join(cwd, "src", "main", "resources", "plugin.yml"),
    "name: ConfigCommand\nmain: dev.example.Main\napi-version: '1.21'\n",
  );
  await writeFile(join(cwd, "build.gradle.kts"), "plugins { java }\n");
  await writeFile(join(cwd, "plugdev.yml"), "type: plugin\nversion: 1.21.4\n");
  await writeFile(
    join(cwd, ".plugdev", "run", "plugins", "ConfigCommand", "config.yml"),
    "secret: do-not-print\n",
  );
  return cwd;
}

test("runConfigList JSON includes paths and status but never file contents", async () => {
  const cwd = await fixture();
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  setJsonMode(true);
  try {
    assert.equal(await runConfigList(cwd), 0);
    const output = lines.join("\n");
    assert.match(output, /config\.yml/);
    assert.match(output, /watched/);
    assert.doesNotMatch(output, /do-not-print/);
  } finally {
    setJsonMode(false);
    console.log = original;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runConfigOpen resolves the live file before invoking the editor", async () => {
  const cwd = await fixture();
  let opened: string | undefined;
  let preference: string | undefined;
  try {
    assert.equal(
      await runConfigOpen(cwd, "config.yml", {
        opener: async (path, pref) => {
          opened = path;
          preference = pref;
        },
      }),
      0,
    );
    assert.equal(opened?.endsWith(join("ConfigCommand", "config.yml")), true);
    assert.equal(preference, "auto");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runConfigOpen reports editor failures without crashing", async () => {
  const cwd = await fixture();
  try {
    assert.equal(
      await runConfigOpen(cwd, "config.yml", {
        opener: async () => {
          throw new Error("editor unavailable");
        },
      }),
      1,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runConfigWatch toggles the persisted allowlist", async () => {
  const cwd = await fixture();
  try {
    assert.equal(await runConfigWatch(cwd, "lang/en_US.yml", true), 0);
    assert.deepEqual((await readPlugdevYml(cwd))?.raw.watch?.configs, [
      "config.yml",
      "lang/en_US.yml",
    ]);
    assert.equal(await runConfigWatch(cwd, "config.yml", false), 0);
    assert.deepEqual((await readPlugdevYml(cwd))?.raw.watch?.configs, [
      "lang/en_US.yml",
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("runConfigGet and runConfigSet read and write dotted keys", async () => {
  const cwd = await fixture();
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  setJsonMode(true);
  try {
    assert.equal(await runConfigSet(cwd, "config.yml", "secret", "updated"), 0);
    assert.equal(await runConfigSet(cwd, "config.yml", "nested.flag", "true"), 0);
    lines.length = 0;
    assert.equal(await runConfigGet(cwd, "config.yml", "secret"), 0);
    assert.match(lines.join("\n"), /"value":\s*"updated"/);
    lines.length = 0;
    assert.equal(await runConfigGet(cwd, "config.yml", "nested.flag"), 0);
    assert.match(lines.join("\n"), /"value":\s*true/);
    const text = await readFile(
      join(cwd, ".plugdev", "run", "plugins", "ConfigCommand", "config.yml"),
      "utf8",
    );
    assert.match(text, /secret: updated/);
    assert.match(text, /flag: true/);
  } finally {
    setJsonMode(false);
    console.log = original;
    await rm(cwd, { recursive: true, force: true });
  }
});
