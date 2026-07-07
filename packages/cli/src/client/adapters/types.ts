import type { ResolvedConfig } from "../../config/loader.js";

export type AdapterId = "prism" | "multimc" | "embedded";

export interface DetectedLauncher {
  id: AdapterId;
  executable: string;
  dataDir: string;
  probeSource: string;
}

export interface InstanceInfo {
  instanceId: string;
  mcVersion: string;
  launcher: DetectedLauncher;
  instanceDir: string;
  created: boolean;
  instanceMcVersion?: string;
}

export interface JoinTarget {
  host: string;
  port: number;
  offlineName?: string;
  profile?: string;
}

export interface ClientAdapterContext {
  config: ResolvedConfig;
}

export type ClientLauncherMode = "auto" | "prism" | "multimc" | "embedded" | "none";

export interface LauncherAdapter {
  id: AdapterId;
  detect(ctx: ClientAdapterContext): Promise<DetectedLauncher | null>;
  ensureInstance(
    launcher: DetectedLauncher,
    mcVersion: string,
    instanceId: string,
  ): Promise<InstanceInfo>;
  launch(instance: InstanceInfo, join: JoinTarget): Promise<void>;
}
