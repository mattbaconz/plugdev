import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { constants } from "node:fs";
import { heading, success, info, warn } from "../util/log.js";
import { isJsonMode, emitJson } from "../util/output.js";
import { SKILL_MD, SKILL_AGENTS_MD } from "../bundled-skill.js";

export type AgentTarget = "cursor" | "claude" | "codex";

const PLUGDEV_MCP_SERVER = {
  command: "npx",
  args: ["-y", "@plugdev/mcp"],
  env: {
    PLUGDEV_PROJECT_ROOT: "${workspaceFolder}",
  },
};

const CURSOR_RULE = `---
description: PlugDev Minecraft plugin test loop
globs:
alwaysApply: true
---

# PlugDev

Use the PlugDev CLI for Paper plugin test loops in this project. Prefer \`plug run\` over manually starting Paper.

## Commands

- \`plug run\` or \`plugdev run\` — boot Paper, watch \`src/\`, auto-join client
- \`plug doctor\` — check Java/Node detection and project toolchain when boot fails
- \`plug clean\` / \`plug clean --all\` — wipe worlds or \`.plugdev/run\`
- \`plugdev deps add|remove|list\` — modular test plugins
- Headless: \`plugdev server start|stop|status|command|logs\` (agents; pair with \`--json\` when scripting)
- After server ready: type console commands in the same terminal (RCON), e.g. \`op DevPlayer\`, \`list\`
- If MCP is configured (\`.cursor/mcp.json\`), prefer \`plugdev_*\` MCP tools for headless control

## Install

\`\`\`powershell
npm install -g @plugdev/cli
plugdev init --setup --agents --mcp
plug run
\`\`\`

## Config

- \`plugdev.yml\` at project root
- Default deps: Via*, VaultUnlocked, EssentialsX, MineConomy (remove with \`plugdev deps remove <name>\`)
- Global cache: \`~/.plugdev/\` (never auto-deleted)
- Project run dir: \`.plugdev/run/\` (kept by default for fast restarts)

## Do not

- Do not use Bukkit \`/reload\` — PlugDev uses safe JAR reload via bootstrap
- On Folia, prefer full restart over safe reload (\`server: folia\` in \`plugdev.yml\`)
- Optional \`--hotswap\` / \`watch.reload.java: hotswap\` is method-body JDWP redefine only; structural changes fall back to safe reload
- Do not delete \`~/.plugdev\` unless the user asks (\`plugdev cache clear\`)
`;

const CLAUDE_SNIPPET = `## PlugDev

This project uses [PlugDev](https://github.com/mattbaconz/plugdev) for the Minecraft plugin test loop.

- Prefer \`plug run\` over manually starting Paper
- Run: \`plug run\` (or \`plugdev run\`) after \`npm i -g @plugdev/cli\` and \`plugdev init --setup --agents --mcp\`
- Doctor: \`plug doctor\` when detection or boot fails
- Console: type server commands in the PlugDev terminal after ready (RCON)
- Clean: \`plug clean\` / \`plug clean --all\`
- Deps: \`plugdev deps add|remove|list\` (defaults include Via*, VaultUnlocked, EssentialsX, MineConomy)
- Headless: \`plugdev server start|stop|status|command|logs\`
- If MCP is configured (\`.mcp.json\`), prefer \`plugdev_*\` tools for headless control
- Optional hotswap (\`--hotswap\`): method bodies only; falls back to safe reload

Do not use Bukkit \`/reload\`. On Folia, prefer full restart over safe reload.
`;

const CODEX_AGENTS = `# AGENTS — PlugDev project

This is a Minecraft Paper plugin developed with PlugDev. Prefer \`plug run\` over manually starting Paper.

## Loop

1. \`npm install -g @plugdev/cli\` (once)
2. \`plugdev init --setup --agents --mcp\` (once per project)
3. \`plug run\` — server + watch + client
4. Type console commands in the same terminal after ready (\`op DevPlayer\`, \`list\`, …)
5. \`plug doctor\` if boot or detection fails
6. \`plug clean\` when you need a fresh world; \`plug clean --all\` for a cold \`.plugdev/run\`

## Facts

| Item | Value |
|------|--------|
| Bins | \`plug\` and \`plugdev\` (same CLI) |
| Config | \`plugdev.yml\` |
| Run dir | \`.plugdev/run/\` |
| Cache | \`~/.plugdev/\` |
| Reload | Safe JAR reload (not \`/reload\`); optional \`--hotswap\` for method bodies |
| Folia | Prefer full restart over safe reload |
| Headless | \`plugdev server start|stop|status|command|logs\` + \`--json\` |
| MCP | Optional structured tools via \`npx @plugdev/mcp\` — same loop for agents |

Optional MCP: \`plugdev agent install --mcp\` writes \`.cursor/mcp.json\` and \`.mcp.json\`. Prefer MCP tools for headless control when configured; otherwise use CLI \`--json\`.
`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeCursor(cwd: string, force: boolean): Promise<string> {
  const dir = join(cwd, ".cursor", "rules");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "plugdev.mdc");
  if ((await exists(path)) && !force) {
    warn(`Skip existing ${path} (use --force)`);
    return path;
  }
  await writeFile(path, CURSOR_RULE, "utf8");
  return path;
}

