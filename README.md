# PlugDev

**Run any test server for your plugin in seconds.**

PlugDev boots a dev server with your plugin loaded, installs preset test dependencies, applies sane defaults (creative, void world, offline mode), watches your source for safe JAR reload, and optionally opens Minecraft to join automatically.

## Quick start

Run each command on its own line (Windows PowerShell 5.1 does not support `&&`):

```bash
npx @plugdev/cli init --setup
npm install
npm run dev
```

Or step by step:

```bash
npx @plugdev/cli init
npm install
npm run setup          # prefetch Paper + Minecraft client (~one-time)
npm run dev            # or: npx @plugdev/cli run
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
npx @plugdev/cli init --setup
npm install
npm run dev
```

`plugdev setup` (or `init --setup`) downloads Paper, the embedded Minecraft client, and **ViaVersion / ViaBackwards / ViaRewind** to `~/.plugdev/` so first `plugdev run` is fast. New projects get those Via* deps in `plugdev.yml` by default — newer clients (e.g. Prism FO 26.1.2) can join an older Paper server.

### Use your existing Prism instance

```bash
plugdev client list
plugdev setup --instance "FO 26.1.2"
npm run dev
```

Or set in `plugdev.yml`:

```yaml
client:
  launcher: prism
  instance: "FO 26.1.2"   # folder name under Prism instances/
  offlineName: DevPlayer
```

With Via* installed, version mismatch is expected and allowed. No Prism required — `client.launcher: auto` falls back to the embedded client when no launcher is found.

## The magical demo

1. Open a Paper plugin project (Gradle with `gradlew`, or Maven with `pom.xml` / `mvnw`).
2. Run `plugdev run` (or `plugdev demo --quiet` for recordings).
3. PlugDev detects the project, downloads/caches Paper + Via*, builds your JAR, starts a local server at `.plugdev/run`, and opens Minecraft to join `localhost:25565`.
4. Edit Java source under `src/` and save — PlugDev rebuilds and triggers a safe reload via the bootstrap plugin.

No manual JAR copying. No manual Direct Connect.

Maven projects: `plugdev init` writes `build.system: maven` and `jarPattern: "target/*.jar"`.

Multi-module reactors: set `build.module` in `plugdev.yml` (runs `mvn -pl <module> -am`). See [docs/plugins/maven.md](docs/plugins/maven.md) when nested locally.

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
| `plugdev setup` | Prefetch Paper + Via* + client; `--instance` picks Prism |
| `plugdev client list` | List Prism/MultiMC instances (folder id + MC version) |
| `plugdev open --client` | Launch MC client |
| `plugdev cache status` | Show `~/.plugdev/` sizes |
| `plugdev cache prefetch` | Warm server or client cache (`--client`, `--version`) |
| `plugdev deps add viaversion` | Install preset (also writes `plugdev.yml`) |

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

**v0.7.0** — Via* by default + Prism instance picker (`client list`, `setup --instance`, Via-aware auto launch).

Previous: **v0.6.1** — Maven multi-module + Windows UX. **v0.5.0** — Trust & Reliability.
