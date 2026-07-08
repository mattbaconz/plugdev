# Changelog

## 0.4.2 — 2026-07-08

### Fixes

- `plugdev init` adds `@plugdev/cli` to devDependencies and `setup` npm script
- Init no longer overwrites existing `plugdev.yml` without `--force`
- Quick start docs use `npm install && npm run setup` (fixes `plugdev` not on PATH after npx)

## 0.4.1 — 2026-07-08

### Easy Setup

- `plugdev setup` — prefetch Paper + embedded Minecraft client in one command
- `plugdev cache prefetch` — warm server or client cache for CI/recording
- `client.launcher: auto` — Prism/MultiMC → embedded `@xmcl` fallback (with retry on launch failure)
- Lighter dev defaults: void world, 1G JVM, view-distance 4
- Parallel server + client prefetch on first `plugdev run --join`
- Download progress for Paper JAR fetches
- `plugdev doctor` reports cache + client readiness

### Fixes

- Auto launcher skips version-mismatched Prism instances
- Server cache checks work for Purpur/Pufferfish/Spigot
- Doctor exit codes reflect setup readiness

## 0.4.0 — 2026-07-08

- `--quiet` / `--verbose` phased terminal output
- `plugdev demo` for recordings
- `plugdev server start|stop|status|command|logs` for headless/agent use
- RCON console commands
- `@plugdev/mcp` package (MCP server for agents)
- `doctor --json`, structured error hints

## 0.3.1 and earlier

See git history.
