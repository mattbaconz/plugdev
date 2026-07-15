# PlugDev MCP

Structured tools for headless control of the same loop as `plugdev run`.

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
| `plugdev_list_modules` | List Maven/Gradle reactor modules |
| `plugdev_use_module` | Set `build.module` in plugdev.yml |
| `plugdev_list_deps` | Configured deps + presets |
| `plugdev_add_dep` | Add Hangar/Modrinth/URL dep |
| `plugdev_remove_dep` | Remove dep JAR + yml entry |
| `plugdev_agent_install` | Write Cursor/Claude/Codex rules (+ MCP) |
| `plugdev_cache_prefetch` | Warm server/client cache |
| `plugdev_cache_status` | Cache sizes under `~/.plugdev` |
| `plugdev_clean` | Wipe worlds or `.plugdev/run` |
