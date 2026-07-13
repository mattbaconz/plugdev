import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAgentInstall } from "./agent.js";

describe("runAgentInstall", () => {
  it("writes cursor rule, CLAUDE.md, AGENTS.md, and project skills", async () => {
    const dir = join(tmpdir(), `plugdev-agent-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    try {
      const code = await runAgentInstall(dir, { all: true });
      assert.equal(code, 0);
      const rule = await readFile(join(dir, ".cursor", "rules", "plugdev.mdc"), "utf8");
      assert.match(rule, /plug run/);
      assert.match(rule, /plug doctor/);
      assert.match(rule, /Folia/);
      assert.match(rule, /init --setup --agents --mcp/);
      const claude = await readFile(join(dir, "CLAUDE.md"), "utf8");
      assert.match(claude, /## PlugDev/);
      assert.match(claude, /plug doctor/);
      const agents = await readFile(join(dir, "AGENTS.md"), "utf8");
      assert.match(agents, /plug run/);
      assert.match(agents, /Folia/);
      const skill = await readFile(join(dir, ".agents", "skills", "plugdev", "SKILL.md"), "utf8");
      assert.match(skill, /name: plugdev/);
      const cursorSkill = await readFile(join(dir, ".cursor", "skills", "plugdev", "SKILL.md"), "utf8");
      assert.match(cursorSkill, /plug run/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes merge-safe MCP configs with --mcp", async () => {
    const dir = join(tmpdir(), `plugdev-agent-mcp-${Date.now()}`);
    await mkdir(join(dir, ".cursor"), { recursive: true });
    await writeFile(
      join(dir, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          other: { command: "echo" },
        },
      }),
      "utf8",
    );
    try {
      const code = await runAgentInstall(dir, { mcp: true });
      assert.equal(code, 0);
      const cursor = JSON.parse(await readFile(join(dir, ".cursor", "mcp.json"), "utf8")) as {
        mcpServers: Record<string, { command?: string; args?: string[] }>;
      };
      assert.equal(cursor.mcpServers.other?.command, "echo");
      assert.equal(cursor.mcpServers.plugdev?.command, "npx");
      assert.deepEqual(cursor.mcpServers.plugdev?.args, ["-y", "@plugdev/mcp"]);
      const claude = JSON.parse(await readFile(join(dir, ".mcp.json"), "utf8")) as {
        mcpServers: Record<string, unknown>;
      };
      assert.ok(claude.mcpServers.plugdev);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("skips existing plugdev MCP entry without --force", async () => {
    const dir = join(tmpdir(), `plugdev-agent-mcp-skip-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          plugdev: { command: "custom" },
        },
      }),
      "utf8",
    );
    try {
      await runAgentInstall(dir, { mcp: true });
      const claude = JSON.parse(await readFile(join(dir, ".mcp.json"), "utf8")) as {
        mcpServers: { plugdev: { command: string } };
      };
      assert.equal(claude.mcpServers.plugdev.command, "custom");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
