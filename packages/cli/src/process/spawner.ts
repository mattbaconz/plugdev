import { spawn, type ChildProcess } from "node:child_process";
import { success, info, dumpLogTail } from "../util/log.js";
import { Errors } from "../util/errors.js";
import type { LogMode } from "../util/output.js";

export interface ServerProcess {
  proc: ChildProcess;
  waitForReady: Promise<void>;
  logRing: string[];
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
}

const RING_MAX_LINES = 120;

function pushRing(ring: string[], text: string): void {
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    ring.push(line);
  }
  while (ring.length > RING_MAX_LINES) ring.shift();
}

function writeServerOutput(chunk: Buffer, logMode: LogMode, stream: NodeJS.WriteStream): void {
  if (logMode === "verbose") {
    stream.write(chunk);
  }
}

export function startJavaProcess(
  runDir: string,
  serverJar: string,
  memory: string,
  opts: JavaProcessOptions = {},
): ServerProcess {
  const logMode = opts.logMode ?? "verbose";
  const logRing: string[] = [];
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

  const proc = spawn("java", args, {
    cwd: runDir,
    detached: opts.background ?? false,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PLUGDEV: "true",
    },
  });

  let pluginError: string | undefined;

  const waitForReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (logMode === "quiet") dumpLogTail(logRing);
      reject(Errors.serverStartFailed("Timed out waiting for server (240s)."));
    }, 240_000);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      pushRing(logRing, text);
      writeServerOutput(chunk, logMode, process.stdout);
      if (pluginName && text.includes(`Error occurred while enabling ${pluginName}`)) {
        pluginError = pluginName;
      }
      if (readyPattern.test(text)) {
        clearTimeout(timeout);
        cleanup();
        if (pluginError) {
          if (logMode === "quiet") dumpLogTail(logRing);
          reject(Errors.pluginEnableFailed(pluginError));
        } else {
          resolve();
        }
      }
    };

    const onErr = (chunk: Buffer) => {
      const text = chunk.toString();
      pushRing(logRing, text);
      writeServerOutput(chunk, logMode, process.stderr);
      if (pluginName && text.includes(`Error occurred while enabling ${pluginName}`)) {
        pluginError = pluginName;
      }
      if (readyPattern.test(text)) {
        clearTimeout(timeout);
        cleanup();
        if (pluginError) {
          if (logMode === "quiet") dumpLogTail(logRing);
          reject(Errors.pluginEnableFailed(pluginError));
        } else {
          resolve();
        }
      }
    };

    const onExit = (code: number | null) => {
      clearTimeout(timeout);
      cleanup();
      if (code !== 0 && code !== null) {
        if (logMode === "quiet") dumpLogTail(logRing);
        reject(Errors.serverStartFailed(`Server exited with code ${code}.`));
      }
    };

    const cleanup = () => {
      proc.stdout?.off("data", onData);
      proc.stderr?.off("data", onErr);
      proc.off("exit", onExit);
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onErr);
    proc.on("exit", onExit);
  });

  return { proc, waitForReady, logRing };
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
    readyPattern: /Done \(|Timings Reset/,
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
    proc.stdin?.write("stop\n");
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill();
      resolve();
    }, 8000);
  });
}

export function attachShutdownHooks(proc: ChildProcess): void {
  attachMultiShutdown([proc]);
}

export function attachMultiShutdown(procs: ChildProcess[]): void {
  const shutdown = () => {
    for (const proc of procs) {
      if (!proc.killed && proc.exitCode === null) {
        proc.stdin?.write("shutdown\n");
        proc.stdin?.write("stop\n");
      }
    }
    setTimeout(() => {
      for (const proc of procs) {
        if (proc.exitCode === null) proc.kill();
      }
    }, 5000);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
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
  info(`Join: localhost:${port}`);
  info("Tip: first boot remaps plugins (~10–30s); later boots are much faster.");
  info("Type server commands below (e.g. op DevPlayer). Ctrl+C stops PlugDev.");
  info("Ctrl+C stops the server — closing Minecraft does not.");
}
