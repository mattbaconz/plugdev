#!/usr/bin/env node
import { Command } from "commander";
import { CLI_VERSION } from "./constants.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runDev } from "./commands/dev.js";
import {
  runCacheStatus,
  runCacheClear,
  runDepsAdd,
} from "./commands/cache.js";

const program = new Command();

program
  .name("plugdev")
  .description("npm run dev for Minecraft Paper plugins")
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
  .command("deps")
  .description("Manage test dependency plugins")
  .argument("<action>", "add")
  .argument("[name]", "dependency name (vault, luckperms)")
  .option("--version <v>", "exact version")
  .action(async (action: string, name: string, opts: { version?: string }) => {
    if (action === "add" && name) {
      process.exit(await runDepsAdd(process.cwd(), name, opts.version));
    }
    console.error("Usage: plugdev deps add <name> [--version]");
    process.exit(1);
  });

program
  .command("watch")
  .description("Start dev server with file watching")
  .action(async () => {
    process.exit(await runDev(process.cwd(), { watch: true }));
  });

program
  .option("--port <n>", "server port", (v) => parseInt(v, 10))
  .option("--version <mc>", "Minecraft version")
  .option("--folia", "use Folia server")
  .option("--server", "use dedicated server (mods) or headless")
  .option("--loader <name>", "mod loader subproject (fabric, neoforge)")
  .option("--no-watch", "disable file watcher")
  .option("--config <path>", "config file path")
  .action(async (opts) => {
    process.exit(
      await runDev(process.cwd(), {
        port: opts.port,
        minecraftVersion: opts.version,
        folia: opts.folia,
        server: opts.server,
        loader: opts.loader,
        noWatch: opts.noWatch,
        configPath: opts.config,
        watch: opts.watch !== false,
      }),
    );
  });

program.parse();
