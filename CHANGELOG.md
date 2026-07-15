# Changelog

## 0.12.3 — 2026-07-15

### [fixed]
- JAR pick no longer prefers `*-shaded.jar` over finalName plugins (e.g. `WorldEvents-*.jar` wins over `worldevents-core-*-shaded.jar` when both match `target/*.jar`)
- Boot no longer writes `.reload-trigger`, so Paper’s first load is not race-reloaded by bootstrap ~1s later
- Bootstrap seeds `ReloadWatcher` from any leftover `.reload-trigger` stamp so stale triggers are ignored

### [changed]
- `doctor` shade tip suggests finalName / plugin.yml pick instead of `target/*-shaded.jar`
- `plugdev sync` only bumps `.reload-trigger` when a live server session exists

## 0.12.2 — 2026-07-15

### [added]
- Instant OP on join when `dev.op` is true (default): bootstrap reads `plugdev-dev.json` and grants OP to every joining player (offline DevPlayer and online Prism accounts)

### [changed]
- Ready console tip no longer suggests `op DevPlayer`; agent rules note auto-OP
- Schema describes `dev.op` as auto-OP on join

## 0.12.1 — 2026-07-15

### [fixed]
- Safe reload no longer leaves Bukkit/Paper commands bound to the disabled plugin instance (`/we` → "plugin is disabled" after reload)
- Bootstrap unregisters PluginCommands on unload and syncs the server command map after reload
- `deployPluginJar` prunes older same-plugin JARs (version bumps and `-reload-*` copies) so `.plugdev/run/plugins` does not accumulate duplicates

## 0.12.0 — 2026-07-14

### [added]
- Multi-module Maven/Gradle detection (`detect/modules.ts`): classify plugin vs library, Folia flags, auto-select when one plugin module
- Reactor-root fallback: `type: plugin` detected when `plugin.yml` lives only in a submodule
- `plugdev module list|use` (+ `--json`) and `--module` on `run` / `build` / `sync` / `server start`
- Gradle plugin builds honor `build.module` (`:module:jarTask`)
- TUI: Module picker, Dependencies manager; Configure adds reload.java, run.cleanup, jump-to-module
- Expanded Hangar/Modrinth dep presets (WorldGuard, WorldEdit, Towny, ProtocolLib, LuckPerms, …)
- Module-aware `detectProjectDeps` / Folia checks
- `@plugdev/mcp` 0.3.0: `plugdev_list_modules`, `plugdev_use_module`, `plugdev_list_deps`, `plugdev_add_dep`, `plugdev_remove_dep`, `plugdev_agent_install`, `plugdev_cache_prefetch`, `plugdev_cache_status`, `plugdev_clean`
- Shared `agent-content.ts` for Cursor / Claude / Codex / bundled skill

### [changed]
- `doctor` / `init` surface real module candidates; `init` sets `watch.paths` across library + selected plugin modules
- Agent skill/rules mention `module`, deps TUI, and new MCP tools

## 0.11.2 — 2026-07-14

### [fixed]
- Live Paper console after ready: stdout/stderr stay attached so command ERROR/stacktraces show in the PlugDev terminal (no more silent post-boot console)
- `--quiet` still suppresses boot noise but streams ERROR/WARN/stack lines after ready

### [changed]
- Server log lines after ready are prefixed with `│` and color-coded (ERROR red, WARN yellow)
- RCON console echoes `> command` and warns when the response is empty
- Ready banner shows `── server console ──` separator; duplicate “type commands” tip removed from banner

## 0.11.1 — 2026-07-14

### [fixed]
- Auto-join Quick Play no longer hits "Connection refused: getsockopt" on Windows: join `127.0.0.1` (not `localhost`/`::1`), wait for the game TCP port after log-ready, and only auto-join on first boot (not watcher restarts)

## 0.11.0 — 2026-07-14

### [added]
- `plugdev init --mcp` and `plugdev agent install --mcp` write `.cursor/mcp.json` and `.mcp.json`
- Agent install copies portable skill into `.agents/skills/plugdev` and `.cursor/skills/plugdev`
- skills.sh-ready package under `skills/plugdev/` (`npx skills add mattbaconz/plugdev --skill plugdev`)
- Cursor plugin manifest (`.cursor-plugin/plugin.json` + root `mcp.json`)
- `@plugdev/mcp` 0.2.0: `plugdev_init` tool; falls back to `npx -y @plugdev/cli` when `plugdev` is not on PATH

### [changed]
- Canonical agent setup: `plugdev init --setup --agents --mcp`
- Agent rule templates mention MCP tools for headless control when configured

## 0.10.2 — 2026-07-13

