import {
  access,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { isAbsolute, join, relative, sep } from "node:path";
import { projectRunDir } from "../paths.js";
import {
  readPlugdevYml,
  writeConfigEditorToYml,
  writeWatchedConfigsToYml,
} from "../deps/config-write.js";

const EDITABLE_EXTENSIONS = new Set([
  ".yml",
  ".yaml",
  ".json",
  ".toml",
  ".properties",
  ".conf",
]);

export const CONFIG_EDITORS = ["auto", "cursor", "code", "notepad", "system"] as const;
export type ConfigEditor = (typeof CONFIG_EDITORS)[number];

export interface LiveConfigFile {
  path: string;
  absolutePath: string;
  watched: boolean;
}

export interface LiveConfigListing {
  dataDir?: string;
  files: LiveConfigFile[];
}

export interface EditorCandidate {
  command: string;
  args: string[];
  label: string;
}

function extension(path: string): string {
  const name = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

export function isEditableConfigPath(path: string): boolean {
  return EDITABLE_EXTENSIONS.has(extension(path));
}

export function normalizeLiveConfigPath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("\0")) {
    throw new Error("Config path must not be empty");
  }
  if (
    isAbsolute(trimmed) ||
    /^[a-zA-Z]:\//.test(trimmed) ||
    trimmed.startsWith("//")
  ) {
    throw new Error("Config path must be relative to the plugin data folder");
  }
  const parts = trimmed.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) {
    throw new Error("Config path must stay inside the plugin data folder");
  }
  return parts.join("/");
}

export function normalizeConfigEditor(value: string): ConfigEditor {
  const trimmed = value.trim().toLowerCase();
  if ((CONFIG_EDITORS as readonly string[]).includes(trimmed)) {
    return trimmed as ConfigEditor;
  }
  throw new Error(
    `Unknown config editor: ${value} (use ${CONFIG_EDITORS.join("|")})`,
  );
}

function pathIsInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function resolvePluginDataDir(
  cwd: string,
  pluginName: string,
): Promise<string | undefined> {
  const pluginsDir = join(projectRunDir(cwd), "plugins");
  const exact = join(pluginsDir, pluginName);
  if (await isDirectory(exact)) return realpath(exact);

  let entries;
  try {
    entries = await readdir(pluginsDir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  const match = entries.find(
    (entry) => entry.isDirectory() && entry.name.toLowerCase() === pluginName.toLowerCase(),
  );
  return match ? join(pluginsDir, match.name) : undefined;
}

async function walkConfigFiles(
  root: string,
  dir: string,
  output: string[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkConfigFiles(root, path, output);
    } else if (entry.isFile() && isEditableConfigPath(entry.name)) {
      const resolved = await realpath(path);
      if (pathIsInside(root, resolved)) output.push(resolved);
    }
  }
}

export async function listLiveConfigFiles(
  cwd: string,
  pluginName: string,
  watchedPaths: string[] = ["config.yml"],
): Promise<LiveConfigListing> {
  const dataDir = await resolvePluginDataDir(cwd, pluginName);
  if (!dataDir) return { files: [] };
  const root = await realpath(dataDir);
  const paths: string[] = [];
  await walkConfigFiles(root, root, paths);
  const watched = new Set(
    watchedPaths.map((path) => normalizeLiveConfigPath(path).toLowerCase()),
  );
  const files = paths
    .map((absolutePath) => {
      const path = relative(root, absolutePath).split(sep).join("/");
      return {
        path,
        absolutePath,
        watched: watched.has(path.toLowerCase()),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  return { dataDir, files };
}

export async function resolveLiveConfigFile(
  cwd: string,
  pluginName: string,
  input: string,
): Promise<string> {
  const path = normalizeLiveConfigPath(input);
  if (!isEditableConfigPath(path)) {
    throw new Error(`Unsupported config file type: ${path}`);
  }
  const dataDir = await resolvePluginDataDir(cwd, pluginName);
  if (!dataDir) {
    throw new Error("Plugin data folder not found — run PlugDev once so the plugin can create it");
  }
  const root = await realpath(dataDir);
  const candidate = join(root, ...path.split("/"));
  await access(candidate, constants.F_OK).catch(() => {
    throw new Error(`Live config file not found: ${path}`);
  });
  const resolved = await realpath(candidate);
  if (!pathIsInside(root, resolved) || !(await stat(resolved)).isFile()) {
    throw new Error("Config path must stay inside the plugin data folder");
  }
  return resolved;
}

export async function readWatchedConfigPaths(cwd: string): Promise<string[]> {
  const raw = (await readPlugdevYml(cwd))?.raw;
  const value = raw?.watch?.configs;
  const configured = value === undefined
    ? ["config.yml"]
    : Array.isArray(value)
      ? value
      : [];
  const unique = new Set<string>();
  for (const entry of configured) {
    try {
      unique.add(normalizeLiveConfigPath(entry));
    } catch {
      // Schema validation reports invalid values; the watcher ignores them safely.
    }
  }
  return [...unique];
}

export async function setLiveConfigWatched(
  cwd: string,
  input: string,
  watched: boolean,
): Promise<string[]> {
  const path = normalizeLiveConfigPath(input);
  if (!isEditableConfigPath(path)) {
    throw new Error(`Unsupported config file type: ${path}`);
  }
  const current = await readWatchedConfigPaths(cwd);
  const same = (value: string) => value.toLowerCase() === path.toLowerCase();
  const next = watched
    ? current.some(same) ? current : [...current, path]
    : current.filter((entry) => !same(entry));
  const result = await writeWatchedConfigsToYml(cwd, next);
  if (!result.ok) throw new Error(result.reason);
  return next;
}

export async function readConfigEditor(cwd: string): Promise<ConfigEditor> {
  const value = (await readPlugdevYml(cwd))?.raw?.dev?.configEditor;
  if (!value) return "auto";
  try {
    return normalizeConfigEditor(value);
  } catch {
    return "auto";
  }
}

export async function setConfigEditor(
  cwd: string,
  editor: ConfigEditor,
): Promise<ConfigEditor> {
  const normalized = normalizeConfigEditor(editor);
  const result = await writeConfigEditorToYml(cwd, normalized);
  if (!result.ok) throw new Error(result.reason);
  return normalized;
}

function splitEditorCommand(value: string): { command: string; args: string[] } | undefined {
  const parts = value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) =>
    part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part,
  );
  if (!parts?.length) return undefined;
  return { command: parts[0]!, args: parts.slice(1) };
}

function systemOpener(
  file: string,
  platform: NodeJS.Platform,
): EditorCandidate {
  if (platform === "win32") {
    // Default association via PowerShell — never cmd/start (that leaves empty consoles).
    return windowsPowerShellStartProcess(file);
  }
  if (platform === "darwin") return { command: "open", args: [file], label: "system" };
  return { command: "xdg-open", args: [file], label: "system" };
}

function notepadCandidate(
  file: string,
  platform: NodeJS.Platform,
): EditorCandidate {
  if (platform === "win32") {
    return { command: "notepad.exe", args: [file], label: "notepad" };
  }
  return systemOpener(file, platform);
}

export function editorCandidates(
  file: string,
  preference: ConfigEditor = "auto",
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): EditorCandidate[] {
  if (preference === "cursor") {
    return [{ command: "cursor", args: ["--reuse-window", file], label: "cursor" }];
  }
  if (preference === "code") {
    return [{ command: "code", args: ["--reuse-window", file], label: "code" }];
  }
  if (preference === "notepad") {
    return [notepadCandidate(file, platform)];
  }
  if (preference === "system") {
    return [systemOpener(file, platform)];
  }

  const candidates: EditorCandidate[] = [];
  for (const value of [env.VISUAL, env.EDITOR]) {
    if (!value?.trim()) continue;
    const parsed = splitEditorCommand(value.trim());
    if (parsed) {
      candidates.push({
        command: parsed.command,
        args: [...parsed.args, file],
        label: "env",
      });
    }
  }
  candidates.push({ command: "cursor", args: ["--reuse-window", file], label: "cursor" });
  candidates.push({ command: "code", args: ["--reuse-window", file], label: "code" });
  if (platform === "win32") {
    candidates.push({ command: "notepad.exe", args: [file], label: "notepad" });
  }
  candidates.push(systemOpener(file, platform));
  return candidates;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Launch a GUI app or open a file with the default association, without a console window.
 * Uses PowerShell Start-Process (hidden host) — never cmd.exe / start.
 */
export function windowsPowerShellStartProcess(
  fileOrExe: string,
  exeArgs: string[] = [],
  label = "system",
): EditorCandidate {
  const command =
    exeArgs.length > 0
      ? `Start-Process -FilePath ${psQuote(fileOrExe)} -ArgumentList ${exeArgs.map(psQuote).join(",")}`
      : `Start-Process -FilePath ${psQuote(fileOrExe)}`;
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", command],
    label,
  };
}

/** Spawn options for live-config editors — never detached on Windows (avoids empty cmd). */
export function editorChildSpawnOptions(
  platform: NodeJS.Platform = process.platform,
): {
  detached: boolean;
  stdio: "ignore";
  windowsHide: boolean;
  shell: false;
} {
  return {
    // detached + cmd/console apps → visible empty console on Windows
    detached: false,
    stdio: "ignore",
    windowsHide: platform === "win32",
    shell: false,
  };
}

function spawnOnce(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, editorChildSpawnOptions(platform));
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    child.once("error", (err) => settle(() => reject(err)));
    child.once("spawn", () => {
      child.unref();
      settle(() => resolve());
    });
  });
}

async function spawnEditorProcess(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (platform !== "win32") {
    await spawnOnce(command, args, platform);
    return;
  }

  // Already a PowerShell Start-Process candidate (system opener).
  if (command.toLowerCase() === "powershell.exe") {
    await spawnOnce(command, args, platform);
    return;
  }

  // Prefer direct GUI spawn (notepad.exe, cursor, code) — no host console.
  try {
    await spawnOnce(command, args, platform);
  } catch {
    // Fallback: hidden PowerShell Start-Process (still no cmd.exe).
    const fallback = windowsPowerShellStartProcess(command, args, "powershell");
    await spawnOnce(fallback.command, fallback.args, platform);
  }
}

export async function openExternalEditor(
  file: string,
  preference: ConfigEditor = "auto",
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<{ command: string; label: string }> {
  const failures: string[] = [];
  for (const candidate of editorCandidates(file, preference, env, platform)) {
    try {
      await spawnEditorProcess(candidate.command, candidate.args, platform);
      return { command: candidate.command, label: candidate.label };
    } catch (error) {
      failures.push(
        `${candidate.command}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(`Could not open an editor for ${file}\n${failures.join("\n")}`);
}

export const CONFIG_EDITOR_PICKER_OPTIONS: Array<{
  id: Exclude<ConfigEditor, "auto">;
  label: string;
}> = [
  { id: "cursor", label: "Cursor" },
  { id: "code", label: "VS Code" },
  { id: "notepad", label: "Notepad" },
  { id: "system", label: "System default" },
];
