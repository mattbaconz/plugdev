export type JsonResult = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  hint?: string;
  code?: string;
};

/** Find the last parseable {"ok":...} JSON object in mixed CLI output. */
export function parsePlugdevJson(combined: string): JsonResult | null {
  const lines = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{"ok"'));

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]!) as JsonResult;
    } catch {
      // try previous line
    }
  }

  const start = combined.lastIndexOf('{"ok"');
  if (start >= 0) {
    const slice = combined.slice(start);
    for (let end = slice.length; end > 0; end--) {
      try {
        return JSON.parse(slice.slice(0, end)) as JsonResult;
      } catch {
        // shrink
      }
    }
  }

  return null;
}
