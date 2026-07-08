import type { JsonResult } from "./output.js";

export interface PlugDevErrorInfo {
  what: string;
  cause: string;
  fix: string;
  hint?: string;
  code?: number;
}

export class PlugDevError extends Error {
  readonly info: PlugDevErrorInfo;

  constructor(info: PlugDevErrorInfo) {
    super(info.what);
    this.name = "PlugDevError";
    this.info = info;
  }
}

export function formatError(err: unknown, debug = false): string {
  if (err instanceof PlugDevError) {
    const lines = [
      err.info.what,
      `  Cause: ${err.info.cause}`,
      `  Fix: ${err.info.fix}`,
    ];
    if (err.info.hint) lines.push(`  Hint: ${err.info.hint}`);
    if (debug && err.stack) {
      lines.push("", err.stack);
    }
    return lines.join("\n");
  }

  if (err instanceof Error) {
    if (debug && err.stack) return `${err.message}\n\n${err.stack}`;
    return err.message;
  }

  return String(err);
}

export function formatErrorJson(err: unknown, debug = false): JsonResult {
  if (err instanceof PlugDevError) {
    return {
      ok: false,
      error: err.info.what,
      code: err.info.code !== undefined ? String(err.info.code) : undefined,
      cause: err.info.cause,
      fix: err.info.fix,
      hint: err.info.hint,
      ...(debug && err.stack ? { data: { stack: err.stack } } : {}),
    };
  }
  if (err instanceof Error) {
    return {
      ok: false,
      error: err.message,
      ...(debug && err.stack ? { data: { stack: err.stack } } : {}),
    };
  }
  return { ok: false, error: String(err) };
}

export function getExitCode(err: unknown): number | undefined {
  if (err instanceof PlugDevError && err.info.code !== undefined) {
    return err.info.code;
  }
  return undefined;
}

export const Errors = {
  missingPluginYml(): PlugDevError {
    return new PlugDevError({
      what: "No plugin.yml or paper-plugin.yml found.",
      cause: "PlugDev could not find plugin metadata under src/main/resources/.",
      fix: "Add plugin.yml to src/main/resources/, or run plugdev init in a Paper plugin project.",
      hint: "Run plugdev doctor to inspect detection.",
      code: 3,
    });
  },

  noBuildSystem(): PlugDevError {
    return new PlugDevError({
      what: "No build system detected.",
      cause: "Neither Gradle (build.gradle / gradlew) nor Maven (pom.xml) was found.",
      fix: "Initialize a Gradle or Maven project, or set build.system in plugdev.yml.",
      code: 3,
    });
  },

  buildFailed(task: string, detail?: string): PlugDevError {
    return new PlugDevError({
      what: `Build failed (${task}).`,
      cause: detail ?? "The build command exited with a non-zero status.",
      fix: "Run the build task manually and fix compilation errors.",
      code: 1,
    });
  },

  noJarFound(task: string): PlugDevError {
    return new PlugDevError({
      what: "No plugin JAR found after build.",
      cause: `Gradle/Maven completed ${task} but no output JAR matched the expected pattern.`,
      fix: "Set build.jarPattern in plugdev.yml (e.g. build/libs/*.jar) or check your jar/shadowJar task.",
      code: 1,
    });
  },

  javaNotFound(): PlugDevError {
    return new PlugDevError({
      what: "Java not found.",
      cause: "The java command is not on PATH and JAVA_HOME may be unset.",
      fix: "Install Java 21+ and ensure java is available in your terminal.",
      hint: "https://adoptium.net/",
      code: 2,
    });
  },

  javaVersionUnsupported(found: string): PlugDevError {
    return new PlugDevError({
      what: `Unsupported Java version (${found}).`,
      cause: "Paper 1.21+ requires Java 21 or newer.",
      fix: "Install JDK 21+ and set JAVA_HOME to point at it.",
      hint: "https://adoptium.net/",
      code: 2,
    });
  },

  portInUse(port: number): PlugDevError {
    return new PlugDevError({
      what: `Port ${port} is already in use.`,
      cause: "Another process (often a Minecraft server) is listening on this port.",
      fix: `Stop the other server or run plugdev --port <number>.`,
      hint: "Try: plugdev server stop",
      code: 2,
    });
  },

  downloadFailed(detail: string): PlugDevError {
    return new PlugDevError({
      what: "Server download failed.",
      cause: detail,
      fix: "Check your network connection, try plugdev cache clear --servers, or pick another --version.",
      code: 2,
    });
  },

  bootstrapMissing(): PlugDevError {
    return new PlugDevError({
      what: "Bootstrap plugin JAR not found.",
      cause: "plugdev-bootstrap-paper.jar was not built or copied into packages/cli/bootstrap/.",
      fix: "From the plugdev repo root, run: npm run build",
      hint: "Required for safe reload during dev.",
      code: 2,
    });
  },

  serverStartFailed(detail: string): PlugDevError {
    return new PlugDevError({
      what: "Dev server failed to start.",
      cause: detail,
      fix: "Check logs in .plugdev/run/logs/latest.log. Run plugdev --debug for more detail.",
      code: 2,
    });
  },

  pluginEnableFailed(name: string): PlugDevError {
    return new PlugDevError({
      what: `Plugin failed to enable: ${name}.`,
      cause: "The server started but reported an error loading your plugin.",
      fix: "Check .plugdev/run/logs/latest.log for stack traces and fix plugin.yml or dependencies.",
      code: 2,
    });
  },

  configInvalid(detail: string): PlugDevError {
    return new PlugDevError({
      what: "Invalid plugdev.yml configuration.",
      cause: detail,
      fix: "Compare your file with spec/plugdev.yml.example and fix schema errors.",
      code: 3,
    });
  },

  unknownProject(): PlugDevError {
    return new PlugDevError({
      what: "Could not detect a Minecraft plugin or mod project.",
      cause: "No plugin.yml, fabric.mod.json, or recognized build files were found.",
      fix: "Run plugdev doctor, or run plugdev init in your project root.",
      code: 3,
    });
  },
};
