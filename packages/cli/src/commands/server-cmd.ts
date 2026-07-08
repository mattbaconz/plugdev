import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { detectProject } from "../detect/project.js";
import { loadConfig, type CliOverrides } from "../config/loader.js";
import { ensureServerJar, resolveServerProject } from "../cache/server.js";
import { prepareRunDirectory, copyPaperToRun } from "../cache/run-template.js";
import {
  runGradleBuild,
  runMavenBuild,
  deployPluginJar,
  deployBootstrapJar,
} from "../build/gradle.js";
import { startPaperServer } from "../process/spawner.js";
import { sendRconCommand } from "../process/rcon.js";
import { installDeps } from "../deps/hangar.js";
import { projectRunDir, bootstrapCacheDir } from "../paths.js";
import {
  readSession,
  writeSession,
  clearSession,
  isProcessRunning,
  generateRconPassword,
  type ServerSession,
} from "../session.js";
import { isPortAvailable } from "../util/port.js";
import { requireJava21 } from "../util/tools.js";
import { heading, info, success } from "../util/log.js";
import { isJsonMode, emitJson, getLogMode } from "../util/output.js";
import { formatError, getExitCode, Errors } from "../util/errors.js";
import { CLI_VERSION } from "../constants.js";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

async function resolveBootstrapJar(): Promise<string> {
  const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const candidates = [
    join(cliRoot, "bootstrap", "plugdev-bootstrap-paper.jar"),
    join(bootstrapCacheDir(), `plugdev-bootstrap-paper-${CLI_VERSION}.jar`),
  ];
  for (const p of candidates) {
    try {
      await access(p, constants.F_OK);
      return p;
    } catch {
      // try next
    }
  }
  throw Errors.bootstrapMissing();
}

function serverSoftware(config: { server: string }): string {
  return config.server;
}

export async function runServerStart(
  cwd: string,
  overrides: CliOverrides = {},
): Promise<number> {
  try {
    await requireJava21();
    const existing = await readSession(cwd);
    if (existing && isProcessRunning(existing.pid)) {
      if (isJsonMode()) {
        emitJson({
          ok: true,
          data: { alreadyRunning: true, port: existing.gamePort, pid: existing.pid },
        });
        return 0;
      }
      info(`Server already running (pid ${existing.pid}, port ${existing.gamePort})`);
      return 0;
    }

    const project = await detectProject(cwd);
    const config = await loadConfig(cwd, project, overrides);

    if (!(await isPortAvailable(config.port))) {
      throw Errors.portInUse(config.port);
    }

    const rconPort = config.port + 10000;
    if (!(await isPortAvailable(rconPort))) {
      throw Errors.portInUse(rconPort);
    }

    const rconPassword = generateRconPassword();
    const serverProject = resolveServerProject(config.server);
    const serverJarInfo = await ensureServerJar(config.version, serverProject);
    const runDir = await prepareRunDirectory(cwd, config, {
      rconPort,
      rconPassword,
    });
    const serverJar = await copyPaperToRun(runDir, serverJarInfo.jarPath);
    const pluginsDir = join(runDir, "plugins");

    const build =
      project.buildSystem === "maven"
        ? await runMavenBuild(cwd)
        : await runGradleBuild(cwd, config, project);
    const devJar = await deployPluginJar(build.jarPath, pluginsDir, project.pluginName);
    const bootstrap = await resolveBootstrapJar();
    await deployBootstrapJar(bootstrap, pluginsDir);

    if (config.deps?.length) {
      await installDeps(pluginsDir, config.deps, config.server, config.version);
    }

    const { proc, waitForReady } = startPaperServer(
      runDir,
      serverJar,
      config.jvm.memory,
      config.jvm.debugPort > 0 ? config.jvm.debugPort : undefined,
      project.pluginName,
      getLogMode(),
      overrides.detach !== false,
    );

    await waitForReady;

    const session: ServerSession = {
      pid: proc.pid!,
      gamePort: config.port,
      rconPort,
      rconPassword,
      rconHost: "127.0.0.1",
      runDir,
      version: config.version,
      software: serverSoftware(config),
      pluginName: project.pluginName,
      startedAt: new Date().toISOString(),
    };
    await writeSession(cwd, session);

    proc.on("exit", () => {
      void clearSession(cwd);
    });

    if (overrides.detach !== false) {
      proc.unref?.();
    } else {
      await new Promise<void>((resolve) => proc.on("exit", () => resolve()));
    }

    if (!isJsonMode()) {
      heading("PlugDev server\n");
      success(`Server ready on localhost:${config.port}`);
      info(`RCON: ${session.rconHost}:${rconPort}`);
      info(`Plugin: ${devJar}`);
    } else {
      emitJson({
        ok: true,
        data: {
          port: config.port,
          rconPort,
          pid: proc.pid,
          version: config.version,
          software: session.software,
          pluginName: project.pluginName,
          jarPath: devJar,
        },
      });
    }

    return 0;
  } catch (e) {
    if (isJsonMode()) {
      emitJson({ ok: false, error: formatError(e, false) });
      return getExitCode(e) ?? 1;
    }
    console.error(formatError(e, false));
    return getExitCode(e) ?? 1;
  }
}

