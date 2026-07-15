/**
 * Canonical PlugDev agent guidance — single source for Cursor / Claude / Codex / bundled skill.
 */

export const AGENT_FACTS = {
  bins: "`plug` and `plugdev` (same CLI)",
  config: "`plugdev.yml`",
  runDir: "`.plugdev/run/`",
  cache: "`~/.plugdev/`",
  reload: "Safe JAR reload (not `/reload`); optional `--hotswap` for method bodies",
  folia: "Prefer full restart over safe reload",
  headless: "`plugdev server start|stop|status|command|logs` + `--json`",
  modules: "`plugdev module list|use` (multi-module Maven/Gradle)",
  deps: "`plugdev deps add|remove|list` (+ TUI Dependencies)",
  mcp: "`npx @plugdev/mcp` — structured tools for the same loop",
  skillInstall: "`npx skills add mattbaconz/plugdev --skill plugdev`",
  docs: "https://pluglabs.app/plugdev",
} as const;

export const AGENT_COMMANDS = [
  { goal: "Interactive TUI", command: "`plugdev` / `plug`" },
  { goal: "One-shot test loop", command: "`plug run`" },
  { goal: "Wipe worlds", command: "`plug clean`" },
  { goal: "Cold run folder", command: "`plug clean --all`" },
  { goal: "Multi-module pick", command: "`plugdev module list|use`" },
  { goal: "Test deps", command: "`plugdev deps add|remove|list`" },
  { goal: "Headless (agents)", command: "`plugdev server start|stop|status|command|logs`" },
  { goal: "Scripting", command: "add `--json`" },
] as const;

export const MCP_TOOLS = [
  "plugdev_doctor",
  "plugdev_setup",
  "plugdev_init",
  "plugdev_build_plugin",
  "plugdev_sync_plugin",
  "plugdev_start_server",
  "plugdev_stop_server",
  "plugdev_get_server_status",
  "plugdev_tail_logs",
  "plugdev_run_server_command",
  "plugdev_op_player",
  "plugdev_run_test_loop",
  "plugdev_list_modules",
  "plugdev_use_module",
  "plugdev_list_deps",
  "plugdev_add_dep",
  "plugdev_remove_dep",
  "plugdev_agent_install",
  "plugdev_cache_prefetch",
  "plugdev_cache_status",
  "plugdev_clean",
] as const;

export const HARD_RULES = [
  "Prefer `plug run` over manually starting Paper.",
  "Do **not** use Bukkit `/reload` — PlugDev uses safe JAR reload via bootstrap.",
  "On **Folia**, prefer full restart over safe reload.",
  "Optional `--hotswap` / `watch.reload.java: hotswap` is method-body JDWP redefine only; structural changes fall back to safe reload.",
  "Do not delete `~/.plugdev` unless the user asks (`plugdev cache clear`).",
  "Do not treat PlugDev as an AI plugin generator.",
] as const;

const SETUP_BLOCK = `\`\`\`powershell
npm install -g @plugdev/cli
plugdev init --setup --agents --mcp
plug run
\`\`\``;

function mcpToolsBullets(): string {
  return [
    "- `plugdev_doctor`, `plugdev_setup`, `plugdev_init`",
    "- `plugdev_build_plugin`, `plugdev_sync_plugin`",
    "- `plugdev_start_server`, `plugdev_stop_server`, `plugdev_get_server_status`",
    "- `plugdev_tail_logs`, `plugdev_run_server_command`, `plugdev_op_player`",
    "- `plugdev_list_modules`, `plugdev_use_module`",
    "- `plugdev_list_deps`, `plugdev_add_dep`, `plugdev_remove_dep`",
    "- `plugdev_agent_install`, `plugdev_cache_prefetch`, `plugdev_cache_status`, `plugdev_clean`",
    "- `plugdev_run_test_loop` — build → sync → start → OP",
  ].join("\n");
}

function dayLoopTable(): string {
  const rows = AGENT_COMMANDS.map((c) => `| ${c.goal} | ${c.command} |`).join("\n");
  return `| Goal | Command |\n|------|--------|\n${rows}`;
}

