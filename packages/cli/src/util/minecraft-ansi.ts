/**
 * Convert Minecraft legacy / Adventure hex section codes to ANSI for terminals.
 *
 * Supports:
 * - Legacy: §0–§9 §a–§f (colors), §l/§m/§n/§o (formats), §k (ignored), §r (reset)
 * - Adventure hex: §x§R§R§G§G§B§B
 * - Ampersand form (&) with the same codes (common in configs / some plugins)
 *
 * When colors are disabled (NO_COLOR / non-TTY), codes are stripped instead.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const ITALIC = "\x1b[3m";
const UNDERLINE = "\x1b[4m";
const STRIKE = "\x1b[9m";

const LEGACY_FG: Record<string, string> = {
  "0": "\x1b[30m",
  "1": "\x1b[34m",
  "2": "\x1b[32m",
  "3": "\x1b[36m",
  "4": "\x1b[31m",
  "5": "\x1b[35m",
  "6": "\x1b[33m",
  "7": "\x1b[37m",
  "8": "\x1b[90m",
  "9": "\x1b[94m",
  a: "\x1b[92m",
  b: "\x1b[96m",
  c: "\x1b[91m",
  d: "\x1b[95m",
  e: "\x1b[93m",
  f: "\x1b[97m",
};

const CODE_MARKER = /[§&]/;
const HEX_DIGIT = /[0-9a-f]/i;
const COLOR_OR_FORMAT = /[0-9a-fk-or]/i;

export function colorsEnabledForMinecraft(
  env: NodeJS.ProcessEnv = process.env,
  stdout: { isTTY?: boolean } = process.stdout,
): boolean {
  // FORCE_COLOR wins over NO_COLOR (same as Node / picocolors).
  if (env.FORCE_COLOR != null && env.FORCE_COLOR !== "" && env.FORCE_COLOR !== "0") {
    return true;
  }
  if (env.FORCE_COLOR === "0") return false;
  if (env.NO_COLOR != null && env.NO_COLOR !== "") return false;
  return Boolean(stdout.isTTY);
}

export function hasMinecraftCodes(text: string): boolean {
  for (let i = 0; i < text.length - 1; i++) {
    if (!CODE_MARKER.test(text[i]!)) continue;
    const next = text[i + 1]!;
    if (next === "x" || next === "X") {
      if (looksLikeHexSequence(text, i)) return true;
      continue;
    }
    if (COLOR_OR_FORMAT.test(next)) return true;
  }
  return false;
}

/** Strip legacy / Adventure section (or &) codes without emitting ANSI. */
export function stripMinecraftCodes(text: string): string {
  return transformMinecraftCodes(text, { color: false });
}

/** Render Minecraft codes as ANSI, or strip when color is disabled. */
export function minecraftToAnsi(
  text: string,
  opts?: { color?: boolean },
): string {
  const color = opts?.color ?? colorsEnabledForMinecraft();
  return transformMinecraftCodes(text, { color });
}

function transformMinecraftCodes(
  text: string,
  opts: { color: boolean },
): string {
  let out = "";
  let i = 0;
  let open = false;

  const emitAnsi = (seq: string) => {
    if (!opts.color) return;
    out += seq;
    open = seq !== RESET;
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (!CODE_MARKER.test(ch) || i + 1 >= text.length) {
      out += ch;
      i += 1;
      continue;
    }

    const code = text[i + 1]!;

    if ((code === "x" || code === "X") && looksLikeHexSequence(text, i)) {
      const hex = extractHex(text, i);
      if (opts.color) {
        // Color codes reset formatting in vanilla.
        emitAnsi(RESET);
        emitAnsi(truecolor(hex));
      }
      i += 14;
      continue;
    }

    const lower = code.toLowerCase();
    if (LEGACY_FG[lower]) {
      if (opts.color) {
        emitAnsi(RESET);
        emitAnsi(LEGACY_FG[lower]!);
      }
      i += 2;
      continue;
    }

    if (lower === "l") {
      emitAnsi(BOLD);
      i += 2;
      continue;
    }
    if (lower === "o") {
      emitAnsi(ITALIC);
      i += 2;
      continue;
    }
    if (lower === "n") {
      emitAnsi(UNDERLINE);
      i += 2;
      continue;
    }
    if (lower === "m") {
      emitAnsi(STRIKE);
      i += 2;
      continue;
    }
    if (lower === "k") {
      // Obfuscated — no portable terminal equivalent; drop the code.
      i += 2;
      continue;
    }
    if (lower === "r") {
      emitAnsi(RESET);
      open = false;
      i += 2;
      continue;
    }

    // Not a known code — keep the marker literally.
    out += ch;
    i += 1;
  }

  if (opts.color && open) out += RESET;
  return out;
}

function looksLikeHexSequence(text: string, start: number): boolean {
  // §x §R §R §G §G §B §B  → 14 chars
  if (start + 14 > text.length) return false;
  if (!CODE_MARKER.test(text[start]!)) return false;
  const x = text[start + 1]!;
  if (x !== "x" && x !== "X") return false;
  for (let n = 0; n < 6; n++) {
    const marker = text[start + 2 + n * 2]!;
    const digit = text[start + 3 + n * 2]!;
    if (!CODE_MARKER.test(marker) || !HEX_DIGIT.test(digit)) return false;
  }
  return true;
}

function extractHex(text: string, start: number): string {
  let hex = "";
  for (let n = 0; n < 6; n++) {
    hex += text[start + 3 + n * 2]!;
  }
  return hex.toLowerCase();
}

function truecolor(hex: string): string {
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}
