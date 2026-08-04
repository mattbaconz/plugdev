import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  colorsEnabledForMinecraft,
  hasMinecraftCodes,
  minecraftToAnsi,
  stripMinecraftCodes,
} from "./minecraft-ansi.js";

describe("minecraft-ansi", () => {
  it("detects legacy and Adventure hex codes", () => {
    assert.equal(hasMinecraftCodes("hello"), false);
    assert.equal(hasMinecraftCodes("§cRed"), true);
    assert.equal(hasMinecraftCodes("&lBold"), true);
    assert.equal(
      hasMinecraftCodes("§x§2§2§d§3§e§eHex"),
      true,
    );
  });

  it("strips legacy and hex codes", () => {
    assert.equal(stripMinecraftCodes("§cRed§r plain"), "Red plain");
    assert.equal(
      stripMinecraftCodes("§x§2§2§d§3§e§e§lPlug§r"),
      "Plug",
    );
    assert.equal(stripMinecraftCodes("&aOK &rnow"), "OK now");
  });

  it("renders legacy colors and formats as ANSI when color=true", () => {
    const out = minecraftToAnsi("§c§lFAIL§r ok", { color: true });
    assert.match(out, /\x1b\[91m/); // bright red
    assert.match(out, /\x1b\[1m/); // bold
    assert.match(out, /\x1b\[0m/); // reset
    assert.match(out, /FAIL/);
    assert.match(out, /ok$/);
    assert.doesNotMatch(out, /§/);
  });

  it("renders Adventure hex as truecolor ANSI", () => {
    const out = minecraftToAnsi("§x§2§2§d§3§e§eHi", { color: true });
    assert.match(out, /\x1b\[38;2;34;211;238m/); // #22d3ee
    assert.match(out, /Hi/);
    assert.doesNotMatch(out, /§/);
  });

  it("strips instead of coloring when color=false", () => {
    const out = minecraftToAnsi("§x§2§2§d§3§e§e§lPlugTrace§r", { color: false });
    assert.equal(out, "PlugTrace");
  });

  it("FORCE_COLOR overrides NO_COLOR", () => {
    assert.equal(
      colorsEnabledForMinecraft({ NO_COLOR: "1", FORCE_COLOR: "1" }, { isTTY: false }),
      true,
    );
    assert.equal(
      colorsEnabledForMinecraft({ NO_COLOR: "1", FORCE_COLOR: "0" }, { isTTY: true }),
      false,
    );
  });

  it("keeps literal ampersands that are not codes", () => {
    assert.equal(stripMinecraftCodes("a & b"), "a & b");
    assert.equal(minecraftToAnsi("a & b", { color: false }), "a & b");
  });
});
