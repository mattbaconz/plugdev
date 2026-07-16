import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  formatConfigValue,
  getLiveConfigValue,
  getNestedValue,
  parseConfigValue,
  setLiveConfigValue,
  setNestedValue,
} from "./yaml-values.js";

test("parseConfigValue accepts JSON scalars and objects", () => {
  assert.equal(parseConfigValue("true"), true);
  assert.equal(parseConfigValue("42"), 42);
  assert.equal(parseConfigValue("null"), null);
  assert.deepEqual(parseConfigValue('{"a":1}'), { a: 1 });
  assert.equal(parseConfigValue("plain text"), "plain text");
});

test("getNestedValue and setNestedValue walk dotted keys", () => {
  const root: Record<string, unknown> = { nested: { flag: false } };
  assert.equal(getNestedValue(root, "nested.flag"), false);
  setNestedValue(root, "nested.flag", true);
  setNestedValue(root, "nested.other.deep", "x");
  assert.equal(getNestedValue(root, "nested.flag"), true);
  assert.equal(getNestedValue(root, "nested.other.deep"), "x");
  assert.equal(getNestedValue(root, "missing.path"), undefined);
});

test("getLiveConfigValue and setLiveConfigValue round-trip YAML files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plugdev-yaml-values-"));
  const path = join(dir, "config.yml");
  try {
    await writeFile(path, "value: one\nnested:\n  flag: false\n", "utf8");
    assert.equal((await getLiveConfigValue(path, "value")).value, "one");
    await setLiveConfigValue(path, "value", "two");
    await setLiveConfigValue(path, "nested.flag", true);
    const text = await readFile(path, "utf8");
    assert.match(text, /value: two/);
    assert.match(text, /flag: true/);
    assert.equal((await getLiveConfigValue(path, "nested.flag")).value, true);
    assert.equal(formatConfigValue({ a: 1 }), '{\n  "a": 1\n}');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
