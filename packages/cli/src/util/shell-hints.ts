/** User-facing next-step lines that work in PowerShell 5.1, pwsh, cmd, and bash. */

export function isWindowsShell(): boolean {
  return process.platform === "win32";
}

/** Print-ready steps after init (no shell `&&` — broken in Windows PowerShell 5.1). */
export function initNextSteps(opts?: { usedNpx?: boolean }): string[] {
  if (opts?.usedNpx) {
    return [
      "npx @plugdev/cli setup",
      "npx @plugdev/cli run",
    ];
  }
  return [
    "npm install",
    "npm run setup",
    "npm run dev",
  ];
}

export function formatNextSteps(steps: string[]): string {
  return steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
}
