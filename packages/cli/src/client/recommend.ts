import type { DetectedLauncher } from "./detect.js";
import { defaultInstanceId, instanceExists, readInstanceMcVersion } from "./detect.js";
import {
  listLauncherInstances,
  type ListedInstance,
} from "./instances-list.js";

export interface RecommendedClientInstance {
  launcher: DetectedLauncher;
  instanceId: string;
  mcVersion?: string;
  /** Why this instance was chosen. */
  reason: "version-match" | "plugdev-default" | "recent";
  /** True when we should write client.instance into plugdev.yml. */
  unambiguous: boolean;
}

function versionsCompatible(instanceMc: string | undefined, target: string): boolean {
  if (!instanceMc) return false;
  if (instanceMc === target) return true;
  // api-version style "1.21" vs instance "1.21.4"
  const targetParts = target.split(".");
  const instParts = instanceMc.split(".");
  if (targetParts.length === 2 && instParts.length >= 2) {
    return targetParts[0] === instParts[0] && targetParts[1] === instParts[1];
  }
  return false;
}

/**
 * Pick a Prism/MultiMC instance that fits the target MC version.
 * Unambiguous version matches (or existing plugdev-{version}) are safe to auto-write.
 * Recently-played fallback is tip-only (not unambiguous).
 */
export async function recommendClientInstance(
  launcher: DetectedLauncher,
  targetMcVersion: string,
): Promise<RecommendedClientInstance | undefined> {
  const list = await listLauncherInstances(launcher);
  const matches = list.filter((i) => versionsCompatible(i.mcVersion, targetMcVersion));

  if (matches.length === 1) {
    const pick = matches[0]!;
    return {
      launcher,
      instanceId: pick.id,
      mcVersion: pick.mcVersion,
      reason: "version-match",
      unambiguous: true,
    };
  }

  if (matches.length > 1) {
    // Prefer most recently launched among version matches
    const sorted = [...matches].sort((a, b) => b.lastLaunchTime - a.lastLaunchTime);
    const pick = sorted[0]!;
    return {
      launcher,
      instanceId: pick.id,
      mcVersion: pick.mcVersion,
      reason: "version-match",
      // Multiple matches — tip only, don't auto-write
      unambiguous: false,
    };
  }

  const defaultId = defaultInstanceId(targetMcVersion);
  if (await instanceExists(launcher, defaultId)) {
    const mcVersion = await readInstanceMcVersion(launcher, defaultId);
    return {
      launcher,
      instanceId: defaultId,
      mcVersion,
      reason: "plugdev-default",
      unambiguous: true,
    };
  }

  // Tip: recently played (do not auto-write — may be wrong MC version)
  const withLaunch = list.filter((i) => i.lastLaunchTime > 0);
  const recent: ListedInstance | undefined =
    withLaunch.length > 0
      ? withLaunch.sort((a, b) => b.lastLaunchTime - a.lastLaunchTime)[0]
      : list[0];
  if (recent) {
    return {
      launcher,
      instanceId: recent.id,
      mcVersion: recent.mcVersion,
      reason: "recent",
      unambiguous: false,
    };
  }

  return undefined;
}
