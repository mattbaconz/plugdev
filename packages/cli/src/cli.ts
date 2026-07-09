#!/usr/bin/env node
import { Command } from "commander";
import { CLI_VERSION } from "./constants.js";
import type { CliOverrides } from "./config/loader.js";
import { setJsonMode, setLogMode } from "./util/output.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runSetup } from "./commands/setup.js";
import { runDev } from "./commands/dev.js";
import { runDemo } from "./commands/demo.js";
import { runOpen } from "./commands/open.js";
import { runClientSetup, runClientDetect, runClientList } from "./commands/client.js";
import { runNetwork } from "./commands/network.js";
import { runBuild } from "./commands/build-cmd.js";
import { runSync } from "./commands/sync-cmd.js";
import {
  runServerStart,
  runServerStop,
  runServerStatus,
  runServerCommand,
  runServerLogs,
} from "./commands/server-cmd.js";
import {
  runCacheStatus,
  runCacheClear,
  runCachePrefetch,
  runDepsAdd,
  runDepsList,
  runDepsRemove,
} from "./commands/cache.js";
import { runClean } from "./cache/run-cleanup.js";
import { runAgentInstall } from "./commands/agent.js";

const program = new Command();

function invokedAsPlug(): boolean {
  const base = (process.argv[1] ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  return base === "plug" || base === "plug.js" || base.startsWith("plug.");
}

function devOptions() {
  return {
    port: undefined as number | undefined,
    minecraftVersion: undefined as string | undefined,
    paper: false,
    folia: false,
    purpur: false,
    pufferfish: false,
    spigot: false,
    join: false,
    server: false,
    loader: undefined as string | undefined,
    noWatch: false,
    configPath: undefined as string | undefined,
    debug: false,
    watch: true,
    quiet: false,
  };
}

function parseDevOpts(opts: ReturnType<typeof devOptions>) {
  return {
    port: opts.port,
    minecraftVersion: opts.minecraftVersion,
    paper: opts.paper,
    folia: opts.folia,
    purpur: opts.purpur,
    pufferfish: opts.pufferfish,
    spigot: opts.spigot,
    join: opts.join,
    server: opts.server,
    loader: opts.loader,
    noWatch: opts.noWatch,
    configPath: opts.configPath,
    debug: opts.debug,
    watch: opts.watch !== false,
    quiet: opts.quiet,
  };
}

program
  .name(invokedAsPlug() ? "plug" : "plugdev")
  .description("Dev loop for Minecraft plugins — plug run / plugdev run")
  .version(CLI_VERSION, "-V")
  .option("--json", "emit structured JSON output")
  .option("--quiet", "suppress server logs; show PlugDev steps only")
  .option("--verbose", "show full server output (default)")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.json) setJsonMode(true);
    if (opts.quiet) setLogMode("quiet");
    else setLogMode("verbose");
  });

program
  .command("doctor")
  .description("Check project detection and toolchain")
  .action(async () => {
    process.exit(await runDoctor(process.cwd()));
  });

program
  .command("init")
  .description("Scaffold plugdev.yml and package.json scripts")
  .option("--force", "Overwrite existing plugdev.yml")
  .option("--setup", "Also run plugdev setup (prefetch Paper + client)")
  .action(async (opts: { force?: boolean; setup?: boolean }) => {
    process.exit(
      await runInit(process.cwd(), opts.force, { setup: opts.setup }),
    );
  });

program
  .command("setup")
  .description("Prefetch server + Via* + client; optionally pick Prism instance")
  .option("--instance <id>", "Prism/MultiMC instance folder name (writes plugdev.yml)")
  .action(async (opts: { instance?: string }) => {
    process.exit(await runSetup(process.cwd(), opts));
  });

program
  .command("clean")
  .description("Remove .plugdev/run worlds or the whole run folder")
  .option("--worlds", "Remove world folders only (default)")
  .option("--all", "Remove entire .plugdev/run (keeps ~/.plugdev cache)")
  .option("--force", "Clean even if port/session looks busy")
  .option("--port <n>", "Game port to check", (v) => parseInt(v, 10))
  .action(async (opts: { worlds?: boolean; all?: boolean; force?: boolean; port?: number }) => {
    process.exit(
      await runClean(process.cwd(), {
        worlds: opts.worlds ?? !opts.all,
        all: opts.all,
        force: opts.force,
        port: opts.port,
      }),
    );
  });

