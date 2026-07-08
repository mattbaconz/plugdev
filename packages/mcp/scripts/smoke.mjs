#!/usr/bin/env node
/**
 * Smoke test: plugdev agent commands against paper-plugin fixture.
 * Run from plugdev repo root after npm run build.
 */
import { execa } from "execa";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cli = join(root, "packages", "cli", "dist", "cli.js");
const fixture = join(root, "test", "fixtures", "paper-plugin");
const smokePort = process.env.PLUGDEV_SMOKE_PORT ?? "25566";

function parseJsonOutput(combined) {
  const match = combined.match(/\{"ok":[\s\S]*?\}(?=\s*$|\s*unknown|\s*\*{3})/m);
  if (match) return JSON.parse(match[0]);
  const line = combined
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{") && l.includes('"ok"'));
  if (line) return JSON.parse(line);
  return null;
}

async function run(args) {
  const { stdout, stderr, exitCode } = await execa(
    "node",
    [cli, "--json", "--quiet", ...args],
    {
      cwd: fixture,
      reject: false,
      timeout: 180_000,
    },
  );
  const combined = [stdout, stderr].filter(Boolean).join("\n");
  const json = parseJsonOutput(combined);
  if (!json) {
    console.error("FAIL", args.join(" "), "no JSON output\n", combined.slice(-2000));
    process.exit(1);
  }
  if (!json.ok) {
    console.error("FAIL", args.join(" "), json);
    process.exit(1);
  }
  console.log("OK", args.join(" "));
  return json;
}

console.log("PlugDev MCP smoke test");
console.log("Fixture:", fixture);

await execa("node", [cli, "--json", "server", "stop"], { cwd: fixture, reject: false });

await run(["doctor"]);
await run(["build"]);
await run(["sync"]);
const start = await run(["server", "start", "--port", smokePort]);
await run(["server", "status"]);
await run(["server", "command", "say plugdev-smoke"]);
await run(["server", "logs", "--lines", "5"]);
await run(["server", "stop"]);

console.log("All smoke checks passed. Port was", start.data?.port);
