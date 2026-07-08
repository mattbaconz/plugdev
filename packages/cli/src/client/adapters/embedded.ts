import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { info } from "../../util/log.js";
import {
  embeddedClientDir,
  isEmbeddedClientCached,
  prefetchEmbeddedClient,
} from "../prefetch.js";
import type {
  ClientAdapterContext,
  DetectedLauncher,
  InstanceInfo,
  JoinTarget,
  LauncherAdapter,
} from "./types.js";

async function resolveJavaPath(): Promise<string> {
  if (process.env.JAVA_HOME) {
    const bin =
      process.platform === "win32"
        ? join(process.env.JAVA_HOME, "bin", "java.exe")
        : join(process.env.JAVA_HOME, "bin", "java");
    return bin;
  }
  const cmd = process.platform === "win32" ? "where" : "which";
  const { stdout } = await execa(cmd, ["java"], { reject: false });
  const first = stdout.split(/\r?\n/).find((l) => l.trim());
  return first?.trim() || "java";
}

export const embeddedAdapter: LauncherAdapter = {
  id: "embedded",

  async detect(_ctx: ClientAdapterContext): Promise<DetectedLauncher | null> {
    return {
      id: "embedded",
      executable: "embedded",
      dataDir: embeddedClientDir(),
      probeSource: "embedded:@xmcl",
    };
  },

  async ensureInstance(
    launcher: DetectedLauncher,
    mcVersion: string,
    instanceId: string,
  ): Promise<InstanceInfo> {
    return {
      instanceId,
      mcVersion,
      launcher,
      instanceDir: launcher.dataDir,
      created: false,
    };
  },

  async launch(instance: InstanceInfo, join: JoinTarget): Promise<void> {
    const gamePath = embeddedClientDir();
    await mkdir(gamePath, { recursive: true });

    if (!(await isEmbeddedClientCached(instance.mcVersion))) {
      info("Installing Minecraft client (first run may take a while)...");
      await prefetchEmbeddedClient(instance.mcVersion);
    }

    const { MinecraftFolder, launch } = await import("@xmcl/core");
    const folder = MinecraftFolder.from(gamePath);

    const address = `${join.host}:${join.port}`;
    info(`Launching embedded client → ${address}`);

    const javaPath = await resolveJavaPath();
    const proc = await launch({
      gamePath: folder.path,
      resourcePath: folder.path,
      javaPath,
      version: instance.mcVersion,
      quickPlayMultiplayer: address,
      gameProfile: {
        name: join.offlineName ?? "DevPlayer",
        id: "00000000-0000-0000-0000-000000000000",
      },
      extraExecOption: { detached: true, stdio: "ignore" },
    });

    proc.unref();
  },
};
