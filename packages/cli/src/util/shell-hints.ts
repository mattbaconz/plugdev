/** User-facing next-step lines that work in PowerShell 5.1, pwsh, cmd, and bash. */

export function isWindowsShell(): boolean {
  return process.platform === "win32";
}

/** One-liner when `plug` / `plugdev` is not on PATH. */
export function npxRunHint(): string {
  return "npx @plugdev/cli@latest run";
}

/**
 * Print-ready steps after init.
 * Prefer global `plug` / `plugdev` bins; fall back to npx when requested.
 */
export function initNextSteps(opts?: {
  usedNpx?: boolean;
  globalPreferred?: boolean;
  agents?: boolean;
  mcp?: boolean;
}): string[] {
  const flags = [
    "--setup",
    opts?.agents ? "--agents" : null,
    opts?.mcp ? "--mcp" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const initCmd = `plugdev init ${flags}`.trimEnd();
  if (opts?.usedNpx) {
    return [
      `npx @plugdev/cli@latest init ${flags}`.trimEnd(),
      "npx @plugdev/cli@latest run",
    ];
  }
  // Global install is the primary UX (plug + plugdev bins)
  if (opts?.globalPreferred !== false) {
    return ["npm i -g @plugdev/cli@latest", initCmd, "plug run"];
  }
  return ["npm install", "npm run setup", "npm run dev"];
}

export function formatNextSteps(steps: string[]): string {
  return steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
}
