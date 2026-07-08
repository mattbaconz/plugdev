import pc from "picocolors";
import { isJsonMode } from "./output.js";

let phaseCounter = 0;

export function resetPhases(): void {
  phaseCounter = 0;
}

export function banner(version: string): void {
  if (isJsonMode()) return;
  console.log("");
  console.log(pc.bold(`PlugDev ${version}`));
  console.log(pc.dim("─".repeat(36)));
}

export function phase(label: string, state: "active" | "done" = "done"): void {
  if (isJsonMode()) return;
  if (state === "active") {
    console.log(pc.cyan("  … ") + label);
    return;
  }
  phaseCounter += 1;
  console.log(pc.green(`  ${phaseCounter}. ✓ `) + label);
}

export function log(msg: string): void {
  if (isJsonMode()) return;
  console.log(msg);
}

export function info(msg: string): void {
  if (isJsonMode()) return;
  console.log(pc.cyan("  ℹ ") + msg);
}

export function success(msg: string): void {
  if (isJsonMode()) return;
  console.log(pc.green("  ✓ ") + msg);
}

export function warn(msg: string): void {
  if (isJsonMode()) return;
  console.log(pc.yellow("  ⚠ ") + msg);
}

export function error(msg: string): void {
  if (isJsonMode()) return;
  console.error(pc.red("  ✗ ") + msg);
}

export function step(label: string, state: "active" | "done"): void {
  if (isJsonMode()) return;
  if (state === "active") {
    console.log(pc.dim(`  … ${label}`));
  } else {
    console.log(pc.green("  ✓ ") + label);
  }
}

export function heading(msg: string): void {
  if (isJsonMode()) return;
  console.log(pc.bold(msg));
}

export function dumpLogTail(lines: string[]): void {
  if (isJsonMode() || lines.length === 0) return;
  warn("Recent server log:");
  for (const line of lines.slice(-25)) {
    if (line.trim()) console.log(pc.dim(`    ${line}`));
  }
}
