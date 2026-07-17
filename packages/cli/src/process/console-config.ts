import {
  listLiveConfigFiles,
  normalizeConfigEditor,
  openExternalEditor,
  readConfigEditor,
  readWatchedConfigPaths,
  resolveLiveConfigFile,
  setConfigEditor,
  setLiveConfigWatched,
} from "../live-config/service.js";
import {
  formatConfigValue,
  getLiveConfigValue,
  parseConfigValue,
  setLiveConfigValue,
} from "../live-config/yaml-values.js";
import { info, success, warn } from "../util/log.js";

export interface ConfigConsoleContext {
  cwd: string;
  pluginName: string;
}

/** True when the line is a PlugDev `.config` meta-command (not RCON). */
export function isConfigConsoleCommand(line: string): boolean {
  const trimmed = line.trim().toLowerCase();
  return trimmed === ".config" || trimmed.startsWith(".config ");
}

function tokenize(line: string): string[] {
  const parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return parts.map((part) =>
    part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1) : part,
  );
}

function takeFlag(tokens: string[], name: string): string | undefined {
  const index = tokens.findIndex((token) => token === name);
  if (index < 0) return undefined;
  const value = tokens[index + 1];
  tokens.splice(index, value === undefined ? 1 : 2);
  return value;
}

function looksLikeConfigPath(token: string): boolean {
  return /\.(yml|yaml|json|toml|properties|conf)$/i.test(token);
}

/**
 * Handle `.config …` from the interactive run console.
 * Errors are logged; callers should not rethrow for normal user mistakes.
 */
export async function handleConfigConsoleCommand(
  line: string,
  ctx: ConfigConsoleContext,
): Promise<void> {
  try {
    await dispatchConfigConsoleCommand(line, ctx);
  } catch (error) {
    warn(`Config: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function dispatchConfigConsoleCommand(
  line: string,
  ctx: ConfigConsoleContext,
): Promise<void> {
  const tokens = tokenize(line.trim());
  const sub = (tokens[1] ?? "open").toLowerCase();
  const rest = tokens.slice(2);

  if (sub === "help" || sub === "?") {
    info("Live config: .config | .config open [path] | .config list");
    info("            .config get [--key k] [path] | .config set key value");
    info("            .config set --key k --value v [path] | .config editor [name]");
    return;
  }

  if (sub === "list") {
    const watched = await readWatchedConfigPaths(ctx.cwd);
    const listing = await listLiveConfigFiles(ctx.cwd, ctx.pluginName, watched);
    if (!listing.dataDir) {
      warn("Plugin data folder not found — run once so the plugin can generate it");
      return;
    }
    info(`Live folder: ${listing.dataDir}`);
    if (listing.files.length === 0) {
      warn("No editable config files found");
      return;
    }
    for (const file of listing.files) {
      info(`${file.watched ? "*" : " "} ${file.path}${file.watched ? "  watched" : ""}`);
    }
    return;
  }

  if (sub === "editor") {
    const name = rest[0];
    if (!name) {
      info(`Config editor: ${await readConfigEditor(ctx.cwd)}`);
      return;
    }
    const next = await setConfigEditor(ctx.cwd, normalizeConfigEditor(name));
    success(`Config editor set to ${next}`);
    return;
  }

  if (sub === "open" || sub === "edit") {
    const path = rest[0] ?? "config.yml";
    const preference = await readConfigEditor(ctx.cwd);
    const resolved = await resolveLiveConfigFile(ctx.cwd, ctx.pluginName, path);
    const opened = await openExternalEditor(resolved, preference);
    success(`Opened live config: ${path} (${opened.label})`);
    return;
  }

  if (sub === "get") {
    const key = takeFlag(rest, "--key");
    const path = rest[0] ?? "config.yml";
    const resolved = await resolveLiveConfigFile(ctx.cwd, ctx.pluginName, path);
    const result = await getLiveConfigValue(resolved, key);
    if (key && result.value === undefined) {
      warn(`Key not found: ${key}`);
      return;
    }
    info(formatConfigValue(key ? result.value : result.document));
    return;
  }

  if (sub === "set") {
    const keyFlag = takeFlag(rest, "--key");
    const valueFlag = takeFlag(rest, "--value");
    let path = "config.yml";
    let key = keyFlag;
    let rawValue = valueFlag;

    if (key && rawValue !== undefined) {
      if (rest[0]) path = rest[0]!;
    } else if (rest.length >= 3 && looksLikeConfigPath(rest[0]!)) {
      path = rest[0]!;
      key = rest[1];
      rawValue = rest.slice(2).join(" ");
    } else if (rest.length >= 2) {
      key = rest[0];
      rawValue = rest.slice(1).join(" ");
    }

    if (!key || rawValue === undefined) {
      warn("Usage: .config set key value  OR  .config set --key k --value v [path]");
      return;
    }

    const resolved = await resolveLiveConfigFile(ctx.cwd, ctx.pluginName, path);
    await setLiveConfigValue(resolved, key, parseConfigValue(rawValue));
    success(`Set ${key} in live config: ${path}`);
    return;
  }

  if (sub === "watch" || sub === "unwatch") {
    const path = rest[0];
    if (!path) {
      warn(`Usage: .config ${sub} <path>`);
      return;
    }
    await setLiveConfigWatched(ctx.cwd, path, sub === "watch");
    success(`${sub === "watch" ? "Watching" : "Stopped watching"} live config: ${path}`);
    return;
  }

  warn(`Unknown .config command: ${sub} (try .config help)`);
}
