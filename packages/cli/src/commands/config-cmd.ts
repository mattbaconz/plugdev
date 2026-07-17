import pc from "picocolors";
import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { heading, info, success, warn } from "../util/log.js";
import { emitJson, isJsonMode } from "../util/output.js";
import {
  listLiveConfigFiles,
  normalizeConfigEditor,
  openExternalEditor,
  readConfigEditor,
  resolveLiveConfigFile,
  setConfigEditor,
  setLiveConfigWatched,
  type ConfigEditor,
} from "../live-config/service.js";
import {
  formatConfigValue,
  getLiveConfigValue,
  parseConfigValue,
  setLiveConfigValue,
} from "../live-config/yaml-values.js";

async function pluginContext(cwd: string) {
  const project = await detectProject(cwd);
  if (project.type !== "plugin" || !project.pluginName) {
    throw new Error("Live config editing requires a detected Paper plugin with plugin.yml");
  }
  const config = await loadConfig(cwd, project);
  return { project, config };
}

export async function runConfigList(cwd: string): Promise<number> {
  try {
    const { project, config } = await pluginContext(cwd);
    const listing = await listLiveConfigFiles(cwd, project.pluginName!, config.watch.configs);
    if (isJsonMode()) {
      emitJson({
        ok: Boolean(listing.dataDir),
        data: {
          pluginName: project.pluginName,
          dataDir: listing.dataDir,
          files: listing.files.map(({ path, watched }) => ({ path, watched })),
        },
        ...(!listing.dataDir
          ? { error: "Plugin data folder not found", hint: "Run PlugDev once so the plugin can generate it" }
          : {}),
      });
      return listing.dataDir ? 0 : 1;
    }

    heading("PlugDev live configs\n");
    if (!listing.dataDir) {
      warn("Plugin data folder not found — run PlugDev once so the plugin can generate it");
      return 1;
    }
    info(`Live folder: ${listing.dataDir}`);
    if (listing.files.length === 0) {
      warn("No editable config files found");
      return 1;
    }
    for (const file of listing.files) {
      info(`${file.watched ? "*" : " "} ${file.path}${file.watched ? pc.dim("  watched") : ""}`);
    }
    info("These are live dev-server copies; src/main/resources is unchanged.");
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (isJsonMode()) emitJson({ ok: false, error: message });
    else warn(message);
    return 1;
  }
}

export async function runConfigOpen(
  cwd: string,
  path = "config.yml",
  options: {
    editor?: string;
    opener?: (
      absolutePath: string,
      preference: ConfigEditor,
    ) => Promise<{ command: string; label: string } | void>;
  } = {},
): Promise<number> {
  try {
    const { project } = await pluginContext(cwd);
    const resolved = await resolveLiveConfigFile(cwd, project.pluginName!, path);
    const preference = options.editor
      ? normalizeConfigEditor(options.editor)
      : await readConfigEditor(cwd);
    const opener = options.opener ?? openExternalEditor;
    const opened = await opener(resolved, preference);
    if (isJsonMode()) {
      emitJson({
        ok: true,
        data: {
          path,
          absolutePath: resolved,
          editor: preference,
          ...(opened && typeof opened === "object" ? { command: opened.command } : {}),
        },
      });
    } else {
      success(`Opened live config: ${path}${opened && typeof opened === "object" ? ` (${opened.label})` : ""}`);
    }
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (isJsonMode()) emitJson({ ok: false, error: message });
    else warn(message);
    return 1;
  }
}

export async function runConfigEditor(
  cwd: string,
  editor?: string,
): Promise<number> {
  try {
    await pluginContext(cwd);
    if (!editor) {
      const current = await readConfigEditor(cwd);
      if (isJsonMode()) emitJson({ ok: true, data: { configEditor: current } });
      else info(`Config editor: ${current}`);
      return 0;
    }
    const next = await setConfigEditor(cwd, normalizeConfigEditor(editor));
    if (isJsonMode()) emitJson({ ok: true, data: { configEditor: next } });
    else success(`Config editor set to ${next}`);
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (isJsonMode()) emitJson({ ok: false, error: message });
    else warn(message);
    return 1;
  }
}

export async function runConfigWatch(
  cwd: string,
  path: string,
  watched: boolean,
): Promise<number> {
  try {
    await pluginContext(cwd);
    const configs = await setLiveConfigWatched(cwd, path, watched);
    if (isJsonMode()) {
      emitJson({ ok: true, data: { path, watched, configs } });
    } else {
      success(`${watched ? "Watching" : "Stopped watching"} live config: ${path}`);
    }
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (isJsonMode()) emitJson({ ok: false, error: message });
    else warn(message);
    return 1;
  }
}

export async function runConfigGet(
  cwd: string,
  path = "config.yml",
  key?: string,
): Promise<number> {
  try {
    const { project } = await pluginContext(cwd);
    const resolved = await resolveLiveConfigFile(cwd, project.pluginName!, path);
    const result = await getLiveConfigValue(resolved, key);
    if (isJsonMode()) {
      emitJson({
        ok: true,
        data: {
          path,
          absolutePath: resolved,
          ...(result.key ? { key: result.key } : {}),
          value: result.value,
          ...(result.key ? {} : { document: result.document }),
        },
      });
      return 0;
    }
    if (result.key) {
      if (result.value === undefined) {
        warn(`Key not found: ${result.key}`);
        return 1;
      }
      info(formatConfigValue(result.value));
      return 0;
    }
    info(formatConfigValue(result.document));
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (isJsonMode()) emitJson({ ok: false, error: message });
    else warn(message);
    return 1;
  }
}

export async function runConfigSet(
  cwd: string,
  path: string,
  key: string,
  rawValue: string,
): Promise<number> {
  try {
    const { project } = await pluginContext(cwd);
    const resolved = await resolveLiveConfigFile(cwd, project.pluginName!, path);
    const value = parseConfigValue(rawValue);
    const result = await setLiveConfigValue(resolved, key, value);
    if (isJsonMode()) {
      emitJson({
        ok: true,
        data: {
          path,
          absolutePath: resolved,
          key: result.key,
          value: result.value,
        },
      });
    } else {
      success(`Set ${result.key} in live config: ${path}`);
    }
    return 0;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (isJsonMode()) emitJson({ ok: false, error: message });
    else warn(message);
    return 1;
  }
}
