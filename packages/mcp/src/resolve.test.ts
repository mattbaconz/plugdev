import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePlugdevInvocation } from "./resolve-cli.js";

describe("resolvePlugdevInvocation", () => {
  it("prefers PLUGDEV_CLI when set", () => {
    const prev = process.env.PLUGDEV_CLI;
    process.env.PLUGDEV_CLI = "node /tmp/fake-cli.js";
    try {
      const inv = resolvePlugdevInvocation();
      assert.equal(inv.command, "node");
      assert.deepEqual(inv.baseArgs, ["/tmp/fake-cli.js"]);
    } finally {
      if (prev === undefined) delete process.env.PLUGDEV_CLI;
      else process.env.PLUGDEV_CLI = prev;
    }
  });
});
