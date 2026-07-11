#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function collectTests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      collectTests(path, out);
    } else if (name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

const files = collectTests("src");
if (files.length === 0) {
  console.error("No *.test.ts files found under src/");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { stdio: "inherit", cwd: process.cwd() },
);

process.exit(result.status ?? 1);
