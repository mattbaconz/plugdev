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

async function resolveAutoAdapter(
  ctx: ClientAdapterContext,
): Promise<LauncherAdapter> {
  const instanceId =
    ctx.config.client?.instance ?? defaultInstanceId(ctx.config.version);

  // Pass 1: external launcher with matching instance + MC version
  for (const adapter of externalAdapters) {
    const detected = await adapter.detect(ctx);
    if (!detected) continue;

    const legacy = toLegacyLauncher(detected);
    if (await instanceVersionMatches(legacy, instanceId, ctx.config.version)) {
      return adapter;
    }
  }

  // Pass 2: external launcher with no instance yet (will auto-provision)
  for (const adapter of externalAdapters) {
    const detected = await adapter.detect(ctx);
    if (!detected) continue;

    const legacy = toLegacyLauncher(detected);
    if (!(await instanceExists(legacy, instanceId))) {
      return adapter;
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
