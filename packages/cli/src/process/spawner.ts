import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { success, info } from "../util/log.js";

export interface ServerProcess {
  proc: ChildProcess;
  waitForReady: Promise<void>;
}

export function startPaperServer(
  runDir: string,
  serverJar: string,
  memory: string,
  debugPort?: number,
): ServerProcess {
  const args = [`-Xmx${memory}`, "-jar", serverJar, "nogui"];
  if (debugPort) {
    args.unshift(
      `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${debugPort}`,
    );
  }

  const proc = spawn("java", args, {
    cwd: runDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PLUGDEV: "true",
    },
  });

  const waitForReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Server start timeout (240s)"));
    }, 240_000);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(chunk);
      if (text.includes("Done (") || text.includes("Timings Reset")) {
        clearTimeout(timeout);
        cleanup();
        resolve();
      }
    };

    const onErr = (chunk: Buffer) => {
      process.stderr.write(chunk);
      const text = chunk.toString();
      if (text.includes("Done (") || text.includes("Timings Reset")) {
        clearTimeout(timeout);
        cleanup();
        resolve();
      }
    };

    const onExit = (code: number | null) => {
      clearTimeout(timeout);
      cleanup();
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}`));
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

export function attachShutdownHooks(proc: ChildProcess): void {
  const shutdown = () => {
    if (!proc.killed) {
      proc.stdin?.write("stop\n");
      setTimeout(() => proc.kill(), 5000);
    }
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
