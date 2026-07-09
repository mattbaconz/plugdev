import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const logEl = () => document.querySelector("#log") as HTMLPreElement;
const projectEl = () => document.querySelector("#project-dir") as HTMLInputElement;
const cmdInput = () => document.querySelector("#cmd-input") as HTMLInputElement;
const cmdResult = () => document.querySelector("#cmd-result") as HTMLElement;

function appendLog(line: string) {
  const el = logEl();
  el.textContent += (el.textContent ? "\n" : "") + line;
  el.scrollTop = el.scrollHeight;
}

window.addEventListener("DOMContentLoaded", async () => {
  await listen<{ line: string }>("plugdev-log", (ev) => {
    appendLog(ev.payload.line);
  });

  document.querySelector("#btn-start")?.addEventListener("click", async () => {
    const projectDir = projectEl().value.trim();
    if (!projectDir) {
      appendLog("Set a project folder first.");
      return;
    }
    try {
      await invoke("start_run", { projectDir });
    } catch (e) {
      appendLog(`Start failed: ${e}`);
    }
  });

  document.querySelector("#btn-stop")?.addEventListener("click", async () => {
    try {
      await invoke("stop_run");
    } catch (e) {
      appendLog(`Stop failed: ${e}`);
    }
  });

  document.querySelector("#cmd-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const command = cmdInput().value.trim();
    if (!command) return;
    try {
      const out = await invoke<string>("send_console_command", { command });
      cmdResult().textContent = out;
      appendLog(`> ${command}`);
      if (out.trim()) appendLog(out.trim());
      cmdInput().value = "";
    } catch (err) {
      cmdResult().textContent = String(err);
      appendLog(`Command failed: ${err}`);
    }
  });
});