function factsTable(): string {
  return `| Item | Value |
|------|--------|
| Bins | ${AGENT_FACTS.bins} |
| Config | ${AGENT_FACTS.config} |
| Run dir | ${AGENT_FACTS.runDir} |
| Cache | ${AGENT_FACTS.cache} |
| Modules | ${AGENT_FACTS.modules} |
| Deps | ${AGENT_FACTS.deps} |
| Reload | ${AGENT_FACTS.reload} |
| Folia | ${AGENT_FACTS.folia} |
| Headless | ${AGENT_FACTS.headless} |
| MCP | ${AGENT_FACTS.mcp} |
| Skill install | ${AGENT_FACTS.skillInstall} |
| Docs | ${AGENT_FACTS.docs} |`;
}

/** Cursor `.cursor/rules/plugdev.mdc` body (includes frontmatter). */
export function renderCursorRule(): string {
  return `---
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
- \`plugdev module list|use\` — multi-module Maven/Gradle reactor pick
- \`plugdev deps add|remove|list\` — modular test plugins (TUI: Dependencies)
- Headless: \`plugdev server start|stop|status|command|logs\` (agents; pair with \`--json\` when scripting)
- After server ready: players are auto-OP on join when \`dev.op\` is true (default). Type console commands in the same terminal (RCON), e.g. \`list\`, \`gamemode creative @a\`
- If MCP is configured (\`.cursor/mcp.json\`), prefer \`plugdev_*\` MCP tools for headless control

## Install

${SETUP_BLOCK}

## Config

- \`plugdev.yml\` at project root
- Multi-module: set \`build.module\` via \`plugdev module use\` or TUI Module picker
- Default deps: Via* + project-detected soft-depends (expand with \`plugdev deps add\`)
- Global cache: \`~/.plugdev/\` (never auto-deleted)
- Project run dir: \`.plugdev/run/\` (kept by default for fast restarts)

## Do not

${HARD_RULES.map((r) => `- ${r}`).join("\n")}
`;
}

/** Claude Code `CLAUDE.md` PlugDev section. */
export function renderClaudeSnippet(): string {
  return `## PlugDev

This project uses [PlugDev](https://github.com/mattbaconz/plugdev) for the Minecraft plugin test loop.

- Prefer \`plug run\` over manually starting Paper
- Run: \`plug run\` (or \`plugdev run\`) after \`npm i -g @plugdev/cli\` and \`plugdev init --setup --agents --mcp\`
- Doctor: \`plug doctor\` when detection or boot fails
- Console: type server commands in the PlugDev terminal after ready (RCON)
- Clean: \`plug clean\` / \`plug clean --all\`
- Modules: \`plugdev module list|use\` (multi-module reactors)
- Deps: \`plugdev deps add|remove|list\` (TUI Dependencies screen)
- Headless: \`plugdev server start|stop|status|command|logs\`
- If MCP is configured (\`.mcp.json\`), prefer \`plugdev_*\` tools for headless control
- Optional hotswap (\`--hotswap\`): method bodies only; falls back to safe reload

Do not use Bukkit \`/reload\`. On Folia, prefer full restart over safe reload.
`;
}

/** Codex / AGENTS.md project snippet. */
export function renderCodexAgents(): string {
  return `# AGENTS — PlugDev project

This is a Minecraft Paper plugin developed with PlugDev. Prefer \`plug run\` over manually starting Paper.

## Loop

1. \`npm install -g @plugdev/cli\` (once)
2. \`plugdev init --setup --agents --mcp\` (once per project)
3. \`plug run\` — server + watch + client
4. Players are auto-OP on join when \`dev.op\` is true (default). Type console commands in the same terminal after ready (\`list\`, \`gamemode creative @a\`, …)
5. \`plug doctor\` if boot or detection fails
6. Multi-module: \`plugdev module list\` / \`plugdev module use <name>\`
7. Deps: \`plugdev deps add|remove|list\` (or TUI Dependencies)
8. \`plug clean\` when you need a fresh world; \`plug clean --all\` for a cold \`.plugdev/run\`

## Facts

${factsTable()}

Optional MCP: \`plugdev agent install --mcp\` writes \`.cursor/mcp.json\` and \`.mcp.json\`. Prefer MCP tools for headless control when configured; otherwise use CLI \`--json\`.
`;
}

