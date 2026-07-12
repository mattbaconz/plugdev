---
name: plugdev
description: >-
  Use when testing, booting, hot-reloading, or joining a local Minecraft Paper/Spigot
  plugin project — PlugDev CLI setup, plug run, plug doctor, headless server commands,
  Folia restart, and agent wiring (Cursor/Claude/Codex).
---

# PlugDev test loop

PlugDev is the local **test environment** for Minecraft plugins (not an AI plugin generator). Prefer it over manually starting Paper and copying JARs.

## First moves

1. Check PATH for `plugdev` or `plug`. If missing:
   ```powershell
   npm install -g @plugdev/cli
   ```
2. If the project has no `plugdev.yml`:
   ```powershell
   plugdev init --setup --agents
   ```
   That writes config, prefetches server/client into `~/.plugdev/`, and installs agent rules.
3. Boot the loop:
   ```powershell
   plug run
   ```
4. If boot or detection fails, run `plug doctor` and fix what it reports (Java 21+, Node 20+, Gradle/Maven).

## Day loop

| Goal | Command |
|------|---------|
| Interactive TUI | `plugdev` / `plug` |
| One-shot test loop | `plug run` |
| Wipe worlds | `plug clean` |
| Cold run folder | `plug clean --all` |
| Test deps | `plugdev deps add\|remove\|list` |
| Headless (agents) | `plugdev server start\|stop\|status\|command\|logs` |
| Scripting | add `--json` |

After the server is ready, type console commands in the **same terminal** (RCON), e.g. `op DevPlayer`, `list`.

## Hard rules

- Prefer `plug run` over manually starting Paper.
- Do **not** use Bukkit `/reload` — PlugDev uses safe JAR reload via bootstrap.
- On **Folia**, prefer full restart over safe reload.
- Do not delete `~/.plugdev` unless the user asks (`plugdev cache clear`).
- MCP (`npx @plugdev/mcp`) is experimental — do not treat it as the primary setup path.

## Agent wiring only

If config already exists but rules do not:

```powershell
plugdev agent install --all
```

Writes `.cursor/rules/plugdev.mdc`, a `CLAUDE.md` section, and `AGENTS.md`.

## Facts

| Item | Value |
|------|--------|
| Bins | `plug` and `plugdev` (same CLI) |
| Config | `plugdev.yml` |
| Run dir | `.plugdev/run/` |
| Cache | `~/.plugdev/` |
| Docs | https://pluglabs.app/plugdev |
