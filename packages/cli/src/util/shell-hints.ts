/** User-facing next-step lines that work in PowerShell 5.1, pwsh, cmd, and bash. */

export function isWindowsShell(): boolean {
  return process.platform === "win32";
}

/**
 * Print-ready steps after init.
 * Prefer global `plug` / `plugdev` bins; fall back to npx when requested.
 */
export function initNextSteps(opts?: {
  usedNpx?: boolean;
  globalPreferred?: boolean;
}): string[] {
  if (opts?.usedNpx) {
    return ["npx @plugdev/cli@latest setup", "npx @plugdev/cli@latest run"];
  }
  // Global install is the primary UX (plug + plugdev bins)
  if (opts?.globalPreferred !== false) {
    return [
      "npm install -g @plugdev/cli",
      "plugdev init --setup",
      "plug run",
    ];
  }
  return ["npm install", "npm run setup", "npm run dev"];
}

export function formatNextSteps(steps: string[]): string {
  return steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
}