/** Portable skill SKILL.md body (with YAML frontmatter). */
export function renderSkillMd(): string {
  return `---
name: plugdev
description: >-
  Use when testing, booting, hot-reloading, or joining a local Minecraft Paper,
  Spigot, Folia, or Purpur plugin project — PlugDev CLI setup, plug run, plug
  doctor, multi-module pick, deps, headless server commands, Folia restart,
  agent wiring (Cursor/Claude/Codex), and optional MCP tools for structured control.
---

# PlugDev test loop

PlugDev is the local **test environment** for Minecraft plugins (not an AI plugin generator). Prefer it over manually starting Paper and copying JARs.

## First moves (agent: set up the best env)

When the user asks to test, run, or set up a Minecraft plugin project — or when you need a local Paper loop:

1. **Install CLI** if \`plugdev\` / \`plug\` is missing from PATH:
   \`\`\`powershell
   npm install -g @plugdev/cli
   \`\`\`
   Or one-shot: \`npx @plugdev/cli@latest <command>\`.

2. **Wire the project** if there is no \`plugdev.yml\` (or rules/MCP are missing):
   \`\`\`powershell
   plugdev init --setup --agents --mcp
   \`\`\`
   That writes config, prefetches server/client into \`~/.plugdev/\`, installs Cursor/Claude/Codex rules, project skill copies, and MCP configs (\`.cursor/mcp.json\`, \`.mcp.json\`).

3. If config exists but agent wiring does not:
   \`\`\`powershell
   plugdev agent install --all --mcp
   \`\`\`

4. **Boot the loop:**
   \`\`\`powershell
   plug run
   \`\`\`

5. If boot or detection fails, run \`plug doctor\` and fix what it reports (Java 21+, Node 20+, Gradle/Maven). Paper/Folia 26.x needs Java 25+.

6. Multi-module reactors: \`plugdev module list\` then \`plugdev module use <name>\` (or TUI Module).

## Day loop

${dayLoopTable()}

After the server is ready, joining players are **auto-OP** when \`dev.op\` is true (default). Type console commands in the **same terminal** (RCON), e.g. \`list\`, \`gamemode creative @a\`.

## MCP (optional structured tools)

When \`.cursor/mcp.json\` or \`.mcp.json\` includes PlugDev (via \`init --mcp\` / \`agent install --mcp\`), prefer MCP tools for headless control:

${mcpToolsBullets()}

CLI remains primary for interactive \`plug run\` (server + watch + client join). MCP is the same loop without a TTY — not an AI plugin generator.

Install MCP alone: \`npx -y @plugdev/mcp\` (stdio).

## Hard rules

${HARD_RULES.map((r) => `- ${r}`).join("\n")}

## Facts

${factsTable()}
`;
}

/** Portable skill AGENTS.md companion. */
export function renderSkillAgentsMd(): string {
  return `# PlugDev — agent entry

This skill teaches coding agents to set up and drive [PlugDev](https://pluglabs.app/plugdev), the local Minecraft plugin test environment.

## Install this skill

\`\`\`bash
npx skills add mattbaconz/plugdev --skill plugdev
\`\`\`

## Canonical setup (best env)

${SETUP_BLOCK}

## Prefer

- \`plug run\` over manually starting Paper and copying JARs
- \`plug doctor\` when detection or boot fails
- \`plugdev module list|use\` on multi-module Maven/Gradle reactors
- \`plugdev deps add|remove|list\` / TUI Dependencies for test plugins
- MCP tools (\`plugdev_*\`) for headless server control when MCP is configured
- Safe JAR reload — never Bukkit \`/reload\`
- Full restart on Folia

## Do not

- Treat PlugDev as an AI plugin generator
- Delete \`~/.plugdev\` unless the user asks

See [SKILL.md](./SKILL.md) and [references/mcp.md](./references/mcp.md).
`;
}
