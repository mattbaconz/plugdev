# PlugDev

**npm run dev for Minecraft plugins.**

Boots Paper with your plugin, Via* for cross-version joins, a safe void platform world, watches `src/` for reload, and opens a light embedded Minecraft client matching your server version.

## Install (easiest)

Run each command on its own line (Windows PowerShell 5.1 does not support `&&`):

```powershell
cd your-plugin
npx @plugdev/cli@latest init --setup
npm install
npm run dev
```

**What happens:** Paper + ViaVersion/ViaBackwards/ViaRewind are cached under `~/.plugdev/`. An embedded vanilla client matching your MC version joins `localhost:25565`. Edit Java under `src/` → save → safe reload.

First boot remaps plugins (~10–30s). Later boots are much faster. **Ctrl+C** stops the server; closing Minecraft does not.

### Step by step

```powershell
npx @plugdev/cli@latest init
npm install
npm run setup
npm run dev
```

### From this repo (development)

```powershell
cd plugdev
npm install
npm run build

node packages/cli/dist/cli.js demo --quiet
```

> Do not use `npx @plugdev/cli` from the monorepo root — use `node packages/cli/dist/cli.js` after `npm run build`.

## Client options

**Default (`launcher: auto`):** embedded client = server MC version (fast, light).

**Prism with your Microsoft account** (no offline DevPlayer):

```powershell
plugdev client list
plugdev setup --instance "FO 26.1.2"
npm run dev
```

```yaml
client:
  launcher: prism
  instance: "FO 26.1.2"
  offline: false          # use signed-in Microsoft account
```

Force offline username on Prism:

```yaml
client:
  launcher: prism
  instance: "FO 26.1.2"
  offline: true
  offlineName: DevPlayer
```

With Via* installed, a newer Prism client can join an older Paper server.

## The magical demo

1. Open a Paper plugin project (Gradle with `gradlew`, or Maven with `pom.xml` / `mvnw`).
2. Run `plugdev run` (or `plugdev demo --quiet` for recordings).
3. PlugDev builds your JAR, starts `.plugdev/run`, installs Via*, opens the embedded client.
4. Edit `src/` and save — safe reload via the bootstrap plugin.

No manual JAR copying. No manual Direct Connect.

Maven: `plugdev init` writes `build.system: maven`. Multi-module: set `build.module` (runs `mvn -pl <module> -am`).

## Commands

| Command | Description |
|---------|-------------|
| `plugdev demo` | Run built-in demo fixture (`--quiet` recommended for video) |
| `plugdev run` | Full loop: server + watch + auto-join client |
| `plugdev` | Build plugin, boot server, watch `src/` (no client) |
| `plugdev build` | Build plugin JAR only |
| `plugdev sync` | Build + sync plugin JAR to `.plugdev/run/plugins` |
| `plugdev server start` | Headless server (for agents/MCP) |
| `plugdev server stop` | Stop running dev server |
| `plugdev server status` | Check if server is running |
| `plugdev server command <cmd>` | Run console command via RCON |
| `plugdev server logs` | Tail `latest.log` |
| `plugdev doctor` | Detect project + toolchain |
| `plugdev init` | Create `plugdev.yml` + `package.json` scripts |
| `plugdev setup` | Prefetch Paper + Via* + embedded client; `--instance` picks Prism |
| `plugdev client list` | List Prism/MultiMC instances |
| `plugdev open --client` | Launch MC client |
| `plugdev cache status` | Show `~/.plugdev/` sizes |
| `plugdev deps add viaversion` | Install preset (also writes `plugdev.yml`) |

### Global flags

| Flag | Description |
|------|-------------|
| `--quiet` | Suppress server logs; show PlugDev steps + reload events only |
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

**v0.7.4** — Void platform spawn, bootstrap on Paper 1.20+, embedded default client, Prism Microsoft account (`offline: false`).

Previous: **v0.7.3** — Hangar Via* prefetch. **v0.6.1** — Maven multi-module + Windows UX.
