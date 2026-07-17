import { spawn, type ChildProcess } from "node:child_process";
import { success, info, dumpLogTail } from "../util/log.js";
import { Errors } from "../util/errors.js";
import type { LogMode } from "../util/output.js";
import {
  getResolvedJava,
  javaChildEnv,
  type ResolvedJava,
} from "../util/tools.js";
import { createServerLogWriter } from "./server-log-stream.js";

export interface ServerProcess {
  proc: ChildProcess;
  waitForReady: Promise<void>;
  logRing: string[];
  /** Detach stdout/stderr listeners (call on stop / exit). */
  detachLogs: () => void;
}

export interface JavaProcessOptions {
  debugPort?: number;
  pluginName?: string;
  readyPattern?: RegExp;
  /** Extra JVM flags (before -jar), from plugdev.yml jvm.args */
  jvmArgs?: string[];
  /** Args after the server JAR (default: nogui) */
  args?: string[];
  logMode?: LogMode;
  background?: boolean;
  /** Absolute java path from resolveJava / requireJava */
  java?: ResolvedJava | null;
}

const RING_MAX_LINES = 120;

/** Write to child stdin without throwing EPIPE when the pipe is already closed. */
export function safeStdinWrite(
  stdin: NodeJS.WritableStream | null | undefined,
  data: string,
): void {
  if (!stdin || stdin.destroyed || !stdin.writable) return;
  try {
    stdin.write(data, (err) => {
      if (!err) return;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPIPE" || code === "ERR_STREAM_DESTROYED") return;
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPIPE" || code === "ERR_STREAM_DESTROYED") return;
    throw err;
  }
}

function pushRing(ring: string[], text: string): void {
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    ring.push(line);
  }
  while (ring.length > RING_MAX_LINES) ring.shift();
}

export function startJavaProcess(
  runDir: string,
  serverJar: string,
  memory: string,
  opts: JavaProcessOptions = {},
): ServerProcess {
  const logMode = opts.logMode ?? "verbose";
  const logRing: string[] = [];
  const logWriter = createServerLogWriter(logMode);
  // JVM flags first, then -jar, then server args (nogui)
  const jvmExtra = opts.jvmArgs ?? [];
  const serverArgs = opts.args ?? ["nogui"];
  const args = [`-Xmx${memory}`, ...jvmExtra, "-jar", serverJar, ...serverArgs];
  if (opts.debugPort) {
    args.unshift(
      `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${opts.debugPort}`,
    );
  }

  const readyPattern = opts.readyPattern ?? /Done \(|Timings Reset/;
  const pluginName = opts.pluginName;
  const java = opts.java ?? getResolvedJava();
  const javaPath = java?.path ?? "java";

  const proc = spawn(javaPath, args, {
    cwd: runDir,
    detached: opts.background ?? false,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...javaChildEnv(java),
      PLUGDEV: "true",
    },
    // Avoid cmd.exe wrapping on Windows for absolute paths
    windowsHide: true,
  });

  proc.stdin?.on("error", (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPIPE" || code === "ERR_STREAM_DESTROYED") return;
  });

  let pluginError: string | undefined;
  let readySettled = false;
  let listenersAttached = true;

  const detachLogs = () => {
    if (!listenersAttached) return;
    listenersAttached = false;
    logWriter.flush();
    proc.stdout?.off("data", onData);
    proc.stderr?.off("data", onErr);
  };

  const onData = (chunk: Buffer) => {
    const text = chunk.toString();
    pushRing(logRing, text);
    logWriter.writeChunk(chunk, process.stdout);
    if (pluginName && text.includes(`Error occurred while enabling ${pluginName}`)) {
      pluginError = pluginName;
    }
    if (!readySettled && readyPattern.test(text)) {
      readySettled = true;
      clearTimeout(timeout);
      logWriter.markReady();
      // Keep streaming — do not detach stdout/stderr on ready
      if (pluginError) {
        if (logMode === "quiet") dumpLogTail(logRing);
        rejectReady(Errors.pluginEnableFailed(pluginError));
      } else {
        resolveReady();
      }
    }
  };

  const onErr = (chunk: Buffer) => {
    const text = chunk.toString();
    pushRing(logRing, text);
    logWriter.writeChunk(chunk, process.stderr);
    if (pluginName && text.includes(`Error occurred while enabling ${pluginName}`)) {
      pluginError = pluginName;
    }
    if (!readySettled && readyPattern.test(text)) {
      readySettled = true;
      clearTimeout(timeout);
      logWriter.markReady();
      if (pluginError) {
        if (logMode === "quiet") dumpLogTail(logRing);
        rejectReady(Errors.pluginEnableFailed(pluginError));
      } else {
        resolveReady();
      }
    }
  };

  let resolveReady!: () => void;
  let rejectReady!: (err: Error) => void;
  const timeout = setTimeout(() => {
    if (readySettled) return;
    readySettled = true;
    if (logMode === "quiet") dumpLogTail(logRing);
    rejectReady(Errors.serverStartFailed("Timed out waiting for server (240s)."));
  }, 240_000);

  const waitForReady = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const onExit = (code: number | null) => {
    clearTimeout(timeout);
    detachLogs();
    if (!readySettled) {
      readySettled = true;
      if (logMode === "quiet") dumpLogTail(logRing);
      const detail =
        code === null
          ? "Server exited before becoming ready."
          : `Server exited with code ${code} before becoming ready.`;
      rejectReady(Errors.serverStartFailed(detail));
    }
  };

  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onErr);
  proc.on("exit", onExit);

  return { proc, waitForReady, logRing, detachLogs };
}

