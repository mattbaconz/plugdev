---
name: plugdev
description: >-
  Use when testing, booting, hot-reloading, or joining a local Minecraft Paper,
  Spigot, Folia, or Purpur plugin project — PlugDev CLI setup, plug run, plug
  doctor, multi-module pick, deps, headless server commands, Folia restart,
  agent wiring (Cursor/Claude/Codex), and optional MCP tools for structured control.
---

# PlugDev test loop

PlugDev is the local **test environment** for Minecraft plugins. Prefer it over manually starting Paper and copying JARs.

## First moves (agent: set up the best env)

When the user asks to test, run, or set up a Minecraft plugin project — or when you need a local Paper loop:

1. **Install CLI** if `plugdev` / `plug` is missing from PATH:
   ```powershell
   npm install -g @plugdev/cli
   ```
   Or one-shot: `npx @plugdev/cli@latest <command>`.

2. **Wire the project** if there is no `plugdev.yml` (or rules/MCP are missing):
   ```powershell
   plugdev init --setup --agents --mcp
   ```
   That writes config, prefetches server/client into `~/.plugdev/`, installs Cursor/Claude/Codex rules, project skill copies, and MCP configs (`.cursor/mcp.json`, `.mcp.json`).

3. If config exists but agent wiring does not:
   ```powershell
   plugdev agent install --all --mcp
   ```

4. **Boot the loop:**
   ```powershell
   plug run
   ```

5. If boot or detection fails, run `plug doctor` and fix what it reports (Java 21+, Node 20+, Gradle/Maven). Paper/Folia 26.x needs Java 25+.

6. Multi-module reactors: `plugdev module list` then `plugdev module use <name>` (or TUI Module).

## Day loop

| Goal | Command |
|------|--------|
| Interactive TUI | `plugdev` / `plug` |
| One-shot test loop | `plug run` |
| Wipe worlds | `plug clean` |
| Cold run folder | `plug clean --all` |
| Multi-module pick | `plugdev module list|use` |
| Test deps | `plugdev deps add|remove|list` |
| Headless (agents) | `plugdev server start|stop|status|command|logs` |
| Scripting | add `--json` |

After the server is ready, joining players are **auto-OP** when `dev.op` is true (default). Type console commands in the **same terminal** (RCON), e.g. `list`, `gamemode creative @a`.

## MCP (optional structured tools)

When `.cursor/mcp.json` or `.mcp.json` includes PlugDev (via `init --mcp` / `agent install --mcp`), prefer MCP tools for headless control:

- `plugdev_doctor`, `plugdev_setup`, `plugdev_init`
- `plugdev_build_plugin`, `plugdev_sync_plugin`
- `plugdev_start_server`, `plugdev_stop_server`, `plugdev_get_server_status`
- `plugdev_tail_logs`, `plugdev_run_server_command`, `plugdev_op_player`
- `plugdev_list_modules`, `plugdev_use_module`
- `plugdev_list_deps`, `plugdev_add_dep`, `plugdev_remove_dep`
- `plugdev_agent_install`, `plugdev_cache_prefetch`, `plugdev_cache_status`, `plugdev_clean`
- `plugdev_run_test_loop` — build → sync → start → OP

CLI remains primary for interactive `plug run` (server + watch + client join). MCP is the same loop without a TTY.

Install MCP alone: `npx -y @plugdev/mcp` (stdio).

## Hard rules

- Prefer `plug run` over manually starting Paper.
- Do **not** use Bukkit `/reload` — PlugDev uses safe JAR reload via bootstrap.
- On **Folia**, prefer full restart over safe reload.
- Optional `--hotswap` / `watch.reload.java: hotswap` is method-body JDWP redefine only; structural changes fall back to safe reload.
- Do not delete `~/.plugdev` unless the user asks (`plugdev cache clear`).

## Facts

| Item | Value |
|------|--------|
| Bins | `plug` and `plugdev` (same CLI) |
| Config | `plugdev.yml` |
| Run dir | `.plugdev/run/` |
| Cache | `~/.plugdev/` |
| Modules | `plugdev module list|use` (multi-module Maven/Gradle) |
| Deps | `plugdev deps add|remove|list` (+ TUI Dependencies) |
| Reload | Safe JAR reload (not `/reload`); optional `--hotswap` for method bodies |
| Folia | Prefer full restart over safe reload |
| Headless | `plugdev server start|stop|status|command|logs` + `--json` |
| MCP | `npx @plugdev/mcp` — structured tools for the same loop |
| Skill install | `npx skills add mattbaconz/plugdev --skill plugdev` |
| Docs | https://pluglabs.app/plugdev |
