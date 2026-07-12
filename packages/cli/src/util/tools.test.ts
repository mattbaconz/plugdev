import assert from "node:assert/strict";
import {
  minJavaMajorForServerVersion,
  parseJavaMajor,
} from "./tools.js";

assert.equal(parseJavaMajor("21.0.2"), 21);
assert.equal(parseJavaMajor("1.8.0_392"), 8);
assert.equal(parseJavaMajor("25"), 25);
assert.equal(minJavaMajorForServerVersion("1.21.4"), 21);
assert.equal(minJavaMajorForServerVersion("26.1.2"), 25);
assert.equal(minJavaMajorForServerVersion(undefined), 21);
console.log("tools.test.ts: ok");
