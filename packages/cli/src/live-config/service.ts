import {
  access,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { execa } from "execa";
import { projectRunDir } from "../paths.js";
import {
  readPlugdevYml,
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

function splitEditorCommand(value: string): { command: string; args: string[] } | undefined {
  const parts = value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) =>
    part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part,
  );
  if (!parts?.length) return undefined;
  return { command: parts[0]!, args: parts.slice(1) };
}

export function editorCandidates(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): EditorCandidate[] {
  const candidates: EditorCandidate[] = [];
  for (const value of [env.VISUAL, env.EDITOR]) {
    if (!value?.trim()) continue;
    const parsed = splitEditorCommand(value.trim());
    if (parsed) candidates.push({ command: parsed.command, args: [...parsed.args, file] });
  }
  candidates.push({ command: "code", args: ["--reuse-window", file] });
  if (platform === "win32") candidates.push({ command: "explorer.exe", args: [file] });
  else if (platform === "darwin") candidates.push({ command: "open", args: [file] });
  else candidates.push({ command: "xdg-open", args: [file] });
  return candidates;
}

export async function openExternalEditor(file: string): Promise<void> {
  const failures: string[] = [];
  for (const candidate of editorCandidates(file)) {
    try {
      await execa(candidate.command, candidate.args, { stdio: "inherit" });
      return;
    } catch (error) {
      failures.push(`${candidate.command}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Could not open an editor for ${file}\n${failures.join("\n")}`);
}
