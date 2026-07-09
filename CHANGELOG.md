# Changelog

## 0.7.1 — 2026-07-09

- `plugdev setup` skips embedded client download when Prism/MultiMC instance is already configured
- Embedded client download failures no longer abort setup (warn + continue)

## 0.7.0 — 2026-07-09

### Via* defaults + easy Prism client

- `plugdev init` writes ViaVersion / ViaBackwards / ViaRewind into `deps:`
- `plugdev setup` prefetches Via* into `~/.plugdev/deps/` (and Paper + client)
- Boot installs missing deps every time (not first-boot-only)
- Presets: `viaversion`, `viabackwards`, `viarewind`
- `plugdev deps add` appends to `plugdev.yml`
- `plugdev client list` — Prism/MultiMC instances (folder id, MC version, last launch)
- `plugdev setup --instance "FO 26.1.2"` / `client setup --instance` writes `client.*` to yml
- Via*-aware `auto` launch: mismatched Prism instances (e.g. 26.1.2 → Paper 1.20.6) are allowed
- Recently-played Prism instance used when `client.instance` unset and Via* present

## 0.6.1 — 2026-07-09

### Multi-module Maven + UX

- `build.module` → `mvn -pl <module> -am` (wrapper-aware); default `jarPattern` to `<module>/target/*.jar`
- Doctor warns when reactor `<modules>` present without `build.module`
- Schema: `build.module` field
- Includes 0.6.0 Maven Paper parity + PowerShell-safe `init --setup` (see below)

## 0.6.0 — 2026-07-09

### Maven Paper parity

- Config-aware Maven builds: honor `build.task` / `build.jarPattern`, prefer `mvnw` over system `mvn`
- Robust `target/` JAR selection (exclude sources/javadoc/original; prefer shaded)
- `plugdev init` writes `system: maven` for `pom.xml` projects
- `setup` / `doctor` check Maven wrapper or `mvn`; shade + run-paper-maven hints
- Detection: `mvnw`, `paper-api` version, `maven-shade-plugin`, `run-paper-maven-plugin` signal
- CI: Maven reload smoke alongside Gradle

### Easier setup (Windows)

- `plugdev init --setup` runs prefetch in one step
- Next-step hints print one command per line (PowerShell 5.1-safe; no `&&`)

## 0.5.0 — 2026-07-09

### Trust & Reliability

- Bootstrap reload hardening: stable `reload.list` path, prefer stored dev plugin name for timestamped JARs, clearer `[PlugDev]` log markers for CLI/CI
- Folia warnings in bootstrap, doctor, and `plugdev` boot (prefer restart over safe reload)
- `plugdev doctor` checks bootstrap JAR presence; Spigot missing-JAR path + BuildTools hint; Folia support signal; shadowJar vs jarTask mismatch hint
- Shared `resolveBootstrapJar()` for CLI + doctor + server commands
- CI: Maven fixture doctor/build; watch→reload smoke (`npm run smoke:reload`)
- Reload feedback matches `[PlugDev] Loaded dev plugin:` markers (fewer false positives)

## 0.4.4 — 2026-07-09

### Trust & Demo

- `checkGradle` / `checkMaven` respect process exit codes
- `plugdev doctor` only prints "Ready" when toolchain + setup are ready
- `plugdev client setup --force` actually reprovisions instances
- Cross-platform Prism/MultiMC detection (Windows, macOS, Linux/Flatpak)
- `client.executable` uses correct launcher data dir (Prism vs MultiMC)
- Offline-friendly Paper cache checks via local `meta.json`
- Parallel prefetch shows Minecraft client download feedback
- `init` no longer overwrites existing package.json scripts without `--force`
- `client.joinOnReady` wired for bare `plugdev` runs
- `cache clear` requires `--servers`, `--deps`, or `--all`
- `cache status` reports embedded client cache size
- Schema no longer emits `format: uri` warnings
- MCP: `plugdev_doctor`, `plugdev_setup`; hardened JSON parsing; `@plugdev/mcp@0.1.1`
- CI: prefetch + unit tests + MCP smoke

## 0.4.3 — 2026-07-09

### Fixes

- Setup/download progress updates in place (no hundreds of duplicate lines)
- Parallel prefetch no longer spams two progress streams on one line
- `plugdev init` replaces `{{version}}` in client instance name

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
