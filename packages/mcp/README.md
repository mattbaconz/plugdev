# @plugdev/mcp

MCP server for [PlugDev](https://pluglabs.app/plugdev). Agents drive the same plugin test loop as `plug run` (build, sync, server, RCON). Not an AI plugin generator.

## Config

```json
{
  "mcpServers": {
    "plugdev": {
      "command": "npx",
      "args": ["-y", "@plugdev/mcp@0.3.0"],
      "env": {
        "PLUGDEV_PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

Or: `plugdev agent install --mcp`

## Tools (0.3.0)

| Tool | Purpose |
|------|---------|
| `plugdev_init` / `plugdev_doctor` / `plugdev_setup` | Scaffold, check, prefetch |
| `plugdev_build_plugin` / `plugdev_sync_plugin` | Build + sync JAR |
| `plugdev_start_server` / `stop` / `status` / `logs` | Headless server |
| `plugdev_run_server_command` / `plugdev_op_player` | RCON |
| `plugdev_list_modules` / `plugdev_use_module` | Multi-module |
| `plugdev_list_deps` / `plugdev_add_dep` / `plugdev_remove_dep` | Test deps |
| `plugdev_agent_install` / `plugdev_cache_*` / `plugdev_clean` | Agents, cache, clean |
| `plugdev_run_test_loop` | Build → sync → start → OP |

Requires Node 20+ and `@plugdev/cli` (PATH, local build, or `npx`).

```bash
npx skills add mattbaconz/plugdev --skill plugdev
```
