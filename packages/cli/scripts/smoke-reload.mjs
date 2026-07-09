#!/usr/bin/env node
/**
 * Smoke: boot Paper fixture → write reload trigger → assert bootstrap reload log.
 * Run from plugdev repo root after npm run build (+ bootstrap build).
 *
 * Env:
 *   PLUGDEV_RELOAD_SMOKE_PORT — server port (default 25567)
 *   PLUGDEV_RELOAD_SMOKE_FIXTURE — fixture folder under test/fixtures (default paper-plugin)
 */
import { execa } from "execa";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cli = join(root, "packages", "cli", "dist", "cli.js");
const fixtureName = process.env.PLUGDEV_RELOAD_SMOKE_FIXTURE ?? "paper-plugin";
const fixture = join(root, "test", "fixtures", fixtureName);
const smokePort = process.env.PLUGDEV_RELOAD_SMOKE_PORT ?? "25567";
const runDir = join(fixture, ".plugdev", "run");
const logPath = join(runDir, "logs", "latest.log");

const RELOAD_OK = /\[PlugDev\] Loaded dev plugin:|Loaded dev plugin:/i;

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForLog(pattern, timeoutMs = 90_000) {
  const start = Date.now();
  let lastSize = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const content = await readFile(logPath, "utf8");
      if (content.length !== lastSize) {
        lastSize = content.length;
        if (pattern.test(content)) return content;
      }
    } catch {
      // not ready
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for log pattern: ${pattern}`);
}

console.log("PlugDev reload smoke");
console.log("Fixture:", fixture);

await execa("node", [cli, "--json", "server", "stop"], {
  cwd: fixture,
  reject: false,
});

const start = await execa(
  "node",
  [cli, "--json", "--quiet", "server", "start", "--port", smokePort],
  { cwd: fixture, reject: false, timeout: 240_000 },
);
const startOut = [start.stdout, start.stderr].filter(Boolean).join("\n");
if (start.exitCode !== 0) {
  console.error("FAIL server start\n", startOut.slice(-3000));
  process.exit(1);
}
console.log("OK server start");

// Ensure plugins dir + reload.list exist; touch trigger with current plugin JAR from reload.list or plugins/
await mkdir(runDir, { recursive: true });

let reloadList = "";
try {
  reloadList = (await readFile(join(runDir, "reload.list"), "utf8")).trim();
} catch {
  // build list from plugins/*.jar excluding bootstrap
}

if (!reloadList) {
  const { readdir } = await import("node:fs/promises");
  const plugins = await readdir(join(runDir, "plugins"));
  const jar = plugins.find(
    (f) => f.endsWith(".jar") && !f.includes("bootstrap") && !f.includes("plugdev-bootstrap"),
  );
  if (!jar) {
    console.error("FAIL no plugin JAR in plugins/");
    await execa("node", [cli, "server", "stop"], { cwd: fixture, reject: false });
    process.exit(1);
  }
  reloadList = join(runDir, "plugins", jar);
  await writeFile(join(runDir, "reload.list"), reloadList + "\n");
}

const before = await readFile(logPath, "utf8").catch(() => "");
await writeFile(join(runDir, ".reload-trigger"), String(Date.now()));

console.log("Triggered reload via .reload-trigger");

try {
  await waitForLog(RELOAD_OK, 60_000);
  const after = await readFile(logPath, "utf8");
  const delta = after.slice(before.length);
  if (!RELOAD_OK.test(delta) && !RELOAD_OK.test(after)) {
    throw new Error("Reload marker not found in log delta");
  }
  console.log("OK reload log marker found");
} catch (e) {
  console.error("FAIL reload smoke:", e.message);
  try {
    const tail = await readFile(logPath, "utf8");
    console.error(tail.slice(-2500));
  } catch {
    // ignore
  }
  await execa("node", [cli, "server", "stop"], { cwd: fixture, reject: false });
  process.exit(1);
}

await execa("node", [cli, "--json", "server", "stop"], {
  cwd: fixture,
  reject: false,
});
console.log("All reload smoke checks passed");
