# PlugDev MCP

Structured tools for agents that control the same loop as `plugdev run` — without treating PlugDev as an AI plugin generator.

## When to use MCP vs CLI

| Situation | Use |
|-----------|-----|
| Interactive TUI, watch + client join | CLI: `plug run` |
| First-time project wiring | CLI: `plugdev init --setup --agents --mcp` |
| Headless build / start / RCON / logs | MCP tools (if configured) |
| MCP not installed | CLI: `plugdev server … --json` |

## Enable MCP in a project

```powershell
plugdev agent install --mcp
# or
plugdev init --setup --agents --mcp
```

Writes:

- `.cursor/mcp.json` (Cursor)
- `.mcp.json` (Claude Code)

Manual config:

```json
{
  "mcpServers": {
    "plugdev": {
      "command": "npx",
      "args": ["-y", "@plugdev/mcp"],
      "env": {
        "PLUGDEV_PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

## Tool catalog

| Tool | Purpose |
|------|---------|
| `plugdev_init` | `init --setup --agents` (scaffold + prefetch + rules) |
| `plugdev_doctor` | Toolchain + cache readiness |
| `plugdev_setup` | Prefetch Paper/client/deps |
| `plugdev_build_plugin` | Gradle/Maven build |
| `plugdev_sync_plugin` | Build + sync JAR to run folder |
| `plugdev_start_server` | Headless server start |
| `plugdev_stop_server` | Stop server |
| `plugdev_get_server_status` | Running? port? |
| `plugdev_tail_logs` | Recent log lines |
| `plugdev_run_server_command` | RCON console command |
| `plugdev_op_player` | `op <name>` |
| `plugdev_run_test_loop` | doctor → setup → build → sync → start → OP |

## Cursor plugin

The PlugDev Cursor plugin bundles this skill + MCP. Local test: copy/symlink the repo into `~/.cursor/plugins/local/plugdev`. Marketplace: submit at https://cursor.com/marketplace/publish.

## Positioning

Say: “agents control the Minecraft test environment through MCP.”  
Do not say: “PlugDev generates plugins with AI.”
