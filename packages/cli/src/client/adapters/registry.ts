import type { ClientLauncherMode } from "./types.js";
import type { ClientAdapterContext, LauncherAdapter } from "./types.js";
import { prismAdapter } from "./prism.js";
import { multimcAdapter } from "./multimc.js";
import { embeddedAdapter } from "./embedded.js";
import {
  instanceExists,
  readInstanceMcVersion,
  defaultInstanceId,
} from "../detect.js";
import type { DetectedLauncher as LegacyDetected } from "../detect.js";
import { hasViaCompatDeps } from "../../deps/presets.js";
import { findRecentlyPlayedInstance } from "../instances-list.js";

const externalAdapters = [prismAdapter, multimcAdapter];

function toLegacyLauncher(launcher: {
  id: string;
  executable: string;
  dataDir: string;
  probeSource: string;
}): LegacyDetected {
  return {
    type: launcher.id as "prism" | "multimc",
    executable: launcher.executable,
    dataDir: launcher.dataDir,
    probeSource: launcher.probeSource,
  };
}

export function getAdapterRegistry(): LauncherAdapter[] {
  return [prismAdapter, multimcAdapter, embeddedAdapter];
}

async function instanceVersionMatches(
  legacy: LegacyDetected,
  instanceId: string,
  mcVersion: string,
): Promise<boolean> {
  if (!(await instanceExists(legacy, instanceId))) return false;
  const mc = await readInstanceMcVersion(legacy, instanceId);
  return mc === mcVersion || !mc;
}

/**
 * Resolve which instance id to launch for external launchers.
 * Prefer explicit config; else recently played when Via* allows mismatch;
 * else default plugdev-{version}.
 */
export async function resolveInstanceId(
  ctx: ClientAdapterContext,
  legacy?: LegacyDetected,
): Promise<string> {
  if (ctx.config.client?.instance) {
    return ctx.config.client.instance;
  }

  const viaOk = hasViaCompatDeps(ctx.config.deps);
  if (viaOk && legacy) {
    const recent = await findRecentlyPlayedInstance(legacy);
    if (recent) return recent.id;
  }

  return defaultInstanceId(ctx.config.version);
}

/**
 * auto → embedded (matching server MC) unless user opted into Prism/MultiMC
 * via launcher: prism|multimc or client.instance.
 */
async function resolveAutoAdapter(
  ctx: ClientAdapterContext,
): Promise<LauncherAdapter> {
  const client = ctx.config.client;
  const wantsExternal =
    Boolean(client?.instance) ||
    client?.launcher === "prism" ||
    client?.launcher === "multimc";

  if (!wantsExternal) {
    return embeddedAdapter;
  }

  const viaOk = hasViaCompatDeps(ctx.config.deps);

  // Pass 1: external launcher with matching instance + MC version
  for (const adapter of externalAdapters) {
    const detected = await adapter.detect(ctx);
    if (!detected) continue;

    const legacy = toLegacyLauncher(detected);
    const instanceId = await resolveInstanceId(ctx, legacy);
    if (await instanceVersionMatches(legacy, instanceId, ctx.config.version)) {
      return adapter;
    }

    // Via* present: allow mismatched existing instance (e.g. FO → older Paper)
    if (viaOk && (await instanceExists(legacy, instanceId))) {
      return adapter;
    }
  }

  // Pass 2: external launcher with no instance yet (will auto-provision)
  for (const adapter of externalAdapters) {
    const detected = await adapter.detect(ctx);
    if (!detected) continue;

    const legacy = toLegacyLauncher(detected);
    const instanceId = await resolveInstanceId(ctx, legacy);
    if (!(await instanceExists(legacy, instanceId))) {
      return adapter;
    }
  }

  // Pass 3: Via* + any existing Prism/MultiMC instance (recently played)
  if (viaOk) {
    for (const adapter of externalAdapters) {
      const detected = await adapter.detect(ctx);
      if (!detected) continue;
      const legacy = toLegacyLauncher(detected);
      const recent = await findRecentlyPlayedInstance(legacy);
      if (recent) return adapter;
    }
  }

  return embeddedAdapter;
}

export async function resolveAdapter(
  ctx: ClientAdapterContext,
  mode: ClientLauncherMode,
): Promise<LauncherAdapter | null> {
  if (mode === "embedded") {
    return embeddedAdapter;
  }

  if (mode === "prism") {
    return (await prismAdapter.detect(ctx)) ? prismAdapter : null;
  }

  if (mode === "multimc") {
    return (await multimcAdapter.detect(ctx)) ? multimcAdapter : null;
  }

  if (mode === "none") {
    return null;
  }

  return resolveAutoAdapter(ctx);
}
