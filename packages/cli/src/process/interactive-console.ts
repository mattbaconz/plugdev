import * as readline from "node:readline";
import pc from "picocolors";
import { sendRconCommand } from "./rcon.js";
import { info, warn } from "../util/log.js";
import { isJsonMode } from "../util/output.js";

export interface InteractiveConsoleOptions {
  host: string;
  port: number;
  password: string;
}

export interface InteractiveConsole {
  pause(): void;
  resume(): void;
  close(): void;
}

/** Shared empty-RCON hint (also used in tests). */
export function emptyRconHint(): string {
  return "RCON: (no output — if the command failed, check ERROR lines above)";
}

/**
 * After the Paper server is ready, forward typed lines to RCON so users keep
 * a console during `plug run` (stdin is otherwise piped and unused).
 */
export function attachInteractiveConsole(
  opts: InteractiveConsoleOptions,
): InteractiveConsole {
  if (isJsonMode() || !process.stdin.isTTY) {
    return {
      pause() {},
      resume() {},
      close() {},
    };
  }

  let paused = false;
  let closed = false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  info("Type server commands below (e.g. list, gamemode creative @a). Ctrl+C stops PlugDev.");
  info("Players are auto-OP on join when dev.op is true (default).");

  const onLine = async (line: string) => {
    if (closed || paused) return;
    const cmd = line.trim();
    if (!cmd) return;
    process.stdout.write(pc.dim(`> ${cmd}\n`));
    try {
      const response = await sendRconCommand(
        opts.host,
        opts.port,
        opts.password,
        cmd,
      );
      if (response.trim()) {
        process.stdout.write(response.endsWith("\n") ? response : `${response}\n`);
      } else {
        warn(emptyRconHint());
      }
      // Brief pause so any ERROR lines from the command can flush on the log stream
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      warn(`RCON: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  rl.on("line", (line) => {
    void onLine(line);
  });

  return {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    close() {
      if (closed) return;
      closed = true;
      rl.close();
    },
  };
}

/** Test helper: route a single command through the same RCON path. */
export async function runConsoleCommand(
  opts: InteractiveConsoleOptions,
  command: string,
): Promise<string> {
  return sendRconCommand(opts.host, opts.port, opts.password, command);
}