export async function runServerStop(cwd: string): Promise<number> {
  try {
    const session = await readSession(cwd);
    if (!session) {
      if (isJsonMode()) {
        emitJson({ ok: true, data: { stopped: false, reason: "no session" } });
        return 0;
      }
      info("No running server session found");
      return 0;
    }

    if (isProcessRunning(session.pid)) {
      try {
        await sendRconCommand(
          session.rconHost,
          session.rconPort,
          session.rconPassword,
          "stop",
        );
      } catch {
        process.kill(session.pid, "SIGTERM");
      }
    }

    await clearSession(cwd);

    if (isJsonMode()) {
      emitJson({ ok: true, data: { stopped: true, pid: session.pid } });
      return 0;
    }
    success("Server stopped");
    return 0;
  } catch (e) {
    if (isJsonMode()) {
      emitJson({ ok: false, error: formatError(e, false) });
      return getExitCode(e) ?? 1;
    }
    console.error(formatError(e, false));
    return getExitCode(e) ?? 1;
  }
}

export async function runServerStatus(cwd: string): Promise<number> {
  const session = await readSession(cwd);
  const running = session ? isProcessRunning(session.pid) : false;

  if (isJsonMode()) {
    emitJson({
      ok: true,
      data: {
        running,
        port: session?.gamePort,
        version: session?.version,
        software: session?.software,
        pluginName: session?.pluginName,
        pid: session?.pid,
        uptimeSince: session?.startedAt,
      },
    });
    return 0;
  }

  heading("PlugDev server status\n");
  if (!session || !running) {
    info("Server not running");
    return 0;
  }
  success(`Running pid ${session.pid} on port ${session.gamePort}`);
  info(`Version: ${session.version} (${session.software})`);
  return 0;
}

export async function runServerCommand(cwd: string, command: string): Promise<number> {
  try {
    const session = await readSession(cwd);
    if (!session) {
      throw new Error("No server session. Start with: plugdev server start");
    }

    const response = await sendRconCommand(
      session.rconHost,
      session.rconPort,
      session.rconPassword,
      command,
    );

    if (isJsonMode()) {
      emitJson({ ok: true, data: { command, response } });
      return 0;
    }
    success(response || "(no output)");
    return 0;
  } catch (e) {
    if (isJsonMode()) {
      emitJson({ ok: false, error: formatError(e, false) });
      return getExitCode(e) ?? 1;
    }
    console.error(formatError(e, false));
    return getExitCode(e) ?? 1;
  }
}

export async function runServerLogs(cwd: string, lines = 50): Promise<number> {
  try {
    const session = await readSession(cwd);
    const logPath = session
      ? join(session.runDir, "logs", "latest.log")
      : join(projectRunDir(cwd), "logs", "latest.log");

    const content = await readFile(logPath, "utf8");
    const tail = content.split("\n").slice(-lines).join("\n");

    if (isJsonMode()) {
      emitJson({ ok: true, data: { lines: tail.split("\n").filter(Boolean), path: logPath } });
      return 0;
    }
    console.log(tail);
    return 0;
  } catch (e) {
    if (isJsonMode()) {
      emitJson({ ok: false, error: formatError(e, false) });
      return 1;
    }
    console.error(formatError(e, false));
    return 1;
  }
}
