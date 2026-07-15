import type { ResolvedConfig } from "../config/loader.js";
import { launchClient, type LaunchClientOptions } from "./launch.js";
import { info, warn } from "../util/log.js";

/** Primary offline name + extra players from config (deduped, order preserved). */
export function resolvePlayerNames(config: ResolvedConfig): string[] {
  const primary = config.client?.offlineName?.trim() || "DevPlayer";
  const extras = (config.client?.players ?? [])
    .map((p) => p.name?.trim())
    .filter((n): n is string => Boolean(n));

  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [primary, ...extras]) {
    const key = name.toLowerCase();
    if (seen.has(key)) {
      warn(`Duplicate offline player name "${name}" — skipping`);
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}

export async function launchPlayers(
  opts: Omit<LaunchClientOptions, "offlineName"> & { names?: string[] },
): Promise<void> {
  const names = opts.names ?? resolvePlayerNames(opts.config);
  if (names.length === 0) {
    await launchClient({ ...opts, offlineName: "DevPlayer" });
    return;
  }

  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    if (i > 0) {
      info(`Launching extra player: ${name}`);
    }
    const launched = await launchClient({
      ...opts,
      offlineName: name,
      // Force offline profiles for multi-player (embedded always offline; Prism needs offline)
      launcher:
        names.length > 1 && i > 0
          ? opts.launcher === "none"
            ? "none"
            : "embedded"
          : opts.launcher,
    });
    if (!launched) return;
  }
}
