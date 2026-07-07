import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import { plugdevHome } from "../../paths.js";
import { info, step } from "../../util/log.js";
import type {
  ClientAdapterContext,
  DetectedLauncher,
  InstanceInfo,
  JoinTarget,
  LauncherAdapter,
} from "./types.js";

function minecraftCacheDir(): string {
  return join(plugdevHome(), "minecraft");
}

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

interface VersionManifestEntry {
  id: string;
  url: string;
}

export const embeddedAdapter: LauncherAdapter = {
  id: "embedded",

  async detect(_ctx: ClientAdapterContext): Promise<DetectedLauncher | null> {
    return {
      id: "embedded",
      executable: "embedded",
      dataDir: minecraftCacheDir(),
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
    const gamePath = minecraftCacheDir();
    await mkdir(gamePath, { recursive: true });

    step("Installing Minecraft client (first run may take a while)...", "active");

    const manifestRes = await fetch(
      "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
    );
    if (!manifestRes.ok) {
      throw new Error(`Failed to fetch Minecraft version manifest: ${manifestRes.status}`);
    }
    const manifest = (await manifestRes.json()) as {
      versions: VersionManifestEntry[];
    };
    const versionMeta = manifest.versions.find((v) => v.id === instance.mcVersion);
    if (!versionMeta) {
      throw new Error(`Minecraft version ${instance.mcVersion} not found in manifest`);
    }

    const { MinecraftFolder, launch } = await import("@xmcl/core");
    const { install } = await import("@xmcl/installer");

    const folder = MinecraftFolder.from(gamePath);
    await install(versionMeta, folder.path, { side: "client" });

    step("Installing Minecraft client (first run may take a while)...", "done");

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