const agentCmd = program.command("agent").description("Wire PlugDev into AI coding tools");

agentCmd
  .command("install")
  .description("Add Cursor / Claude Code / Codex project snippets")
  .option("--cursor", "Write .cursor/rules/plugdev.mdc")
  .option("--claude", "Append PlugDev section to CLAUDE.md")
  .option("--codex", "Write or append AGENTS.md")
  .option("--all", "Install all targets (default if none selected)")
  .option("--force", "Overwrite existing snippets")
  .action(
    async (opts: {
      cursor?: boolean;
      claude?: boolean;
      codex?: boolean;
      all?: boolean;
      force?: boolean;
    }) => {
      process.exit(await runAgentInstall(process.cwd(), opts));
    },
  );

program
  .command("demo")
  .description("Run the built-in demo fixture (for recordings)")
  .option("--no-join", "do not auto-join Minecraft client")
  .action(async (opts: { join: boolean }) => {
    const globals = program.opts<{ quiet?: boolean }>();
    process.exit(
      await runDemo({
        join: opts.join,
        quiet: globals.quiet,
      }),
    );
  });

program
  .command("run")
  .description("Full test loop: server + watch + auto-join client")
  .option("--port <n>", "server port", (v) => parseInt(v, 10))
  .option("--version <mc>", "Minecraft version")
  .option("--paper", "use Paper server")
  .option("--folia", "use Folia server")
  .option("--purpur", "use Purpur server")
  .option("--pufferfish", "use Pufferfish server")
  .option("--spigot", "use Spigot server (requires cached jar)")
  .option("--no-watch", "disable file watcher")
  .option("--config <path>", "config file path")
  .option("--debug", "enable JDWP debug port (5005)")
  .action(async (opts) => {
    process.exit(
      await runDev(process.cwd(), {
        ...parseDevOpts({ ...devOptions(), ...opts, join: true }),
      }),
    );
  });

program
  .command("open")
  .description("Copy join address or launch Minecraft client")
  .option("--client", "launch MC client")
  .option("--embedded", "use embedded @xmcl launcher")
  .action(async (opts: { client?: boolean; embedded?: boolean }) => {
    process.exit(await runOpen(process.cwd(), opts));
  });

const clientCmd = program.command("client").description("Minecraft client setup");

clientCmd
  .command("detect")
  .description("Probe Prism/MultiMC install locations")
  .action(async () => {
    process.exit(await runClientDetect(process.cwd()));
  });

clientCmd
  .command("list")
  .description("List Prism/MultiMC instances (folder id + MC version)")
  .action(async () => {
    process.exit(await runClientList(process.cwd()));
  });

clientCmd
  .command("setup")
  .description("Provision and validate Prism instance for this MC version")
  .option("--force", "Reprovision instance mmc-pack.json")
  .option("--download", "Hint to launch instance in Prism for asset download")
  .option("--instance <id>", "Use this instance and write plugdev.yml")
  .action(async (opts: { force?: boolean; download?: boolean; instance?: string }) => {
    process.exit(await runClientSetup(process.cwd(), opts));
  });

const cache = program.command("cache").description("Manage global cache");

cache
  .command("status")
  .description("Show cache sizes")
  .action(async () => {
    process.exit(await runCacheStatus());
  });

cache
  .command("clear")
  .description("Clear cached artifacts")
  .option("--servers", "Clear server JARs only")
  .option("--deps", "Clear dependency plugins only")
  .option("--all", "Clear everything")
  .action(async (opts: { servers?: boolean; deps?: boolean; all?: boolean }) => {
    process.exit(await runCacheClear(opts));
  });

cache
  .command("prefetch")
  .description("Warm server or embedded client cache")
  .option("--version <mc>", "Minecraft version")
  .option("--paper", "prefetch Paper server (default)")
  .option("--folia", "prefetch Folia server")
  .option("--client", "prefetch embedded Minecraft client only")
  .action(async (opts: { version?: string; paper?: boolean; folia?: boolean; client?: boolean }) => {
    process.exit(await runCachePrefetch(opts));
  });

program
  .command("build")
  .description("Build plugin JAR (Gradle/Maven)")
  .action(async () => {
    process.exit(await runBuild(process.cwd()));
  });

