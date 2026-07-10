# Changelog

## 0.7.6 — 2026-07-09

### [fixed]
- Embedded client launch (`gamePath` via `folder.path`)

### [added]
- Interactive server console on `plug run` (RCON readline)
- Default deps: Via* + VaultUnlocked, EssentialsX, MineConomy
- `plugdev agent install [--cursor|--claude|--codex|--all]`

## 0.7.5 — 2026-07-09

### [added]
- Global bins: `plug` and `plugdev` (same CLI)
- Install UX: `npm i -g @plugdev/cli` then `plug run`
- `run.cleanup`: `never` (default) | `on-exit` | `worlds`
- `plug clean` / `plugdev clean` (`--worlds`, `--all`, `--force`)

### [changed]
- Init/setup hints prefer global `plug` over `npm run dev`

## 0.7.4 — 2026-07-09

### [added]
- Void worlds include a solid platform; regenerate when `dev.world` changes
- Bootstrap `api-version: 1.20` (Paper 1.20.x and 1.21+)
- Default embedded client matching server MC (`launcher: auto`)
- Wire `jvm.args` from `plugdev.yml` into Paper
- Ready banner shows real world type; first-boot remap + Ctrl+C tips

### [changed]
- Prism FO is opt-in via `--instance`
- Prism/MultiMC uses Microsoft account by default (`client.offline: false`)
- Clearer install path: `npx @plugdev/cli@latest init --setup`

## 0.7.3 — 2026-07-09

### [fixed]
- Hangar `/latest` plain-text responses so Via* prefetch works

## 0.7.2 — 2026-07-09

### [fixed]
- Hangar `/latest` parsing (API returns a string, not `{ name }`)
- Always resolve Hangar version when `author`/`slug` set without `version`

## 0.7.1 — 2026-07-09

### [fixed]
- `plugdev setup` skips embedded client download when Prism/MultiMC is configured
- Embedded client download failures no longer abort setup (warn + continue)

## 0.7.0 — 2026-07-09

### [added]
- `plugdev init` writes ViaVersion / ViaBackwards / ViaRewind into `deps:`
- `plugdev setup` prefetches Via* into `~/.plugdev/deps/`
- Boot installs missing deps every time
- Presets: `viaversion`, `viabackwards`, `viarewind`
- `plugdev deps add` appends to `plugdev.yml`
- `plugdev client list` — Prism/MultiMC instances
- `plugdev setup --instance` / `client setup --instance` writes `client.*` to yml
- Via*-aware `auto` launch for mismatched Prism instances
- Recently-played Prism instance when `client.instance` unset and Via* present

## 0.6.1 — 2026-07-09

### [added]
- `build.module` → `mvn -pl <module> -am` (wrapper-aware)
- Default `jarPattern` to `<module>/target/*.jar`
- Doctor warns when reactor `<modules>` present without `build.module`
- Schema: `build.module` field

### [changed]
- Includes 0.6.0 Maven Paper parity + PowerShell-safe `init --setup`

## 0.6.0 — 2026-07-09

### [added]
- Config-aware Maven builds (`build.task` / `build.jarPattern`, prefer `mvnw`)
- Robust `target/` JAR selection (prefer shaded; exclude sources/javadoc/original)
- `plugdev init` writes `system: maven` for `pom.xml` projects
- `setup` / `doctor` Maven wrapper checks + shade / run-paper-maven hints
- Detection: `mvnw`, `paper-api`, `maven-shade-plugin`, `run-paper-maven-plugin`
- CI: Maven reload smoke alongside Gradle
- `plugdev init --setup` runs prefetch in one step

### [changed]
- Next-step hints print one command per line (PowerShell 5.1-safe)

## 0.5.0 — 2026-07-09

### [fixed]
- Bootstrap reload hardening (stable `reload.list`, timestamped JAR names, clearer markers)
- Reload feedback matches `[PlugDev] Loaded dev plugin:` (fewer false positives)

### [added]
- Folia warnings in bootstrap, doctor, and boot
- `plugdev doctor` bootstrap JAR / Spigot / Folia / shadowJar hints
- Shared `resolveBootstrapJar()` for CLI + doctor + server
- CI: Maven fixture doctor/build; watch→reload smoke

## 0.4.4 — 2026-07-09

### [fixed]
- `checkGradle` / `checkMaven` respect process exit codes
- `plugdev doctor` only prints "Ready" when toolchain + setup are ready
- `plugdev client setup --force` actually reprovisions instances
- `client.executable` uses correct launcher data dir (Prism vs MultiMC)
- `init` no longer overwrites package.json scripts without `--force`
- Schema no longer emits `format: uri` warnings

### [added]
- Cross-platform Prism/MultiMC detection (Windows, macOS, Linux/Flatpak)
- Offline-friendly Paper cache checks via local `meta.json`
- Parallel prefetch shows Minecraft client download feedback
- `client.joinOnReady` for bare `plugdev` runs
- `cache clear` requires `--servers`, `--deps`, or `--all`
- `cache status` reports embedded client cache size
- MCP: `plugdev_doctor`, `plugdev_setup`; `@plugdev/mcp@0.1.1`
- CI: prefetch + unit tests + MCP smoke

## 0.4.3 — 2026-07-09

### [fixed]
- Setup/download progress updates in place
- Parallel prefetch no longer spams two progress streams on one line
- `plugdev init` replaces `{{version}}` in client instance name

## 0.4.2 — 2026-07-08

### [fixed]
- `plugdev init` adds `@plugdev/cli` to devDependencies and `setup` script
- Init no longer overwrites existing `plugdev.yml` without `--force`
- Quick start docs use `npm install && npm run setup`

## 0.4.1 — 2026-07-08

### [added]
- `plugdev setup` — prefetch Paper + embedded client
- `plugdev cache prefetch` — warm server or client cache
- `client.launcher: auto` — Prism/MultiMC → embedded `@xmcl` fallback
- Lighter dev defaults: void world, 1G JVM, view-distance 4
- Parallel server + client prefetch on first `plugdev run --join`
- Download progress for Paper JAR fetches
- `plugdev doctor` reports cache + client readiness

### [fixed]
- Auto launcher skips version-mismatched Prism instances
- Server cache checks work for Purpur/Pufferfish/Spigot
- Doctor exit codes reflect setup readiness

## 0.4.0 — 2026-07-08

### [added]
- `--quiet` / `--verbose` phased terminal output
- `plugdev demo` for recordings
- `plugdev server start|stop|status|command|logs` for headless/agent use
