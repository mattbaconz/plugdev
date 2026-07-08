import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import { clientManifestPath } from "../paths.js";
import type { DetectedLauncher } from "./detect.js";
import {
  instanceExists,
  readInstanceMcVersion,
} from "./detect.js";
import { info, warn } from "../util/log.js";

export interface ClientManifest {
  instances: Record<
    string,
    {
      instanceId: string;
      launcher: string;
      provisionedAt: string;
    }
  >;
}

export interface EnsureInstanceResult {
  instanceId: string;
  mcVersion: string;
  launcher: DetectedLauncher;
  instanceDir: string;
  created: boolean;
  instanceMcVersion?: string;
  versionMismatch: boolean;
}

async function readManifest(): Promise<ClientManifest> {
  try {
    const raw = await readFile(clientManifestPath(), "utf8");
    return JSON.parse(raw) as ClientManifest;
  } catch {
    return { instances: {} };
  }
}

async function writeManifest(manifest: ClientManifest): Promise<void> {
  const dir = join(clientManifestPath(), "..");
  await mkdir(dir, { recursive: true });
  await writeFile(clientManifestPath(), JSON.stringify(manifest, null, 2));
}

export async function provisionInstance(
  launcher: DetectedLauncher,
  mcVersion: string,
  instanceId: string,
): Promise<string> {
  const instanceDir = join(launcher.dataDir, "instances", instanceId);
  await mkdir(instanceDir, { recursive: true });

  const mmcPack = {
    formatVersion: 1,
    components: [
      {
        uid: "net.minecraft",
        version: mcVersion,
        important: true,
      },
    ],
  };

  await writeFile(join(instanceDir, "mmc-pack.json"), JSON.stringify(mmcPack, null, 2));
  await writeFile(
    join(instanceDir, "instance.cfg"),
    [
      `name=${instanceId}`,
      "InstanceType=OneSix",
      "OverrideCommands=true",
      "OverrideJava=false",
      "OverrideMemory=false",
      "notes=PlugDev dev instance — do not edit manually unless needed",
    ].join("\n") + "\n",
  );

  const manifest = await readManifest();
  manifest.instances[mcVersion] = {
    instanceId,
    launcher: launcher.type,
    provisionedAt: new Date().toISOString(),
  };
  await writeManifest(manifest);

  return instanceDir;
}

export async function ensureInstance(
  launcher: DetectedLauncher,
  mcVersion: string,
  instanceId: string,
  opts: { force?: boolean } = {},
): Promise<EnsureInstanceResult> {
  const exists = await instanceExists(launcher, instanceId);
  let instanceDir = join(launcher.dataDir, "instances", instanceId);
  let created = false;

  if (!exists || opts.force) {
    const label = opts.force && exists ? "Reprovisioning" : "Provisioning";
    info(`${label} ${launcher.type} instance "${instanceId}" for Minecraft ${mcVersion}...`);
    instanceDir = await provisionInstance(launcher, mcVersion, instanceId);
    created = !exists;
    info("Open Prism and launch this instance once if game files are not downloaded yet.");
  }

  const instanceMcVersion = await readInstanceMcVersion(launcher, instanceId);
  const versionMismatch =
    instanceMcVersion !== undefined && instanceMcVersion !== mcVersion;

  if (versionMismatch) {
    warn(
      `Instance "${instanceId}" is Minecraft ${instanceMcVersion}, but server uses ${mcVersion}.`,
    );
    warn(`Run: plugdev client setup --force  (or recreate instance in Prism)`);
  }

  const manifest = await readManifest();
  manifest.instances[mcVersion] = {
    instanceId,
    launcher: launcher.type,
    provisionedAt: manifest.instances[mcVersion]?.provisionedAt ?? new Date().toISOString(),
  };
  await writeManifest(manifest);

  return {
    instanceId,
    mcVersion,
    launcher,
    instanceDir,
    created,
    instanceMcVersion,
    versionMismatch,
  };
}

export async function getManifest(): Promise<ClientManifest> {
  return readManifest();
}

export async function instanceDirHasMmcPack(
  launcher: DetectedLauncher,
  instanceId: string,
): Promise<boolean> {
  try {
    await access(
      join(launcher.dataDir, "instances", instanceId, "mmc-pack.json"),
      constants.F_OK,
    );
    return true;
  } catch {
    return false;
  }
}
