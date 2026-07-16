#!/usr/bin/env node
/** Smoke: run fixture with watch -> edit live config -> assert targeted reload + same PID. */
import { execa } from "execa";
import { readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cli = join(root, "packages", "cli", "dist", "cli.js");
const fixture = join(root, "test", "fixtures", "paper-plugin");
const port = process.env.PLUGDEV_CONFIG_SMOKE_PORT ?? "25568";
const runDir = join(fixture, ".plugdev", "run");
const logPath = join(runDir, "logs", "latest.log");
const sessionPath = join(fixture, ".plugdev", "session.json");
const liveConfig = join(runDir, "plugins", "FixturePlugin", "config.yml");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForLog(pattern, fromOffset = 0, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const content = await readFile(logPath, "utf8");
      const appended = content.slice(Math.min(fromOffset, content.length));
      if (pattern.test(appended)) return content;
    } catch {
      // Server has not created the log yet.
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${pattern}`);
}

async function waitForSession(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const session = JSON.parse(await readFile(sessionPath, "utf8"));
      if (session.pid) return session;
    } catch {
      // Session metadata is written just after the server becomes ready.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for PlugDev session metadata");
}

async function stop() {
  await execa("node", [cli, "--json", "server", "stop"], {
    cwd: fixture,
    reject: false,
  });
}

console.log("PlugDev live-config smoke");
await stop();
await rm(liveConfig, { force: true });
await rm(logPath, { force: true });
await rm(sessionPath, { force: true });

const run = execa("node", [cli, "--quiet", "--port", port], {
  cwd: fixture,
  reject: false,
});
run.stdout?.pipe(process.stdout);
run.stderr?.pipe(process.stderr);

try {
  // Cold CI/worktree runs may need to download and remap Paper before first ready.
  await waitForLog(/Fixture config value: one/i, 0, 240_000);
  const beforeSession = await waitForSession();
  const beforeLog = await readFile(logPath, "utf8");

  const set = await execa(
    "node",
    [cli, "--json", "config", "set", "config.yml", "--key", "value", "--value", "two"],
    { cwd: fixture, reject: false },
  );
  if (set.exitCode !== 0) {
    throw new Error(`config set failed: ${set.stdout || set.stderr}`);
  }
  const after = await waitForLog(/Fixture config value: two/i, beforeLog.length, 60_000);
  if (!/\[PlugDev\] Reload complete/i.test(after.slice(beforeLog.length))) {
    throw new Error("Config changed but targeted reload marker was not found");
  }

  const afterSession = JSON.parse(await readFile(sessionPath, "utf8"));
  if (beforeSession.pid !== afterSession.pid) {
    throw new Error(`Server PID changed (${beforeSession.pid} -> ${afterSession.pid})`);
  }
  console.log("OK live config set via CLI applied through one targeted reload; server PID unchanged");
} catch (error) {
  console.error("FAIL live-config smoke:", error instanceof Error ? error.message : String(error));
  try {
    console.error((await readFile(logPath, "utf8")).slice(-3000));
  } catch {
    // No log available.
  }
  process.exitCode = 1;
} finally {
  // The plugin can enable a fraction before PlugDev writes session.json.
  // Give cleanup a brief chance to see it so the Java process is not orphaned.
  try {
    await waitForSession(10_000);
  } catch {
    // The run may have failed before a session could be created.
  }
  await stop();
  const exited = await Promise.race([
    run.then(() => true),
    sleep(10_000).then(() => false),
  ]);
  if (!exited) {
    run.kill("SIGTERM");
    await Promise.race([run, sleep(5_000)]);
  }
}
