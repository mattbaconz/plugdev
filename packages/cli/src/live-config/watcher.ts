import chokidar from "chokidar";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { debounce } from "../util/debounce.js";
import { error, info } from "../util/log.js";
import {
  isEditableConfigPath,
  normalizeLiveConfigPath,
  readWatchedConfigPaths,
  resolvePluginDataDir,
} from "./service.js";

export interface LiveConfigChangeHandlerOptions {
  dataDir: string;
  reloadMode: "safe" | "restart" | "hotswap";
  getWatchedPaths: () => Promise<string[]>;
  onSafeReload: (changedPath: string) => Promise<void>;
  onRestart: () => Promise<void>;
  onError?: (error: unknown) => void;
  isSuppressed?: () => boolean;
}

export interface LiveConfigChangeHandler {
  (changedPath: string): Promise<void>;
  refresh(): Promise<void>;
}

export interface LiveConfigWatcherHandle {
  close(): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
}

async function fingerprint(path: string): Promise<string | undefined> {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  } catch {
    return undefined;
  }
}

function relativeConfigPath(dataDir: string, changedPath: string): string | undefined {
  const rel = relative(dataDir, changedPath);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined;
  try {
    return normalizeLiveConfigPath(rel);
  } catch {
    return undefined;
  }
}

export function createLiveConfigChangeHandler(
  options: LiveConfigChangeHandlerOptions,
): LiveConfigChangeHandler {
  let reloading = false;
  const fingerprints = new Map<string, string | undefined>();

  const refreshFingerprints = async () => {
    const watched = await options.getWatchedPaths();
    await Promise.all(
      watched.map(async (path) => {
        const normalized = normalizeLiveConfigPath(path);
        fingerprints.set(normalized.toLowerCase(), await fingerprint(`${options.dataDir}${sep}${normalized.split("/").join(sep)}`));
      }),
    );
  };

  const handle = async (changedPath: string) => {
    if (reloading || options.isSuppressed?.() || !isEditableConfigPath(changedPath)) return;
    const relativePath = relativeConfigPath(options.dataDir, changedPath);
    if (!relativePath) return;

    const watched = new Set(
      (await options.getWatchedPaths()).map((path) => normalizeLiveConfigPath(path).toLowerCase()),
    );
    const key = relativePath.toLowerCase();
    if (!watched.has(key)) return;

    const nextFingerprint = await fingerprint(changedPath);
    if (fingerprints.has(key) && fingerprints.get(key) === nextFingerprint) return;
    fingerprints.set(key, nextFingerprint);

    reloading = true;
    try {
      if (options.reloadMode === "restart") {
        info(`Config changed: ${relativePath} — restarting server…`);
        await options.onRestart();
      } else {
        await options.onSafeReload(relativePath);
      }
    } catch (caught) {
      options.onError?.(caught);
    } finally {
      await refreshFingerprints();
      reloading = false;
    }
  };
  handle.refresh = refreshFingerprints;
  return handle;
}

export async function startLiveConfigWatcher(options: {
  cwd: string;
  pluginName: string;
  reloadMode: "safe" | "restart" | "hotswap";
  debounceMs: number;
  onSafeReload: (changedPath: string) => Promise<void>;
  onRestart: () => Promise<void>;
}): Promise<LiveConfigWatcherHandle> {
  const dataDir = await resolvePluginDataDir(options.cwd, options.pluginName);
  if (!dataDir) {
    return {
      close: async () => {},
      pause: () => {},
      resume: async () => {},
    };
  }

  let paused = false;
  const handle = createLiveConfigChangeHandler({
    dataDir,
    reloadMode: options.reloadMode,
    getWatchedPaths: () => readWatchedConfigPaths(options.cwd),
    onSafeReload: options.onSafeReload,
    onRestart: options.onRestart,
    onError: (caught) => error(caught instanceof Error ? caught.message : String(caught)),
    isSuppressed: () => paused,
  });
  const debounced = debounce(handle, options.debounceMs);
  const watcher = chokidar.watch(dataDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200 },
  });
  watcher.on("change", debounced);
  watcher.on("add", debounced);
  info(`Watching live plugin configs in ${dataDir}`);
  return {
    close: async () => { await watcher.close(); },
    pause: () => { paused = true; },
    resume: async () => {
      await handle.refresh();
      paused = false;
    },
  };
}
