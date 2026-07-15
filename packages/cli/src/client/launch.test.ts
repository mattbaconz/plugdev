import { describe, it } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { JOIN_HOST, launchClient } from "./launch.js";
import { waitForPortOpen } from "../util/port.js";
import type { ResolvedConfig } from "../config/loader.js";

function baseConfig(port: number): ResolvedConfig {
  return {
    type: "plugin",
    server: "paper",
    version: "1.20.6",
    port,
    build: { system: "gradle", task: "build", jarTask: "jar" },
    watch: { paths: ["src/"], debounceMs: 300, reloadJava: "safe" },
    jvm: { memory: "1G", debugPort: 0 },
    run: { cleanup: "never" },
    dev: { world: "flat", gamemode: "creative", peaceful: true, op: true },
    deps: [],
    raw: {},
  };
}

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

  it("does not launch a client when the server never opens its port", async () => {
    const probe = net.createServer();
    await new Promise<void>((resolve) => {
      probe.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = probe.address();
    assert.ok(addr && typeof addr === "object");
    const port = addr.port;
    await new Promise<void>((resolve, reject) => {
      probe.close((err) => (err ? reject(err) : resolve()));
    });

    const launched = await launchClient({
      config: baseConfig(port),
      launcher: "prism",
      waitForServer: true,
      serverWaitTimeoutMs: 100,
    });

    assert.equal(launched, false);
  });
});
