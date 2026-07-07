# PlugDev

**Run any test server for your plugin in seconds.**

PlugDev boots a dev server with your plugin loaded, installs preset test dependencies, applies sane defaults (creative, flat world, offline mode), watches your source for safe JAR reload, and optionally opens Minecraft to join automatically.

Future: [PlugDev MCP](docs/mcp/overview.md) exposes this workflow to AI agents through MCP — infrastructure for plugin developers who use Cursor, Claude, or Codex.

## Quick start

### From this repo (development)

```bash
cd plugdev
npm install
npm run build          # builds CLI + bootstrap plugin (required once)

cd test/fixtures/paper-plugin
node ../../../packages/cli/dist/cli.js doctor
node ../../../packages/cli/dist/cli.js run   # server + watch + auto-join
```

> **Note:** Do not use `npx @plugdev/cli` from the monorepo root — npm serves the published package (may be an older version) and `dist/` is not built until you run `npm run build`. Use `node packages/cli/dist/cli.js` or `npm run start -w @plugdev/cli` after building.

### From npm

```bash
npx @plugdev/cli init
npm run dev            # or: plugdev run
```

## The magical demo

1. Open a Paper Gradle plugin project (with `plugin.yml` and `gradlew`).
2. Run `plugdev run`.
3. PlugDev detects the project, downloads/caches Paper, builds your JAR, starts a local server at `.plugdev/run`, and opens Minecraft to join `localhost:25565`.
4. Edit Java source under `src/` and save — PlugDev rebuilds and triggers a safe reload via the bootstrap plugin.

No manual JAR copying. No server restarts for typical code changes. No manual Direct Connect.

## Commands

| Command | Description |
|---------|-------------|
| `plugdev` | Build plugin, boot server, watch `src/` (no client) |
| `plugdev run` | Same + auto-join Minecraft client |
| `plugdev --join` | Flag equivalent of `plugdev run` |
| `plugdev open` | Copy `localhost:PORT` to clipboard |
| `plugdev open --client` | Launch MC client (Prism → clipboard → embedded) |
| `plugdev --no-watch` | One-shot boot (CI / smoke) |
| `plugdev --folia` | Use Folia instead of Paper |
| `plugdev --purpur` | Use Purpur instead of Paper |
| `plugdev --port 25575` | Custom server port |
| `plugdev --version 1.21.4` | Pin Minecraft version |
| `plugdev --debug` | Enable JDWP on port 5005 |
| `plugdev doctor` | Detect project + toolchain |
| `plugdev init` | Create `plugdev.yml` + `package.json` scripts |
| `plugdev cache status` | Show `~/.plugdev/` sizes |
| `plugdev cache clear` | Clear cached server JARs / deps |
| `plugdev deps add essentials` | Install preset test dependency |
| `plugdev deps list` | List available presets |

## Server software

| Software | Flag / config | Notes |
|----------|---------------|-------|
| Paper | default / `--paper` | Recommended |
| Folia | `--folia` | Region-threaded plugins |
| Purpur | `--purpur` | Paper fork with extras |

## Configuration

Copy [`spec/plugdev.yml.example`](spec/plugdev.yml.example) to `plugdev.yml` in your project root, or run `plugdev init`.

```yaml
type: plugin
server: paper
version: "1.21.4"
port: 25565

build:
  system: gradle
  jarTask: shadowJar
  jarPattern: "build/libs/*.jar"

watch:
  paths: [src/]
  reload:
    java: safe

# Optional: preset test plugins
deps:
  - name: essentials
  - name: vault
  - name: luckperms

# Optional: auto-join client (used by plugdev run)
client:
  launcher: auto
  instance: plugdev-1.21.4
  offlineName: DevPlayer
```

## Documentation

| Audience | Start here |
|----------|------------|
| Humans | [docs/00-index.md](docs/00-index.md) |
| AI agents | [AGENTS.md](AGENTS.md) |
| Roadmap / gaps | [TODO.md](TODO.md) |

## Spec

- Config schema: [`spec/plugdev.schema.json`](spec/plugdev.schema.json)
- Examples: [`spec/plugdev.yml.example`](spec/plugdev.yml.example)

## Obsidian

Open this repo folder as an Obsidian vault. Start at [docs/00-index.md](docs/00-index.md).

## Publishing

npm org: **`@plugdev`** (`@plugdev/cli`). Company name is PLUG Labs; product brand is PlugDev. See [docs/shipping.md](docs/shipping.md).

## Status

**v0.3.1** — Full test loop: `plugdev run`, client auto-join, dependency presets, Purpur/Pufferfish/Spigot, `plugdev network`. PlugDev MCP spec in [docs/mcp/overview.md](docs/mcp/overview.md). See [docs/roadmap/v0.2.md](docs/roadmap/v0.2.md) and [TODO.md](TODO.md).
