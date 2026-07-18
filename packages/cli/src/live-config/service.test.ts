import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  editorCandidates,
  editorChildSpawnOptions,
  listLiveConfigFiles,
  normalizeLiveConfigPath,
  resolvePluginDataDir,
  setLiveConfigWatched,
  windowsPowerShellStartProcess,
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

test("editorCandidates auto prefers VISUAL, EDITOR, cursor, code, notepad, then system", () => {
  const candidates = editorCandidates(
    "C:\\project\\config.yml",
    "auto",
    { VISUAL: "zed --wait", EDITOR: "nano" },
    "win32",
  );
  assert.deepEqual(candidates.map((candidate) => candidate.command), [
    "zed",
    "nano",
    "cursor",
    "code",
    "notepad.exe",
    "powershell.exe",
  ]);
  assert.deepEqual(candidates[0]?.args, ["--wait", "C:\\project\\config.yml"]);
  const system = candidates.at(-1)!;
  assert.equal(system.label, "system");
  assert.ok(system.args.includes("-WindowStyle"));
  assert.ok(system.args.includes("Hidden"));
  assert.ok(system.args.some((a) => a.includes("Start-Process") && a.includes("config.yml")));
});

test("editorCandidates respects an explicit cursor preference", () => {
  const candidates = editorCandidates(
    "C:\\project\\config.yml",
    "cursor",
    {},
    "win32",
  );
  assert.deepEqual(candidates.map((c) => c.command), ["cursor"]);
});

test("windowsPowerShellStartProcess never uses cmd.exe", () => {
  const opened = windowsPowerShellStartProcess("C:\\a b\\config.yml");
  assert.equal(opened.command, "powershell.exe");
  assert.ok(!opened.args.some((a) => /cmd/i.test(a)));
  assert.ok(opened.args.includes("Hidden"));
});

test("editorChildSpawnOptions disables detached on Windows", () => {
  const opts = editorChildSpawnOptions("win32");
  assert.equal(opts.detached, false);
  assert.equal(opts.windowsHide, true);
  assert.equal(opts.stdio, "ignore");
});

test("editorCandidates notepad preference stays notepad.exe", () => {
  const candidates = editorCandidates(
    "C:\\project\\config.yml",
    "notepad",
    {},
    "win32",
  );
  assert.deepEqual(candidates, [
    { command: "notepad.exe", args: ["C:\\project\\config.yml"], label: "notepad" },
  ]);
});

test("editorCandidates system preference uses PowerShell Start-Process", () => {
  const candidates = editorCandidates(
    "C:\\project\\config.yml",
    "system",
    {},
    "win32",
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.command, "powershell.exe");
});
