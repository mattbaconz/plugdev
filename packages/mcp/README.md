# @plugdev/mcp

MCP server for [PlugDev](https://pluglabs.app/plugdev) — structured tools so agents can drive the same Minecraft plugin test loop as `plug run` (not an AI plugin generator).

## Install / config

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

Or from a plugin project:

```powershell
plugdev agent install --mcp
```

## Tools

| Tool | Purpose |
|------|---------|
| `plugdev_init` | `init --setup --agents` |
| `plugdev_doctor` | Toolchain + cache |
| `plugdev_setup` | Prefetch server/client |
| `plugdev_build_plugin` / `plugdev_sync_plugin` | Build + sync JAR |
| `plugdev_start_server` / `stop` / `status` / `logs` | Headless server |
| `plugdev_run_server_command` / `plugdev_op_player` | RCON |
| `plugdev_run_test_loop` | One-shot build → start → OP |

Requires Node 20+. Resolves `@plugdev/cli` via local monorepo build, `plugdev` on PATH, or `npx -y @plugdev/cli`.

## Skill

```bash
npx skills add mattbaconz/plugdev --skill plugdev
```
