# PlugDev

**`plug run` / `plugdev run` — npm run dev for Minecraft plugins.**

Boots Paper with your plugin, Via* for cross-version joins, a safe void platform world, watches `src/` for reload, and opens a light embedded Minecraft client matching your server version.

## Install (global — recommended)

```powershell
npm install -g @plugdev/cli
cd your-plugin
plugdev init --setup
plug run
```

`plug` and `plugdev` are the same CLI. Use whichever you prefer:

| Command | Same as |
|---------|---------|
| `plug run` | `plugdev run` |
| `plug setup` | `plugdev setup` |
| `plug doctor` | `plugdev doctor` |
| `plug clean` | `plugdev clean` |

**Without global install:** `npx @plugdev/cli@latest init --setup` then `npx @plugdev/cli@latest run`.

Optional npm scripts (`npm run dev`) still work if you keep them in `package.json` — they just call `plugdev run`.

### What happens

Paper + ViaVersion/ViaBackwards/ViaRewind cache under `~/.plugdev/`. Project server lives in `.plugdev/run/` (kept by default for fast restarts). Embedded vanilla client matching your MC version joins `localhost:25565`. Edit `src/` → save → safe reload.

First boot remaps plugins (~10–30s). Later boots are much faster. **Ctrl+C** stops the server; closing Minecraft does not.

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

## Commands

| Command | Description |
|---------|-------------|
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

**v0.7.5** — Dual bins `plug` + `plugdev`; global install UX; `run.cleanup` + `plug clean`.

Previous: **v0.7.4** — Void platform, bootstrap 1.20, embedded default.