export function startPaperServer(
  runDir: string,
  serverJar: string,
  memory: string,
  debugPort?: number,
  pluginName?: string,
  logMode: LogMode = "verbose",
  background = false,
  jvmArgs?: string[],
): ServerProcess {
  return startJavaProcess(runDir, serverJar, memory, {
    debugPort,
    pluginName,
    logMode,
    background,
    jvmArgs,
    // Prefer "Done (" — "Timings Reset" can appear before the game port listens.
    readyPattern: /Done \(/,
    args: ["nogui"],
  });
}

export function stopPaperServer(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }
    proc.once("exit", () => resolve());
    safeStdinWrite(proc.stdin, "stop\n");
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill();
      resolve();
    }, 8000);
  });
}

/** Active procs for the single shared SIGINT/SIGTERM handler (avoids stacking). */
let shutdownProcs: ChildProcess[] = [];
let shutdownHooksAttached = false;

function sharedShutdown(): void {
  for (const proc of shutdownProcs) {
    if (!proc.killed && proc.exitCode === null) {
      safeStdinWrite(proc.stdin, "shutdown\n");
      safeStdinWrite(proc.stdin, "stop\n");
    }
  }
  setTimeout(() => {
    for (const proc of shutdownProcs) {
      if (proc.exitCode === null) proc.kill();
    }
  }, 5000);
}

export function attachShutdownHooks(proc: ChildProcess): void {
  attachMultiShutdown([proc]);
}

export function attachMultiShutdown(procs: ChildProcess[]): void {
  shutdownProcs = procs;
  if (shutdownHooksAttached) return;
  shutdownHooksAttached = true;
  process.on("SIGINT", sharedShutdown);
  process.on("SIGTERM", sharedShutdown);
}

export function printReadyBanner(
  port: number,
  pluginName?: string,
  opts?: {
    worldType?: string;
    gamemode?: string;
    peaceful?: boolean;
    onlineMode?: boolean;
    op?: boolean;
  },
): void {
  success("Server ready");
  if (pluginName) success(`Plugin loaded: ${pluginName}`);
  const world = opts?.worldType ?? "flat";
  const gamemode = opts?.gamemode ?? "creative";
  const difficulty = opts?.peaceful === false ? "easy" : "peaceful";
  success(`World: ${world}, ${gamemode}, ${difficulty}`);
  if (opts?.op !== false) {
    success(
      opts?.onlineMode
        ? "You are op (online mode)"
        : "You are op (offline mode)",
    );
  }
  info(`Join: 127.0.0.1:${port}`);
  info("Tip: first boot remaps plugins (~10–30s); later boots are much faster.");
  info("Live config: .config open | .config set key value (same terminal)");
  info("Ctrl+C stops the server — closing Minecraft does not.");
}
