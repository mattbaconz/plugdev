import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultInstanceId, prismDataDir, multimcDataDir } from "./detect.js";

describe("defaultInstanceId", () => {
  it("prefixes plugdev-", () => {
    assert.equal(defaultInstanceId("1.21.4"), "plugdev-1.21.4");
  });
});

describe("data dirs", () => {
  it("returns platform-specific prism data dir", () => {
    const dir = prismDataDir();
    assert.ok(dir.length > 0);
    if (process.platform === "win32") {
      assert.match(dir, /PrismLauncher/);
    } else if (process.platform === "darwin") {
      assert.match(dir, /Application Support/);
    } else {
      assert.match(dir, /\.local/);
    }
  });

  it("returns platform-specific multimc data dir", () => {
    const dir = multimcDataDir();
    assert.ok(dir.length > 0);
  });
});
