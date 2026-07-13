/** Bundled portable skill — keep in sync with skills/plugdev/SKILL.md */

export const SKILL_MD = `---
name: plugdev
description: >-
  Use when testing, booting, hot-reloading, or joining a local Minecraft Paper,
  Spigot, Folia, or Purpur plugin project — PlugDev CLI setup, plug run, plug
  doctor, headless server commands, Folia restart, agent wiring (Cursor/Claude/Codex),
  and optional MCP tools for structured control of the same loop.
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

## Day loop

| Goal | Command |
|------|---------|
| Interactive TUI | \`plugdev\` / \`plug\` |
| One-shot test loop | \`plug run\` |
| Wipe worlds | \`plug clean\` |
| Cold run folder | \`plug clean --all\` |
| Test deps | \`plugdev deps add\\|remove\\|list\` |
| Headless (agents) | \`plugdev server start\\|stop\\|status\\|command\\|logs\` |
| Scripting | add \`--json\` |

After the server is ready, type console commands in the **same terminal** (RCON), e.g. \`op DevPlayer\`, \`list\`.

## MCP (optional structured tools)

When \`.cursor/mcp.json\` or \`.mcp.json\` includes PlugDev (via \`init --mcp\` / \`agent install --mcp\`), prefer MCP tools for headless control:

- \`plugdev_doctor\`, \`plugdev_setup\`, \`plugdev_init\`
- \`plugdev_build_plugin\`, \`plugdev_sync_plugin\`
- \`plugdev_start_server\`, \`plugdev_stop_server\`, \`plugdev_get_server_status\`
- \`plugdev_tail_logs\`, \`plugdev_run_server_command\`, \`plugdev_op_player\`
- \`plugdev_run_test_loop\` — build → sync → start → OP

CLI remains primary for interactive \`plug run\` (server + watch + client join). MCP is the same loop without a TTY — not an AI plugin generator.

Install MCP alone: \`npx -y @plugdev/mcp\` (stdio).

## Hard rules

- Prefer \`plug run\` over manually starting Paper.
- Do **not** use Bukkit \`/reload\` — PlugDev uses safe JAR reload via bootstrap.
- On **Folia**, prefer full restart over safe reload.
- Do not delete \`~/.plugdev\` unless the user asks (\`plugdev cache clear\`).

## Facts

| Item | Value |
|------|--------|
| Bins | \`plug\` and \`plugdev\` (same CLI) |
| Config | \`plugdev.yml\` |
| Run dir | \`.plugdev/run/\` |
| Cache | \`~/.plugdev/\` |
| Skill install | \`npx skills add mattbaconz/plugdev --skill plugdev\` |
| Docs | https://pluglabs.app/plugdev |
`;

export const SKILL_AGENTS_MD = `# PlugDev — agent entry

This skill teaches coding agents to set up and drive [PlugDev](https://pluglabs.app/plugdev), the local Minecraft plugin test environment.

## Install this skill

\`\`\`bash
npx skills add mattbaconz/plugdev --skill plugdev
\`\`\`

## Canonical setup (best env)

\`\`\`powershell
npm install -g @plugdev/cli
plugdev init --setup --agents --mcp
plug run
\`\`\`

## Prefer

- \`plug run\` over manually starting Paper and copying JARs
- \`plug doctor\` when detection or boot fails
- MCP tools (\`plugdev_*\`) for headless server control when MCP is configured
- Safe JAR reload — never Bukkit \`/reload\`
- Full restart on Folia

## Do not

- Treat PlugDev as an AI plugin generator
- Delete \`~/.plugdev\` unless the user asks
`;
