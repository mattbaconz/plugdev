import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePlugdevJson } from "./json.js";

describe("parsePlugdevJson", () => {
  it("parses the last ok JSON line", () => {
    const out = [
      "noise",
      '{"ok":false,"error":"old"}',
      '{"ok":true,"data":{"port":25565}}',
    ].join("\n");
    const parsed = parsePlugdevJson(out);
    assert.equal(parsed?.ok, true);
    assert.equal((parsed?.data as { port: number }).port, 25565);
  });

  it("returns null when no JSON present", () => {
    assert.equal(parsePlugdevJson("hello world"), null);
  });
});
