import { spawn } from "node:child_process";
import type {
  DetectedLauncher,
  InstanceInfo,
  JoinTarget,
  LauncherAdapter,
  ClientAdapterContext,
  AdapterId,
} from "./types.js";
import {
  detectLauncher,
  type DetectedLauncher as LegacyDetected,
} from "../detect.js";
import { ensureInstance } from "../instance.js";
import { info } from "../../util/log.js";

function toAdapterLauncher(launcher: LegacyDetected): DetectedLauncher {
  return {
    id: launcher.type,
    executable: launcher.executable,
    dataDir: launcher.dataDir,
    probeSource: launcher.probeSource,
  };
}

export function createExternalAdapter(
  id: Extract<AdapterId, "prism" | "multimc">,
): LauncherAdapter {
  return {
    id,

    async detect(ctx: ClientAdapterContext): Promise<DetectedLauncher | null> {
      const found = await detectLauncher(id, ctx.config.client);
      return found ? toAdapterLauncher(found) : null;
    },

    async ensureInstance(
      launcher: DetectedLauncher,
      mcVersion: string,
      instanceId: string,
    ): Promise<InstanceInfo> {
      const legacy: LegacyDetected = {
        type: launcher.id as "prism" | "multimc",
        executable: launcher.executable,
        dataDir: launcher.dataDir,
        probeSource: launcher.probeSource,
      };
      const result = await ensureInstance(legacy, mcVersion, instanceId);
      return {
        instanceId: result.instanceId,
        mcVersion: result.mcVersion,
        launcher,
        instanceDir: result.instanceDir,
        created: result.created,
        instanceMcVersion: result.instanceMcVersion,
      };
    },

    async launch(instance: InstanceInfo, join: JoinTarget): Promise<void> {
      const server = `${join.host}:${join.port}`;
      const args = ["--launch", instance.instanceId, "--server", server];

      if (join.profile) {
        args.push("--profile", join.profile);
      } else if (join.offlineName) {
        // Only when caller opts into offline (client.offline: true)
        args.push("--offline", join.offlineName);
      }

      const cmd = `${instance.launcher.executable} ${args.join(" ")}`;
      info(`Launching: ${cmd}`);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(instance.launcher.executable, args, {
          detached: true,
          stdio: "ignore",
        });
        proc.on("error", reject);
        proc.unref();
        resolve();
      });
    },
  };
}
