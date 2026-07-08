# PlugDev

**Run any test server for your plugin in seconds.**

PlugDev boots a dev server with your plugin loaded, installs preset test dependencies, applies sane defaults (creative, void world, offline mode), watches your source for safe JAR reload, and optionally opens Minecraft to join automatically.

## Quick start

```bash
npx @plugdev/cli init
plugdev setup          # prefetch Paper + Minecraft client (~one-time)
plugdev run            # or: npm run dev
```

### From this repo (development)

```bash
cd plugdev
npm install
npm run build          # builds CLI + bootstrap plugin (required once)

# Record-ready demo (quiet terminal + auto-join)
node packages/cli/dist/cli.js demo --quiet

# Or from fixture
cd test/fixtures/paper-plugin
node ../../../packages/cli/dist/cli.js run --quiet --join
```

> Do not use `npx @plugdev/cli` from the monorepo root — use `node packages/cli/dist/cli.js` after `npm run build`.

### From npm

```bash
npx @plugdev/cli init
plugdev setup
npm run dev            # or: plugdev run
```

`plugdev setup` downloads Paper and the embedded Minecraft client to `~/.plugdev/` so first `plugdev run` is fast. No Prism required — `client.launcher: auto` falls back to the embedded client.

## The magical demo

1. Open a Paper Gradle plugin project (with `plugin.yml` and `gradlew`).
2. Run `plugdev run` (or `plugdev demo --quiet` for recordings).
3. PlugDev detects the project, downloads/caches Paper, builds your JAR, starts a local server at `.plugdev/run`, and opens Minecraft to join `localhost:25565`.
4. Edit Java source under `src/` and save — PlugDev rebuilds and triggers a safe reload via the bootstrap plugin.

No manual JAR copying. No manual Direct Connect.

## Commands

| Command | Description |
|---------|-------------|
| `plugdev demo` | Run built-in demo fixture (`--quiet` recommended for video) |
| `plugdev run` | Full loop: server + watch + auto-join client |
| `plugdev` | Build plugin, boot server, watch `src/` (no client) |
| `plugdev build` | Build plugin JAR only |
| `plugdev sync` | Build + sync JAR to `.plugdev/run/plugins` |
| `plugdev server start` | Headless server (for agents/MCP) |
| `plugdev server stop` | Stop running dev server |
| `plugdev server status` | Check if server is running |
| `plugdev server command <cmd>` | Run console command via RCON |
| `plugdev server logs` | Tail `latest.log` |
| `plugdev doctor` | Detect project + toolchain |
| `plugdev init` | Create `plugdev.yml` + `package.json` scripts |
| `plugdev setup` | Prefetch Paper + Minecraft client; provision Prism if found |
| `plugdev open --client` | Launch MC client |
| `plugdev cache status` | Show `~/.plugdev/` sizes |
| `plugdev cache prefetch` | Warm server or client cache (`--client`, `--version`) |
| `plugdev deps add essentials` | Install preset test dependency |

### Global flags

| Flag | Description |
|------|-------------|
| `--quiet` | Suppress Paper logs; show PlugDev steps + reload events only |
| `--verbose` | Full server output (default) |
| `--json` | Structured JSON output (for MCP/agents) |
| `--join` | Auto-join Minecraft client |
| `--no-watch` | One-shot boot |

## PlugDev MCP

Agent-controllable dev environment via `@plugdev/mcp`.

**Install:** `npm install -D @plugdev/mcp @plugdev/cli`

**Cursor MCP config** (add to your project's `.cursor/mcp.json`):

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

See [`packages/mcp/mcp-config.example.json`](packages/mcp/mcp-config.example.json) for a full example.

**Monorepo dev:** `npm run smoke -w @plugdev/mcp`

## Configuration

See [`spec/plugdev.yml.example`](spec/plugdev.yml.example) or run `plugdev init`.

## Publishing

npm org: **`@plugdev`** (`@plugdev/cli`, `@plugdev/mcp`).

## Status

**v0.4.1** — Easy Setup (`plugdev setup`, embedded client auto-fallback, void world + 1G defaults), cache prefetch, doctor readiness checks.

Previous: **v0.4.0** — Demo-ready UX (`--quiet`, phased output, `plugdev demo`), MCP hardening, RCON + headless server commands.
