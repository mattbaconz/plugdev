import { spawn } from "node:child_process";
import { platform } from "node:os";

export async function copyToClipboard(text: string): Promise<boolean> {
  const os = platform();

  try {
    if (os === "win32") {
      await runPipe("clip", [], text);
      return true;
    }
    if (os === "darwin") {
      await runPipe("pbcopy", [], text);
      return true;
    }
    if (await commandExists("wl-copy")) {
      await runPipe("wl-copy", [], text);
      return true;
    }
    if (await commandExists("xclip")) {
      await runPipe("xclip", ["-selection", "clipboard"], text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function runPipe(cmd: string, args: string[], stdin: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
    proc.stdin?.write(stdin);
    proc.stdin?.end();
  });
}

function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}
