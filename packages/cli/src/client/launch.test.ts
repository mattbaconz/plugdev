import { describe, it } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { JOIN_HOST } from "./launch.js";
import { waitForPortOpen } from "../util/port.js";

describe("JOIN_HOST", () => {
  it("uses IPv4 loopback (not localhost) for Quick Play", () => {
    assert.equal(JOIN_HOST, "127.0.0.1");
  });
});

describe("waitForPortOpen", () => {
  it("resolves true once a listener accepts connections", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const port = addr.port;
    try {
      const open = await waitForPortOpen(port, "127.0.0.1", 5_000);
      assert.equal(open, true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("resolves false when nothing is listening", async () => {
    const open = await waitForPortOpen(1, "127.0.0.1", 800);
    assert.equal(open, false);
  });
});
