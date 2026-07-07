#!/usr/bin/env node
import { Command } from "commander";
import { CLI_VERSION } from "./constants.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runDev } from "./commands/dev.js";
import { runOpen } from "./commands/open.js";
import { runClientSetup, runClientDetect } from "./commands/client.js";
import { runNetwork } from "./commands/network.js";
import {
  runCacheStatus,
  runCacheClear,
  runDepsAdd,
  runDepsList,
  runDepsRemove,
} from "./commands/cache.js";

const program = new Command();

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
  };
}

program
  .name("plugdev")
  .description("npm run dev for Minecraft plugins and mods")
  .version(CLI_VERSION, "-V");

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
  .action(async (opts: { force?: boolean }) => {
    process.exit(await runInit(process.cwd(), opts.force));
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
  .command("setup")
  .description("Provision and validate Prism instance for this MC version")
  .option("--force", "Reprovision instance mmc-pack.json")
  .option("--download", "Hint to launch instance in Prism for asset download")
  .action(async (opts: { force?: boolean; download?: boolean }) => {
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
