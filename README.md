<div align="center">

<img src="brand/plugdev-logo.png" alt="PlugDev" width="128" />

# PlugDev · v0.10.0

---

**Test Minecraft plugins and mods in one command.**

Paper-family plugins get a real server, client join, and reload on save. Fabric / NeoForge / Quilt / Forge mods hand off to Gradle `runClient`. Discord bots are experimental.

**[Watch the demo](https://www.youtube.com/watch?v=IFrxqWrVrLY)** · [pluglabs.app/plugdev](https://pluglabs.app/plugdev)

[![npm](https://img.shields.io/npm/v/@plugdev/cli.svg)](https://www.npmjs.com/package/@plugdev/cli)
[![license](https://img.shields.io/npm/l/@plugdev/cli.svg)](https://github.com/mattbaconz/plugdev/blob/main/LICENSE)
[![release](https://img.shields.io/github/v/release/mattbaconz/plugdev?display_name=tag&label=release)](https://github.com/mattbaconz/plugdev/releases)
[![site](https://img.shields.io/badge/site-pluglabs.app%2Fplugdev-0ea5e9)](https://pluglabs.app/plugdev)

</div>

## Why

```text
Before: build → copy JAR → restart → open launcher → join
After:  plugdev / plug run
```

Same idea as `npm run dev`, for Minecraft plugin and mod projects.

## Quick start

### Plugin (Paper / Folia / Purpur / …)

```powershell
npm install -g @plugdev/cli
cd your-plugin
plugdev init --setup --agents
plugdev          # TUI
# or: plug run
```

### Mod (Fabric / NeoForge / Quilt / Forge)

```powershell
cd your-mod
plugdev init --setup --agents
plugdev run          # → Gradle runClient
# plugdev --loader neoforge
# plugdev --server
```

`plug` and `plugdev` are the same CLI.

`--agents` writes Cursor / Claude / Codex project rules. Skip it for a human-only loop.

| Prefer… | Same as |
|---------|---------|
| `plug` / `plugdev` | Interactive TUI (TTY) |
| `plug run` | `plugdev run` |
| `plug setup` | `plugdev setup` |
| `plug doctor` | `plugdev doctor` |
| `plug clean` | `plugdev clean` |

**Without a global install:** `npx @plugdev/cli@latest init --setup --agents` then `npx @plugdev/cli@latest` or `… run`.

### What happens (plugins)

Paper + Via* cache under `~/.plugdev/`. Project server in `.plugdev/run/`. Embedded client joins `localhost:25565`. Edit `src/` → save → safe reload (or optional hotswap; see below).

First boot remaps plugins (~10–30s). Later boots are faster. **Ctrl+C** stops the server; closing Minecraft does not.

### What happens (mods)

PlugDev detects the loader and runs Gradle (`runClient` by default). No Paper cache, no plugin safe-reload. Java changes usually need a client restart (or IDE/debug hotswap). Assets: F3+T. Data: `/reload`.

## Commands

| Command | Description |
|---------|-------------|
| `plug` / `plugdev` | Interactive TUI |
| `plugdev tui` | Same TUI |
| `plug run` / `plugdev run` | Full loop (plugin or mod path) |
| `plug setup` | Prefetch (plugins) or toolchain check (mods / Discord) |
| `plug clean` | Wipe worlds or `.plugdev/run` |
| `plug doctor` | Detect project + toolchain |
| `plug init` | Create `plugdev.yml` + scripts |
| `plugdev init --setup --agents` | Init + prefetch + agent rules |
| `plugdev agent install --all` | Cursor / Claude / Codex rules |
| `plugdev demo` | Built-in demo fixture |
| `plugdev server start` | Headless server (agents/MCP) |
| `plugdev deps add viaversion` | Hangar test dep (plugins) |

### Global flags

| Flag | Description |
|------|-------------|
| `--quiet` | Suppress server logs |
| `--json` | Structured JSON output |
| `--join` | Auto-join client |
| `--no-watch` | One-shot boot |
| `--hotswap` | Plugins: JDWP + method-body redefine (falls back to safe reload) |
| `--loader <name>` | Mods: fabric / neoforge / forge subproject |
| `--debug` | Enable JDWP on port 5005 |

## Hotswap (optional, plugins)

Default reload is **safe** (JAR + bootstrap). For method-body edits only:

```powershell
plug run --hotswap
```

```yaml
watch:
  reload:
    java: hotswap
```

Hotswap starts JDWP, compiles classes, and tries redefine. New methods/fields, `plugin.yml`, or a failed redefine fall back to safe reload (or restart). PlugDev still sets up the server and client; hotswap is the fast inner loop.

## Discord bots (experimental)

```powershell
cd your-bot
plugdev init --setup
# set DISCORD_TOKEN (or DISCORD_BOT_TOKEN) in the environment / .env
plug run
```

Detects `discord.js` (and similar Node libs). Starts the bot process, watches files, restarts on save. No Paper, no Minecraft client. Node only in this release.

## Dev server on disk (plugins)

| Path | Kept? |
|------|--------|
| `~/.plugdev/` (Paper, Via*, client) | Yes — global cache |
| `<project>/.plugdev/run/` | Yes by default |

```yaml
run:
  cleanup: never    # default
  # cleanup: on-exit
  # cleanup: worlds
```

```powershell
plug clean           # wipe worlds only
plug clean --all     # delete entire .plugdev/run
```

## Client options (plugins)

**Default (`launcher: auto`):** embedded client matching server MC version.

**Prism:**

```powershell
plug client list
plug setup --instance "FO 26.1.2"
plug run
```

```yaml
client:
  launcher: prism
  instance: "FO 26.1.2"
  offline: false
```

## Agents

```powershell
plugdev init --setup --agents
# or later:
plugdev agent install --all
```

Portable skill: [`skills/plugdev`](skills/plugdev).

## PlugDev MCP (experimental)

Not the primary pitch. Prefer `init --setup --agents` until the CLI stick.

```json
{
  "mcpServers": {
    "plugdev": {
      "command": "npx",
      "args": ["-y", "@plugdev/mcp"],
      "env": { "PLUGDEV_PROJECT_ROOT": "${workspaceFolder}" }
    }
  }
}
```

## Status

**v0.10.0** — Mods + Discord bot testing (experimental) + optional Java hotswap. See [CHANGELOG.md](CHANGELOG.md).

Site: [pluglabs.app/plugdev](https://pluglabs.app/plugdev) · npm: [`@plugdev/cli`](https://www.npmjs.com/package/@plugdev/cli)

## Star History

<a href="https://www.star-history.com/?repos=mattbaconz%2Fplugdev&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=mattbaconz/plugdev&type=date&theme=dark&legend=top-left&sealed_token=LCuZvE-j6VXcZD6idIhXVGTLsvuYhwI1cWu-KnNKPnNMRFJLFRSpd-7j91gCVyQMXeBh0zq_ZZdrgbaZuW5EcYDTt-cumSyheYgD79-HS7aeORzdAjI-GqUftkvaKyB3Mzm79aTvK6jCb3eBogTFrCQqiGp3F0SwI_H6aWpg6W0eQF0qOUBd3CqWPeCx" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=mattbaconz/plugdev&type=date&legend=top-left&sealed_token=LCuZvE-j6VXcZD6idIhXVGTLsvuYhwI1cWu-KnNKPnNMRFJLFRSpd-7j91gCVyQMXeBh0zq_ZZdrgbaZuW5EcYDTt-cumSyheYgD79-HS7aeORzdAjI-GqUftkvaKyB3Mzm79aTvK6jCb3eBogTFrCQqiGp3F0SwI_H6aWpg6W0eQF0qOUBd3CqWPeCx" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=mattbaconz/plugdev&type=date&legend=top-left&sealed_token=LCuZvE-j6VXcZD6idIhXVGTLsvuYhwI1cWu-KnNKPnNMRFJLFRSpd-7j91gCVyQMXeBh0zq_ZZdrgbaZuW5EcYDTt-cumSyheYgD79-HS7aeORzdAjI-GqUftkvaKyB3Mzm79aTvK6jCb3eBogTFrCQqiGp3F0SwI_H6aWpg6W0eQF0qOUBd3CqWPeCx" />
 </picture>
</a>