### [fixed]
- CI no longer prefetches the embedded Minecraft client (smokes only need Paper); server JAR is cached in GitHub Actions between runs
- `cache prefetch --paper --client` downloads server and client in parallel
- `cache prefetch --client --skip-assets` skips texture/sound assets (jar + libraries only)
- MaxListenersExceededWarning during client library downloads

## 0.10.1 — 2026-07-12

### [fixed]
- Windows cmd no longer fails with "The input line is too long" when JAVA_HOME/PATH helpers rewrite a huge PATH; Java is resolved by absolute path (JAVA_HOME, Scoop Temurin, PATH) without batch `set PATH=`
- Paper/Folia 26.x requires Java 25+; PlugDev picks the newest suitable JDK (e.g. scoop `temurin25-jdk`) for setup/run/doctor/server/hotswap/Gradle/Maven
- Server, hotswap helper, and builds spawn `java`/`javac` via the resolved binary and set `JAVA_HOME` on the child env only

## 0.10.0 — 2026-07-12

### [added]
- Optional Java hotswap fast path: `watch.reload.java: hotswap` or `plug run --hotswap` (JDWP redefine for method bodies; falls back to safe reload)
- Experimental Discord bot loop: detect `discord.js` / similar, `type: discord-bot`, run + watch + process restart
- Smarter project detection: deps from `plugin.yml` / `compileOnly`, Prism instance recommend, Folia signals
- Agent snippets mention hotswap limits and Discord bot experimental path

### [changed]
- README positions PlugDev for plugins + mods; Discord bots experimental
- `setup` / `doctor` skip Paper/client for mods and Discord bots; Discord checks Node + token env presence
- Schema: `discordBotConfig`; hotswap description clarified

### [fixed]
- `watch.reload.java: hotswap` no longer silently took the safe-reload path without attempting redefine

## 0.9.2 — 2026-07-10

### [fixed]
- Embedded client asset downloads no longer crash the run with a huge AggregateError dump when Mojang CDN times out
- Empty (0-byte) asset files from failed downloads are purged before retry
- Connect timeout raised to 60s with undici retries; BMCLAPI mirror tried before Mojang assets CDN

### [changed]
- Client install splits core (jar + libraries, required) from assets (retried, then best-effort)
- If assets still fail, PlugDev warns and continues when jar/libs are ready — retry with `plugdev cache prefetch --client --force`

## 0.9.1 — 2026-07-10

### [fixed]
- Ctrl+C no longer crashes with unhandled `EPIPE` when writing stop to a closed server stdin
- SIGINT/SIGTERM handlers no longer stack on every server restart
- Configure now auto-saves on field commit (Enter) — offline name and other fields persist without pressing S

### [added]
- Configure: ←→ cycle for server, launcher, world, gamemode, join-on-ready
- Prism/MultiMC instance picker from Configure (lists launcher instances)
- Persist `client.instance` from TUI

### [changed]
- Home header shows launcher instance when set
- Clearer Configure footer (auto-save status)

## 0.9.0 — 2026-07-10

### [added]
- Interactive TUI (Ink): bare `plugdev` / `plug` opens a menu to configure `plugdev.yml` and start the test loop
- `plugdev tui` alias; Configure screen for common fields (version, server, port, client, world, JVM)
- `updatePlugdevYml` deep-merge helper for writing config patches

### [changed]
- Bare `plugdev` / `plug` on a TTY opens the TUI instead of starting the loop immediately
- `plugdev run` remains the one-shot test loop (server + watch + join)
- Non-TTY / `--json` / CI prints short help (does not hang waiting for keys)
- Saving from Configure rewrites YAML (comments may be lost)

## 0.8.1 — 2026-07-10

### [fixed]
- Doctor `resolveClientTier` referenced removed import (`isEmbeddedClientCached`) — use integrity-ready check

## 0.8.0 — 2026-07-10

### [fixed]
- Embedded client “Missing N libraries” after false cache hit — integrity check via `@xmcl/core` `diagnose()`, repair with `installLibraries` / full reinstall
- `plugdev setup` / `cache prefetch --client` no longer treat version JSON alone as ready
- Launch retries once after repairing corrupt libraries

### [added]
- `ensureEmbeddedClient` / `isEmbeddedClientReady`; `plugdev cache clear --client`; `cache prefetch --client --force`
- Multi-player: `client.players` in `plugdev.yml`; `plugdev open --name <player>`
- Mod CLI honesty: `--loader` maps to Gradle subproject; `--datagen` / `--test`; legacy Forge detection; mod-aware `setup` / `doctor`
- Network: build + deploy Velocity proxy plugin JAR; auto-join client to proxy; watch rebuilds with restart hint

### [changed]
- Doctor reports client **ready** (integrity) not merely cached
- Client-launch docs: Prism Microsoft account default; multi-player flow

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
