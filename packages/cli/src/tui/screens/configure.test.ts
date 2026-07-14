import { test } from "node:test";
import assert from "node:assert/strict";
import { patchFromValues, valuesFromConfig } from "./Configure.js";

test("patchFromValues includes offlineName and instance", () => {
  const patch = patchFromValues({
    version: "1.20.6",
    server: "paper",
    port: "25565",
    module: "",
    launcher: "prism",
    instance: "FO 26.1.2",
    offlineName: "mattbaconzisthebest",
    players: "Tester2",
    joinOnReady: "true",
    world: "flat",
    gamemode: "creative",
    memory: "1G",
    reloadJava: "safe",
    cleanup: "never",
  });
  assert.equal(patch.client?.offlineName, "mattbaconzisthebest");
  assert.equal(patch.client?.instance, "FO 26.1.2");
  assert.equal(patch.client?.launcher, "prism");
  assert.equal(patch.dev?.world, "flat");
  assert.equal(patch.server, "paper");
  assert.equal(patch.watch?.reload?.java, "safe");
  assert.equal(patch.run?.cleanup, "never");
});

test("valuesFromConfig reads instance and offlineName", () => {
  const values = valuesFromConfig({
    version: "1.21.4",
    server: "purpur",
    client: {
      offlineName: "Hero",
      instance: "MyPack",
      launcher: "prism",
    },
    dev: { world: "flat" },
    watch: { reload: { java: "restart" } },
    run: { cleanup: "on-exit" },
    build: { module: "core" },
  });
  assert.equal(values.offlineName, "Hero");
  assert.equal(values.instance, "MyPack");
  assert.equal(values.server, "purpur");
  assert.equal(values.world, "flat");
  assert.equal(values.reloadJava, "restart");
  assert.equal(values.cleanup, "on-exit");
  assert.equal(values.module, "core");
});
