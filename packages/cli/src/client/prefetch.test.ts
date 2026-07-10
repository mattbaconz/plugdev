import { test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { constants } from "node:fs";

const require = createRequire(import.meta.url);

test("isMissingLibrariesError detects xmcl MissingLibraries", async () => {
  const { isMissingLibrariesError } = await import("./prefetch.js");
  assert.equal(
    isMissingLibrariesError(
      Object.assign(new Error("Missing 10 libraries!"), { error: "MissingLibraries" }),
    ),
    true,
  );
  assert.equal(isMissingLibrariesError(new Error("other")), false);
  assert.equal(isMissingLibrariesError(null), false);
});

test("isEmbeddedClientCached is true when version JSON exists only", async () => {
  const home = await mkdtemp(join(tmpdir(), "plugdev-prefetch-"));
  process.env.PLUGDEV_HOME = home;
  try {
    // Re-import after env so plugdevHome picks it up — paths read env at call time
    const { isEmbeddedClientCached, isEmbeddedClientReady, embeddedClientDir } =
      await import("./prefetch.js");

    const ver = "1.20.6-test";
    const versionDir = join(embeddedClientDir(), "versions", ver);
    await mkdir(versionDir, { recursive: true });
    await writeFile(join(versionDir, `${ver}.json`), JSON.stringify({ id: ver }), "utf8");

    assert.equal(await isEmbeddedClientCached(ver), true);
    // diagnose will fail / report issues without a real install → not ready
    assert.equal(await isEmbeddedClientReady(ver), false);
  } finally {
    delete process.env.PLUGDEV_HOME;
    await rm(home, { recursive: true, force: true });
  }
});

test("purgeEmptyAssetObjects removes 0-byte files", async () => {
  const { purgeEmptyAssetObjects } = await import("./prefetch.js");
  const root = await mkdtemp(join(tmpdir(), "plugdev-assets-"));
  try {
    const dir = join(root, "assets", "objects", "ab");
    await mkdir(dir, { recursive: true });
    const empty = join(dir, "abcdef");
    const ok = join(dir, "goodfile");
    await writeFile(empty, "", "utf8");
    await writeFile(ok, "not-empty", "utf8");
    const removed = await purgeEmptyAssetObjects(root);
    assert.equal(removed, 1);
    await assert.rejects(async () => access(empty, constants.F_OK));
    await access(ok, constants.F_OK);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("isAssetDownloadError detects timeout and checksum failures", async () => {
  const { isAssetDownloadError } = await import("./prefetch.js");
  assert.equal(
    isAssetDownloadError(
      Object.assign(new Error("Connect Timeout Error"), {
        code: "UND_ERR_CONNECT_TIMEOUT",
        name: "ConnectTimeoutError",
      }),
    ),
    true,
  );
  assert.equal(
    isAssetDownloadError(
      new AggregateError([
        Object.assign(new Error("sha1 checksum not match"), {
          name: "ChecksumNotMatchError",
        }),
      ]),
    ),
    true,
  );
  assert.equal(isAssetDownloadError(new Error("unrelated")), false);
});

test("embedded adapter source calls ensureEmbeddedClient", () => {
  const { readFileSync } = require("node:fs");
  const { fileURLToPath } = require("node:url");
  const { dirname, join: pathJoin } = require("node:path");
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(pathJoin(dir, "adapters", "embedded.ts"), "utf8");
  assert.match(src, /ensureEmbeddedClient/);
  assert.equal(src.includes("isEmbeddedClientCached"), false);
});
