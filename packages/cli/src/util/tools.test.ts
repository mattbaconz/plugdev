import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkGradle, checkMaven, parseJavaMajor } from "./tools.js";

describe("parseJavaMajor", () => {
  it("parses modern versions", () => {
    assert.equal(parseJavaMajor("21.0.2"), 21);
    assert.equal(parseJavaMajor("25.0.2"), 25);
  });

  it("parses legacy 1.x versions", () => {
    assert.equal(parseJavaMajor("1.8.0_392"), 8);
  });

  it("returns undefined for empty", () => {
    assert.equal(parseJavaMajor(undefined), undefined);
    assert.equal(parseJavaMajor(""), undefined);
  });
});

describe("checkGradle", () => {
  it("returns false when gradlew is missing", async () => {
    const dir = join(tmpdir(), `plugdev-gradle-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    try {
      assert.equal(await checkGradle(dir), false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns false when gradlew exits non-zero", async () => {
    const dir = join(tmpdir(), `plugdev-gradle-bad-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const script =
      process.platform === "win32"
        ? join(dir, "gradlew.bat")
        : join(dir, "gradlew");
    if (process.platform === "win32") {
      await writeFile(script, "@echo off\r\nexit /b 1\r\n");
    } else {
      await writeFile(script, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    }
    try {
      assert.equal(await checkGradle(dir), false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("checkMaven", () => {
  it("returns a boolean without throwing", async () => {
    const result = await checkMaven(process.cwd());
    assert.equal(typeof result, "boolean");
  });
});
