import React from "react";
import { render } from "ink";
import { App } from "../tui/app.js";
import { runDev } from "./dev.js";

export function isInteractiveTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function printNonTtyHelp(binName: string): void {
  console.log(`${binName} — interactive TUI requires a terminal.`);
  console.log("");
  console.log("Commands:");
  console.log(`  ${binName} run       Full test loop (server + watch + join)`);
  console.log(`  ${binName} tui       Open TUI (TTY required)`);
  console.log(`  ${binName} doctor    Check toolchain`);
  console.log(`  ${binName} setup     Prefetch server + client`);
  console.log(`  ${binName} --help    All commands`);
}

/**
 * Launch the PlugDev TUI. Returns after the UI exits.
 * If the user chose "Run test loop", returns { run: true } so the caller can hand off.
 */
export async function runTui(cwd: string): Promise<{ run: boolean }> {
  if (!isInteractiveTty()) {
    return { run: false };
  }

  let runRequested = false;

  const instance = render(
    <App
      cwd={cwd}
      onRunRequested={() => {
        runRequested = true;
      }}
    />,
  );

  await instance.waitUntilExit();
  return { run: runRequested };
}

/** After TUI unmounts, start the same path as `plugdev run`. */
export async function handoffRun(cwd: string): Promise<number> {
  return runDev(cwd, { join: true, watch: true });
}
