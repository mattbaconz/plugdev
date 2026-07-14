import pc from "picocolors";
import type { LogMode } from "../util/output.js";
import { isJsonMode } from "../util/output.js";

const ERROR_RE = /\b(ERROR|SEVERE|FATAL)\b/i;
const WARN_RE = /\bWARN(ING)?\b/i;
const EXCEPTION_RE = /\b(Exception|Error|Caused by:)\b/;
const STACK_RE = /^\s+at\s+/;
const STACK_MORE_RE = /^\s+\.\.\.\s+\d+\s+more\b/;

/** True for ERROR/SEVERE/stack/exception lines (and WARN for quiet post-ready). */
export function isNotableServerLine(line: string, includeWarn = true): boolean {
  const t = line.trimEnd();
  if (!t) return false;
  if (ERROR_RE.test(t) || EXCEPTION_RE.test(t) || STACK_RE.test(t) || STACK_MORE_RE.test(t)) {
    return true;
  }
  if (includeWarn && WARN_RE.test(t)) return true;
  return false;
}

/**
 * Boot (verbose): show everything.
 * Boot (quiet): show nothing (caller suppresses).
 * Live (verbose): show everything.
 * Live (quiet): errors/warns/stacks only.
 */
export function shouldShowServerLine(
  line: string,
  logMode: LogMode,
  phase: "boot" | "live",
): boolean {
  if (isJsonMode()) return false;
  if (phase === "boot") return logMode === "verbose";
  if (logMode === "verbose") return true;
  return isNotableServerLine(line, true);
}

export function formatServerLogLine(line: string): string {
  const raw = line.replace(/\r$/, "");
  if (!raw.trim()) return "";
  const prefix = pc.dim("│ ");
  if (ERROR_RE.test(raw) || EXCEPTION_RE.test(raw) || STACK_RE.test(raw) || STACK_MORE_RE.test(raw)) {
    return prefix + pc.red(raw);
  }
  if (WARN_RE.test(raw)) {
    return prefix + pc.yellow(raw);
  }
  return prefix + pc.dim(raw);
}

export interface ServerLogWriter {
  writeChunk(chunk: Buffer, stream?: NodeJS.WriteStream): void;
  markReady(): void;
  /** Flush any incomplete trailing line. */
  flush(): void;
}

/**
 * Line-buffered writer: raw during boot (verbose), formatted after ready.
 * Quiet mode: silent during boot; errors-only after ready.
 */
export function createServerLogWriter(logMode: LogMode): ServerLogWriter {
  let phase: "boot" | "live" = "boot";
  let pending = "";

  const emitLine = (line: string, stream: NodeJS.WriteStream) => {
    if (!shouldShowServerLine(line, logMode, phase)) return;
    if (phase === "boot" && logMode === "verbose") {
      stream.write(line.endsWith("\n") ? line : `${line}\n`);
      return;
    }
    const formatted = formatServerLogLine(line);
    if (formatted) stream.write(`${formatted}\n`);
  };

  return {
    writeChunk(chunk: Buffer, stream: NodeJS.WriteStream = process.stdout) {
      pending += chunk.toString();
      const parts = pending.split(/\r?\n/);
      pending = parts.pop() ?? "";
      for (const line of parts) {
        emitLine(line, stream);
      }
    },
    markReady() {
      // Flush incomplete boot line before switching style
      if (pending) {
        emitLine(pending, process.stdout);
        pending = "";
      }
      phase = "live";
    },
    flush() {
      if (pending) {
        emitLine(pending, process.stdout);
        pending = "";
      }
    },
  };
}

export function printServerConsoleSeparator(): void {
  if (isJsonMode()) return;
  console.log(pc.dim("── server console ──"));
}
