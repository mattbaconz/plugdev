# PlugDev

**`npm run dev` for Minecraft plugins, mods, and test servers.**

PlugDev boots a Paper dev server with your plugin loaded, applies sane defaults (creative, flat world, offline mode), and watches your source for safe JAR reload.

## Quick start

```bash
# From npm (when published)
npx @plugdev/cli init
npm run dev

# From this repo
npm install
npm run build
cd test/fixtures/paper-plugin
node ../../../packages/cli/dist/cli.js doctor
node ../../../packages/cli/dist/cli.js
```

## Commands

| Command | Description |
|---------|-------------|
| `plugdev` | Build plugin, boot Paper, watch `src/` |
| `plugdev --no-watch` | One-shot boot (CI / smoke) |
| `plugdev doctor` | Detect project + toolchain |
| `plugdev init` | Create `plugdev.yml` + `package.json` scripts |
| `plugdev cache status` | Show `~/.plugdev/` sizes |
| `plugdev deps add vault` | Install Hangar test dependency |

## Documentation

| Audience | Start here |
|----------|------------|
| Humans | [[docs/00-index]] |
| AI agents | [[AGENTS]] |

## What PlugDev covers

| Track | Default target | Reload model |
|-------|----------------|--------------|
| **Plugins** | Paper server | Safe JAR reload |
| **Mods** | `runClient` | Tiered: hotswap / F3+T / `/reload` / restart |
| **Servers** | Proxy networks, datapacks | Config watch + `/reload` |

## Spec

- Config schema: [`spec/plugdev.schema.json`](spec/plugdev.schema.json)
- Examples: [`spec/plugdev.yml.example`](spec/plugdev.yml.example)

## Obsidian

Open `C:\Users\mattbaconz\plugdev` as a vault. Start at [[docs/00-index]].

## Status

**v0.1 alpha** — Paper Gradle plugins with global cache, file watch, and bootstrap safe reload. See [[docs/roadmap/mvp]].
