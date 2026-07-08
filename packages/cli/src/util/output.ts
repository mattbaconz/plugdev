export type JsonResult<T = Record<string, unknown>> = {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
  hint?: string;
  cause?: string;
  fix?: string;
};

export type LogMode = "verbose" | "quiet";

let jsonMode = false;
let logMode: LogMode = "verbose";

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function setLogMode(mode: LogMode): void {
  logMode = mode;
}

export function getLogMode(): LogMode {
  return logMode;
}

export function isQuietMode(): boolean {
  return logMode === "quiet";
}

export function emitJson<T>(payload: JsonResult<T>): void {
  console.log(JSON.stringify(payload));
}

export function emitOk<T extends Record<string, unknown>>(data: T): void {
  if (jsonMode) {
    emitJson({ ok: true, data });
  }
}

export function emitErr(
  message: string,
  extra?: { code?: string; hint?: string; cause?: string; fix?: string },
): void {
  if (jsonMode) {
    emitJson({ ok: false, error: message, ...extra });
  }
}
