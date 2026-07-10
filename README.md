<div align="center">

<img src="brand/plugdev-logo.png" alt="PlugDev" width="128" />

# PlugDev · v0.9.2

---

**Test Minecraft plugins in one command.**

Starts a real server with your plugin, opens Minecraft, and reloads when you save. Works with Paper, Folia, Purpur, Pufferfish, and Spigot.

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

Feels like `npm run dev` — for Minecraft plugins.

## Quick start

```powershell
npm install -g @plugdev/cli
cd your-plugin
plugdev init --setup
plugdev          # interactive TUI
# or: plugdev run   # one-shot test loop
```

`plug` and `plugdev` are the same CLI. Use whichever you prefer.

| Prefer… | Same as |
|---------|---------|
| `plug` / `plugdev` | Interactive TUI (TTY) |
| `plug run` | `plugdev run` (server + watch + join) |
| `plug setup` | `plugdev setup` |
| `plug doctor` | `plugdev doctor` |
| `plug clean` | `plugdev clean` |

**Without a global install:** `npx @plugdev/cli@latest init --setup` then `npx @plugdev/cli@latest` (TUI) or `… run`.

Optional `npm run dev` scripts still work — they call `plugdev run`.

### What happens

Paper + Via* cache under `~/.plugdev/`. Your project server lives in `.plugdev/run/` (kept by default for fast restarts). An embedded client matching your MC version joins `localhost:25565`. Edit `src/` → save → safe reload.

First boot remaps plugins (~10–30s). Later boots are much faster. **Ctrl+C** stops the server; closing Minecraft does not.

## Commands

| Command | Description |
|---------|-------------|
| `plug` / `plugdev` | Interactive TUI (configure + run) |
| `plugdev tui` | Same TUI (explicit) |
| `plug run` / `plugdev run` | Full loop: server + watch + auto-join |
| `plug setup` | Prefetch Paper + Via* + client |
| `plug clean` | Remove worlds or `.plugdev/run` |
| `plug doctor` | Detect project + toolchain |
| `plug init` | Create `plugdev.yml` + scripts |
| `plugdev demo` | Built-in demo fixture |
| `plugdev server start` | Headless server (agents/MCP) |
| `plugdev deps add viaversion` | Install preset dep |

### Global flags

| Flag | Description |
|------|-------------|
| `--quiet` | Suppress server logs |
| `--json` | Structured JSON output |
| `--join` | Auto-join client |
| `--no-watch` | One-shot boot |

## Dev server on disk

| Path | Kept? |
|------|--------|
| `~/.plugdev/` (Paper, Via*, client) | Yes — global cache |
| `<project>/.plugdev/run/` | Yes by default (fast restarts) |

```yaml
run:
  cleanup: never    # default — keep run folder
  # cleanup: on-exit  # delete .plugdev/run when you stop
  # cleanup: worlds   # wipe world folders each start/exit (keep plugins)
```

```powershell
plug clean           # wipe worlds only
plug clean --all     # delete entire .plugdev/run
```

## Client options

**Default (`launcher: auto`):** embedded client = server MC version (fast, light).

**Prism with your Microsoft account:**

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

## PlugDev MCP

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

**v0.9.2** — Asset CDN resilience, Ink TUI, Prism instance picker. See [CHANGELOG.md](CHANGELOG.md).

Site: [pluglabs.app/plugdev](https://pluglabs.app/plugdev) · npm: [`@plugdev/cli`](https://www.npmjs.com/package/@plugdev/cli)

## Star History

<a href="https://www.star-history.com/?repos=mattbaconz%2Fplugdev&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=mattbaconz/plugdev&type=date&theme=dark&legend=top-left&sealed_token=LCuZvE-j6VXcZD6idIhXVGTLsvuYhwI1cWu-KnNKPnNMRFJLFRSpd-7j91gCVyQMXeBh0zq_ZZdrgbaZuW5EcYDTt-cumSyheYgD79-HS7aeORzdAjI-GqUftkvaKyB3Mzm79aTvK6jCb3eBogTFrCQqiGp3F0SwI_H6aWpg6W0eQF0qOUBd3CqWPeCx" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=mattbaconz/plugdev&type=date&legend=top-left&sealed_token=LCuZvE-j6VXcZD6idIhXVGTLsvuYhwI1cWu-KnNKPnNMRFJLFRSpd-7j91gCVyQMXeBh0zq_ZZdrgbaZuW5EcYDTt-cumSyheYgD79-HS7aeORzdAjI-GqUftkvaKyB3Mzm79aTvK6jCb3eBogTFrCQqiGp3F0SwI_H6aWpg6W0eQF0qOUBd3CqWPeCx" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=mattbaconz/plugdev&type=date&legend=top-left&sealed_token=LCuZvE-j6VXcZD6idIhXVGTLsvuYhwI1cWu-KnNKPnNMRFJLFRSpd-7j91gCVyQMXeBh0zq_ZZdrgbaZuW5EcYDTt-cumSyheYgD79-HS7aeORzdAjI-GqUftkvaKyB3Mzm79aTvK6jCb3eBogTFrCQqiGp3F0SwI_H6aWpg6W0eQF0qOUBd3CqWPeCx" />
 </picture>
</a>