async function writeClaude(cwd: string, force: boolean): Promise<string> {
  const path = join(cwd, "CLAUDE.md");
  if (await exists(path)) {
    const existing = await readFile(path, "utf8");
    if (existing.includes("## PlugDev")) {
      if (!force) {
        warn(`Skip existing PlugDev section in ${path} (use --force)`);
        return path;
      }
      const stripped = existing.replace(/\n## PlugDev\n[\s\S]*?(?=\n## |\n# |$)/, "\n");
      await writeFile(path, `${stripped.trimEnd()}\n\n${CLAUDE_SNIPPET}`, "utf8");
      return path;
    }
    await writeFile(path, `${existing.trimEnd()}\n\n${CLAUDE_SNIPPET}`, "utf8");
    return path;
  }
  await writeFile(path, `# Project\n\n${CLAUDE_SNIPPET}`, "utf8");
  return path;
}

async function writeCodex(cwd: string, force: boolean): Promise<string> {
  const path = join(cwd, "AGENTS.md");
  if ((await exists(path)) && !force) {
    const existing = await readFile(path, "utf8");
    if (existing.includes("PlugDev")) {
      warn(`Skip existing ${path} (use --force)`);
      return path;
    }
    await writeFile(path, `${existing.trimEnd()}\n\n${CODEX_AGENTS}`, "utf8");
    return path;
  }
  await writeFile(path, CODEX_AGENTS, "utf8");
  return path;
}

type McpConfigFile = {
  mcpServers?: Record<string, unknown>;
};

async function mergeMcpConfig(path: string, force: boolean): Promise<{ path: string; skipped: boolean }> {
  let existing: McpConfigFile = {};
  if (await exists(path)) {
    try {
      existing = JSON.parse(await readFile(path, "utf8")) as McpConfigFile;
    } catch {
      if (!force) {
        warn(`Skip invalid JSON at ${path} (use --force to overwrite)`);
        return { path, skipped: true };
      }
      existing = {};
    }
  }

  const servers = { ...(existing.mcpServers ?? {}) };
  if (servers.plugdev && !force) {
    warn(`Skip existing plugdev MCP entry in ${path} (use --force)`);
    return { path, skipped: true };
  }

  servers.plugdev = { ...PLUGDEV_MCP_SERVER };
  const next: McpConfigFile = { ...existing, mcpServers: servers };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { path, skipped: false };
}

async function writeMcpConfigs(cwd: string, force: boolean): Promise<string[]> {
  const written: string[] = [];
  const cursor = await mergeMcpConfig(join(cwd, ".cursor", "mcp.json"), force);
  if (!cursor.skipped) written.push(cursor.path);
  const claude = await mergeMcpConfig(join(cwd, ".mcp.json"), force);
  if (!claude.skipped) written.push(claude.path);
  return written;
}

async function writeProjectSkills(cwd: string, force: boolean): Promise<string[]> {
  const written: string[] = [];
  const targets = [
    join(cwd, ".agents", "skills", "plugdev"),
    join(cwd, ".cursor", "skills", "plugdev"),
  ];

  for (const dir of targets) {
    const skillPath = join(dir, "SKILL.md");
    const agentsPath = join(dir, "AGENTS.md");
    if ((await exists(skillPath)) && !force) {
      warn(`Skip existing ${skillPath} (use --force)`);
      continue;
    }
    await mkdir(dir, { recursive: true });
    await writeFile(skillPath, SKILL_MD, "utf8");
    await writeFile(agentsPath, SKILL_AGENTS_MD, "utf8");
    written.push(skillPath);
  }
  return written;
}

export async function runAgentInstall(
  cwd: string,
  opts: {
    cursor?: boolean;
    claude?: boolean;
    codex?: boolean;
    all?: boolean;
    mcp?: boolean;
    force?: boolean;
    /** Skip heading/JSON when called from init */
    silent?: boolean;
  },
): Promise<number> {
  const mcpOnly =
    opts.mcp === true && !opts.all && !opts.cursor && !opts.claude && !opts.codex;
  const all = opts.all === true || (!opts.cursor && !opts.claude && !opts.codex && !opts.mcp);
  const targets: AgentTarget[] = [];
  if (!mcpOnly) {
    if (all || opts.cursor) targets.push("cursor");
    if (all || opts.claude) targets.push("claude");
    if (all || opts.codex) targets.push("codex");
  }

  const written: string[] = [];
  for (const t of targets) {
    if (t === "cursor") written.push(await writeCursor(cwd, opts.force === true));
    if (t === "claude") written.push(await writeClaude(cwd, opts.force === true));
    if (t === "codex") written.push(await writeCodex(cwd, opts.force === true));
  }

  // Copy portable skill into project when installing agent targets
  if (targets.length > 0) {
    written.push(...(await writeProjectSkills(cwd, opts.force === true)));
  }

  if (opts.mcp === true) {
    written.push(...(await writeMcpConfigs(cwd, opts.force === true)));
  }

  if (opts.silent) {
    return 0;
  }

  if (isJsonMode()) {
    emitJson({ ok: true, data: { targets, mcp: opts.mcp === true, written } });
    return 0;
  }

  heading("PlugDev agent install\n");
  for (const p of written) success(p);
  if (opts.mcp !== true) {
    info("Optional MCP: plugdev agent install --mcp");
  }
  return 0;
}
