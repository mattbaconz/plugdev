import pc from "picocolors";
import { isJsonMode } from "./output.js";

export function createDownloadProgress(
  defaultLabel: string,
): (percent: number | undefined, label?: string) => void {
  let lastPercent = -1;

  return (percent: number | undefined, label?: string) => {
    if (isJsonMode()) return;

    const text = label ?? defaultLabel;
    if (percent !== undefined) {
      if (percent === lastPercent) return;
      lastPercent = percent;
      const line = `${text} ${percent}%`;
      process.stdout.write(`\r${pc.cyan("  … ")}${line.padEnd(64)}`);
      return;
    }

    if (lastPercent < 0) {
      process.stdout.write(`\r${pc.cyan("  … ")}${text.padEnd(64)}`);
    }
  };
}

export function endDownloadProgress(): void {
  if (isJsonMode()) return;
  process.stdout.write("\n");
}
