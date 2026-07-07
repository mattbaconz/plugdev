import { test } from "node:test";
import assert from "node:assert/strict";
import { serversCacheDir, clientManifestPath } from "./paths.js";

test("serversCacheDir uses paper prefix by default", () => {
  const dir = serversCacheDir("1.21.4", "paper");
  assert.match(dir, /paper-1\.21\.4$/);
});

test("serversCacheDir uses folia prefix for Folia", () => {
  const dir = serversCacheDir("1.21.4", "folia");
  assert.match(dir, /folia-1\.21\.4$/);
  assert.doesNotMatch(dir, /paper-/);
});

test("serversCacheDir uses purpur prefix for Purpur", () => {
  const dir = serversCacheDir("1.21.4", "purpur");
  assert.match(dir, /purpur-1\.21\.4$/);
});

test("clientManifestPath lives under plugdev home", () => {
  const path = clientManifestPath();
  assert.match(path, /client[\\/]manifest\.json$/);
});
