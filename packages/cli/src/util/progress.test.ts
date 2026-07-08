import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDownloadProgress } from "./progress.js";

describe("createDownloadProgress", () => {
  it("skips duplicate percent updates", () => {
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    (process.stdout as { write: typeof process.stdout.write }).write = ((
      chunk: string | Uint8Array,
    ) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const report = createDownloadProgress("Downloading paper…");
      report(10, "Downloading paper…");
      report(10, "Downloading paper…");
      report(11, "Downloading paper…");
      assert.equal(writes.length, 2);
      assert.match(writes[0]!, /10%/);
      assert.match(writes[1]!, /11%/);
    } finally {
      process.stdout.write = original;
    }
  });
});
