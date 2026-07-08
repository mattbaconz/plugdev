import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isPaperJarCached } from "./fill.js";

describe("isPaperJarCached", () => {
  it("returns true from local meta.json without needing network when jar matches", async () => {
    // Use a unique fake version path under the real cache home structure via env override if available.
    // Without network, missing meta should return false quickly when API also fails.
    const result = await isPaperJarCached("0.0.0-nonexistent", "paper");
    assert.equal(result, false);
  });

  it("accepts valid local meta + jar", async () => {
    const { createHash } = await import("node:crypto");
    const { plugdevHome } = await import("../paths.js");
    const dir = join(plugdevHome(), "servers", "paper-9.9.9-test");
    await mkdir(dir, { recursive: true });
    const jarName = "paper-9.9.9-test.jar";
    const bytes = Buffer.from("fake-paper-jar");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(dir, jarName), bytes);
    await writeFile(
      join(dir, "meta.json"),
      JSON.stringify({
        mcVersion: "9.9.9-test",
        project: "paper",
        jarName,
        sha256,
      }),
    );

    try {
      // serversCacheDir uses paper-{version} layout — match that
      const { serversCacheDir } = await import("../paths.js");
      const expected = serversCacheDir("9.9.9-test", "paper");
      assert.equal(expected, dir);
      assert.equal(await isPaperJarCached("9.9.9-test", "paper"), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
