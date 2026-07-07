import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { constants } from "node:fs";
import { execa } from "execa";
import type { PlugDevConfig } from "../../config/loader.js";

export type LauncherType = "prism" | "multimc";

export interface DetectionProbe {
  source: string;
  path: string;
  found: boolean;
  launcher?: LauncherType;
}

export interface DetectedLauncher {
  type: LauncherType;
  executable: string;
  dataDir: string;
  probeSource: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function prismDataDir(): string {
  return join(homedir(), "AppData", "Roaming", "PrismLauncher");
}

function multimcDataDir(): string {
  return join(homedir(), "AppData", "Roaming", "MultiMC");
}

async function probePath(
  source: string,
  path: string,
  launcher: LauncherType,
  dataDir: string,
): Promise<DetectionProbe> {
  const found = await exists(path);
  return { source, path, found, launcher: found ? launcher : undefined };
}

async function probeRegistryAppPath(
  launcher: LauncherType,
  exeName: string,
): Promise<DetectionProbe> {
  const source = `registry:App Paths\\${exeName}`;
  if (process.platform !== "win32") {
    return { source, path: "", found: false };
  }

  try {
    const { stdout } = await execa(
      "reg",
      ["query", `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`, "/ve"],
      { reject: false },
    );
    const match = stdout.match(/REG_SZ\s+(.+)/);
    const path = match?.[1]?.trim() ?? "";
    const found = path.length > 0 && (await exists(path));
    return {
      source,
      path,
      found,
      launcher: found ? launcher : undefined,
    };
  } catch {
    return { source, path: "", found: false };
  }
}

async function probeWhere(
  launcher: LauncherType,
  command: string,
): Promise<DetectionProbe> {
  const source = `path:${command}`;
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execa(cmd, [command], { reject: false });
    const path = stdout.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
    const found = path.length > 0 && (await exists(path));
    return {
      source,
      path,
      found,
      launcher: found ? launcher : undefined,
    };
  } catch {
    return { source, path: "", found: false };
  }
}

export async function probeAllLaunchers(
  client?: PlugDevConfig["client"],
): Promise<DetectionProbe[]> {
  const probes: DetectionProbe[] = [];

  if (client?.executable) {
    probes.push(
      await probePath("config:client.executable", client.executable, "prism", prismDataDir()),
    );
  }

  if (process.env.PLUGDEV_PRISM_EXE) {
    probes.push(
      await probePath("env:PLUGDEV_PRISM_EXE", process.env.PLUGDEV_PRISM_EXE, "prism", prismDataDir()),
    );
  }

  const prismCandidates: Array<{ source: string; path: string }> = [
    { source: "appdata:PrismLauncher", path: join(prismDataDir(), "prismlauncher.exe") },
    {
      source: "localappdata:Programs",
      path: join(homedir(), "AppData", "Local", "Programs", "Prism Launcher", "prismlauncher.exe"),
    },
    {
      source: "localappdata:Programs/PrismLauncher",
      path: join(homedir(), "AppData", "Local", "Programs", "PrismLauncher", "prismlauncher.exe"),
    },
    {
      source: "programfiles:Prism Launcher",
      path: "C:\\Program Files\\Prism Launcher\\prismlauncher.exe",
    },
    {
      source: "programfiles-x86:Prism Launcher",
      path: "C:\\Program Files (x86)\\Prism Launcher\\prismlauncher.exe",
    },
    {
      source: "scoop:prismlauncher",
      path: join(homedir(), "scoop", "apps", "prismlauncher", "current", "prismlauncher.exe"),
    },
  ];

  for (const c of prismCandidates) {
    probes.push(await probePath(c.source, c.path, "prism", prismDataDir()));
  }

  probes.push(await probeWhere("prism", "prismlauncher"));
  probes.push(await probeRegistryAppPath("prism", "prismlauncher.exe"));

  const multimcCandidates = [
    { source: "appdata:MultiMC", path: join(multimcDataDir(), "MultiMC.exe") },
    { source: "programfiles:MultiMC", path: "C:\\Program Files\\MultiMC\\MultiMC.exe" },
  ];

  for (const c of multimcCandidates) {
    probes.push(await probePath(c.source, c.path, "multimc", multimcDataDir()));
  }

  probes.push(await probeWhere("multimc", "MultiMC"));
  probes.push(await probeRegistryAppPath("multimc", "MultiMC.exe"));

  return probes;
}

function launcherFromProbe(probe: DetectionProbe): DetectedLauncher | undefined {
  if (!probe.found || !probe.launcher) return undefined;
  const dataDir = probe.launcher === "prism" ? prismDataDir() : multimcDataDir();
  return {
    type: probe.launcher,
    executable: probe.path,
    dataDir,
    probeSource: probe.source,
  };
}

export async function detectLauncher(
  prefer: "prism" | "multimc" | "auto" = "auto",
  client?: PlugDevConfig["client"],
): Promise<DetectedLauncher | undefined> {
  const probes = await probeAllLaunchers(client);

  const pick = (type: LauncherType): DetectedLauncher | undefined => {
    for (const probe of probes) {
      if (probe.found && probe.launcher === type) {
        return launcherFromProbe(probe);
      }
    }
    return undefined;
  };

  if (prefer === "prism") return pick("prism");
  if (prefer === "multimc") return pick("multimc");

  return pick("prism") ?? pick("multimc");
}

export async function instanceExists(
  launcher: DetectedLauncher,
  instanceId: string,
): Promise<boolean> {
  return exists(join(launcher.dataDir, "instances", instanceId));
}

export function defaultInstanceId(mcVersion: string): string {
  return `plugdev-${mcVersion}`;
}

export async function readInstanceMcVersion(
  launcher: DetectedLauncher,
  instanceId: string,
): Promise<string | undefined> {
  const mmcPath = join(launcher.dataDir, "instances", instanceId, "mmc-pack.json");
  try {
    const raw = await readFile(mmcPath, "utf8");
    const pack = JSON.parse(raw) as {
      components?: Array<{ uid: string; version?: string }>;
    };
    return pack.components?.find((c) => c.uid === "net.minecraft")?.version;
  } catch {
    return undefined;
  }
}