program
  .command("sync")
  .description("Build and sync plugin JAR to .plugdev/run/plugins")
  .option("--jar <path>", "use existing JAR instead of building")
  .action(async (opts: { jar?: string }) => {
    process.exit(await runSync(process.cwd(), opts.jar));
  });

const serverCmd = program.command("server").description("Headless dev server (for agents/MCP)");

function serverStartOverrides(cmd: Command): CliOverrides {
  const o = cmd.optsWithGlobals() as Record<string, unknown>;
  return {
    port: typeof o.port === "number" ? o.port : undefined,
    minecraftVersion: typeof o.version === "string" ? o.version : undefined,
    paper: o.paper === true,
    folia: o.folia === true,
    purpur: o.purpur === true,
    detach: o.detach !== false,
  };
}

serverCmd
  .command("start")
  .description("Start dev server without watch or client join")
  .option("--port <n>", "server port", (v) => parseInt(v, 10))
  .option("--version <mc>", "Minecraft version")
  .option("--paper", "use Paper server")
  .option("--folia", "use Folia server")
  .option("--purpur", "use Purpur server")
  .option("--no-detach", "block until server exits")
  .action(async function (this: Command) {
    process.exit(await runServerStart(process.cwd(), serverStartOverrides(this)));
  });

serverCmd
  .command("stop")
  .description("Stop running dev server")
  .action(async () => {
    process.exit(await runServerStop(process.cwd()));
  });

serverCmd
  .command("status")
  .description("Show server running state")
  .action(async () => {
    process.exit(await runServerStatus(process.cwd()));
  });

serverCmd
  .command("command <cmd>")
  .description("Run a server console command via RCON")
  .action(async (cmd: string) => {
    process.exit(await runServerCommand(process.cwd(), cmd));
  });

serverCmd
  .command("logs")
  .description("Tail server logs")
  .option("--lines <n>", "number of lines", (v) => parseInt(v, 10), 50)
  .action(async (opts: { lines: number }) => {
    process.exit(await runServerLogs(process.cwd(), opts.lines));
  });

program
  .command("network")
  .description("Start Velocity proxy + Paper backends from plugdev.yml")
  .option("--config <path>", "config file path")
  .action(async (opts: { config?: string }) => {
    process.exit(await runNetwork(process.cwd(), { configPath: opts.config }));
  });

program
  .command("deps")
  .description("Manage test dependency plugins")
  .argument("<action>", "add | remove | list")
  .argument("[name]", "dependency name (vault, essentials, modrinth slug)")
  .option("--version <v>", "exact version")
  .option("--source <src>", "hangar | modrinth | url", "hangar")
  .option("--url <url>", "direct JAR URL (with --source url)")
  .action(async (action: string, name: string, opts: { version?: string; source?: string; url?: string }) => {
    if (action === "add" && name) {
      process.exit(await runDepsAdd(process.cwd(), name, opts));
    }
    if (action === "remove" && name) {
      process.exit(await runDepsRemove(process.cwd(), name));
    }
    if (action === "list") {
      process.exit(await runDepsList());
    }
    console.error(
      "Usage: plugdev deps add <name> | plugdev deps remove <name> | plugdev deps list",
    );
    process.exit(1);
  });

program
  .command("watch")
  .description("Start dev server with file watching")
  .option("--debug", "enable JDWP debug port (5005)")
  .action(async (opts: { debug?: boolean }) => {
    process.exit(await runDev(process.cwd(), { watch: true, debug: opts.debug }));
  });

program
  .option("--port <n>", "server port", (v) => parseInt(v, 10))
  .option("--version <mc>", "Minecraft version")
  .option("--paper", "use Paper server (default)")
  .option("--folia", "use Folia server")
  .option("--purpur", "use Purpur server")
  .option("--pufferfish", "use Pufferfish server")
  .option("--spigot", "use Spigot server (requires cached jar)")
  .option("--join", "auto-join Minecraft client when server ready")
  .option("--server", "use dedicated server (mods) or headless")
  .option("--loader <name>", "mod loader subproject (fabric, neoforge)")
  .option("--no-watch", "disable file watcher")
  .option("--config <path>", "config file path")
  .option("--debug", "enable JDWP debug port (5005)")
  .action(async (opts) => {
    process.exit(
      await runDev(process.cwd(), parseDevOpts(opts)),
    );
  });

program.parse();
