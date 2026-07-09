import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAgentInstall } from "./agent.js";

describe("runAgentInstall", () => {
  it("writes cursor rule, CLAUDE.md, and AGENTS.md", async () => {
    const dir = join(tmpdir(), `plugdev-agent-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    try {
      const code = await runAgentInstall(dir, { all: true });
      assert.equal(code, 0);
      const rule = await readFile(join(dir, ".cursor", "rules", "plugdev.mdc"), "utf8");
      assert.match(rule, /plug run/);
      const claude = await readFile(join(dir, "CLAUDE.md"), "utf8");
      assert.match(claude, /## PlugDev/);
      const agents = await readFile(join(dir, "AGENTS.md"), "utf8");
      assert.match(agents, /plug run/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
