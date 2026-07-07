import type { ClientLauncherMode } from "./types.js";
import type { ClientAdapterContext, LauncherAdapter } from "./types.js";
import { prismAdapter } from "./prism.js";
import { multimcAdapter } from "./multimc.js";
import { embeddedAdapter } from "./embedded.js";

export function getAdapterRegistry(): LauncherAdapter[] {
  return [prismAdapter, multimcAdapter, embeddedAdapter];
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

  for (const adapter of [prismAdapter, multimcAdapter]) {
    if (await adapter.detect(ctx)) return adapter;
  }

  return null;
}
