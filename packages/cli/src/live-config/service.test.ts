import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  editorCandidates,
  listLiveConfigFiles,
  normalizeLiveConfigPath,
  resolvePluginDataDir,
  setLiveConfigWatched,
} from "./service.js";
import { readPlugdevYml } from "../deps/config-write.js";

async function fixture(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "plugdev-live-config-"));
  await mkdir(join(cwd, ".plugdev", "run", "plugins", "ExamplePlugin", "lang"), {
    recursive: true,
  });
  await writeFile(join(cwd, "plugdev.yml"), "type: plugin\nwatch:\n  paths:\n    - src/\n");
  await writeFile(
    join(cwd, ".plugdev", "run", "plugins", "ExamplePlugin", "config.yml"),
    "enabled: true\n",
  );
  await writeFile(
    join(cwd, ".plugdev", "run", "plugins", "ExamplePlugin", "lang", "en_US.yml"),
    "hello: world\n",
  );
  await writeFile(
    join(cwd, ".plugdev", "run", "plugins", "ExamplePlugin", "players.db"),
    "binary-ish",
  );
  return cwd;
}

test("resolvePluginDataDir supports case-insensitive plugin folder names", async () => {
  const cwd = await fixture();
  try {
    assert.equal(
      await resolvePluginDataDir(cwd, "exampleplugin"),
      await realpath(join(cwd, ".plugdev", "run", "plugins", "ExamplePlugin")),
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resolvePluginDataDir prefers the exact plugin folder", async () => {
  const cwd = await fixture();
  try {
    assert.equal(
      await resolvePluginDataDir(cwd, "ExamplePlugin"),
      await realpath(join(cwd, ".plugdev", "run", "plugins", "ExamplePlugin")),
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("listLiveConfigFiles finds supported nested files and excludes databases", async () => {
  const cwd = await fixture();
  try {
    const result = await listLiveConfigFiles(cwd, "ExamplePlugin", ["config.yml"]);
    assert.equal(result.dataDir?.endsWith("ExamplePlugin"), true);
    assert.deepEqual(
      result.files.map((file) => ({ path: file.path, watched: file.watched })),
      [
        { path: "config.yml", watched: true },
        { path: "lang/en_US.yml", watched: false },
      ],
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("normalizeLiveConfigPath rejects absolute paths and traversal", () => {
  assert.equal(normalizeLiveConfigPath("lang\\en_US.yml"), "lang/en_US.yml");
  assert.throws(() => normalizeLiveConfigPath("../server.properties"));
  assert.throws(() => normalizeLiveConfigPath("C:\\Windows\\win.ini"));
  assert.throws(() => normalizeLiveConfigPath("/etc/passwd"));
});

test("setLiveConfigWatched persists an idempotent explicit allowlist", async () => {
  const cwd = await fixture();
  try {
    await setLiveConfigWatched(cwd, "lang/en_US.yml", true);
    await setLiveConfigWatched(cwd, "lang/en_US.yml", true);
    let raw = (await readPlugdevYml(cwd))?.raw;
    assert.deepEqual(raw?.watch?.configs, ["config.yml", "lang/en_US.yml"]);

    await setLiveConfigWatched(cwd, "config.yml", false);
    raw = (await readPlugdevYml(cwd))?.raw;
    assert.deepEqual(raw?.watch?.configs, ["lang/en_US.yml"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("editorCandidates honors VISUAL, EDITOR, VS Code, then platform opener", () => {
  const candidates = editorCandidates(
    "C:\\project\\config.yml",
    { VISUAL: "zed --wait", EDITOR: "notepad" },
    "win32",
  );
  assert.deepEqual(candidates.map((candidate) => candidate.command), [
    "zed",
    "notepad",
    "code",
    "explorer.exe",
  ]);
  assert.deepEqual(candidates[0]?.args, ["--wait", "C:\\project\\config.yml"]);
});
