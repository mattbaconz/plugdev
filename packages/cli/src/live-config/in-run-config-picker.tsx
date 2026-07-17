import React from "react";
import { render, type Instance } from "ink";
import { ConfigsScreen } from "../tui/screens/Configs.js";
import type { ConfigConsoleContext } from "../process/console-config.js";
import { info } from "../util/log.js";

/**
 * Temporary Ink overlay during `plug run`: pick/open/watch live configs, then return to RCON.
 * Caller must release readline/stdin before invoking (see InteractiveConsole.withStdinOverlay).
 */
export async function runInRunConfigPicker(ctx: ConfigConsoleContext): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    info("Config picker needs a TTY — use .config list / .config open instead");
    return;
  }

  info("Config picker — Esc returns to the server console");

  let instance: Instance | undefined;
  instance = render(
    <ConfigsScreen
      cwd={ctx.cwd}
      pluginName={ctx.pluginName}
      onBack={() => {
        instance?.unmount();
      }}
      onChanged={() => {
        // Status stays on the Configs screen; no toast needed in-run.
      }}
    />,
  );

  await instance.waitUntilExit();
  info("Back to server console — type commands or .config help");
}
