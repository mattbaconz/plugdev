import { spawn, type ChildProcess } from "node:child_process";
import { success, info } from "../util/log.js";
import { Errors } from "../util/errors.js";

export interface ServerProcess {
  proc: ChildProcess;
  waitForReady: Promise<void>;
}

export interface JavaProcessOptions {
  debugPort?: number;
  pluginName?: string;
  readyPattern?: RegExp;
  args?: string[];
}

export function startJavaProcess(
  runDir: string,
  serverJar: string,
  memory: string,
  opts: JavaProcessOptions = {},
): ServerProcess {
  const args = [`-Xmx${memory}`, "-jar", serverJar, ...(opts.args ?? ["nogui"])];
  if (opts.debugPort) {
    args.unshift(
      `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${opts.debugPort}`,
    );
  }

  const readyPattern = opts.readyPattern ?? /Done \(|Timings Reset/;
  const pluginName = opts.pluginName;

  const proc = spawn("java", args, {
    cwd: runDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PLUGDEV: "true",
    },
  });

  let pluginError: string | undefined;

  const waitForReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(Errors.serverStartFailed("Timed out waiting for server (240s)."));
    }, 240_000);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(chunk);
      if (pluginName && text.includes(`Error occurred while enabling ${pluginName}`)) {
        pluginError = pluginName;
      }
      if (readyPattern.test(text)) {
        clearTimeout(timeout);
        cleanup();
        if (pluginError) {
          reject(Errors.pluginEnableFailed(pluginError));
        } else {
          resolve();
        }
      }
    };

    const onErr = (chunk: Buffer) => {
      process.stderr.write(chunk);
      const text = chunk.toString();
      if (pluginName && text.includes(`Error occurred while enabling ${pluginName}`)) {
        pluginError = pluginName;
      }
      if (readyPattern.test(text)) {
        clearTimeout(timeout);
        cleanup();
        if (pluginError) {
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

  return { proc, waitForReady };
}

export function startPaperServer(
  runDir: string,
  serverJar: string,
  memory: string,
  debugPort?: number,
  pluginName?: string,
): ServerProcess {
  return startJavaProcess(runDir, serverJar, memory, {
    debugPort,
    pluginName,
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

export function printReadyBanner(port: number, pluginName?: string): void {
  success("Server ready");
  if (pluginName) success(`Plugin loaded: ${pluginName}`);
  success("World: flat, creative, peaceful");
  success("You are op (offline mode)");
  info(`Join: localhost:${port}`);
}
