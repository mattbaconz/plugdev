import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, cp } from "node:fs/promises";
import { join } from "node:path";
import { templatesCacheDir, worldsCacheDir } from "../paths.js";

export function generateForwardingSecret(): string {
  return randomBytes(16).toString("hex");
}

export async function writeVelocityConfig(opts: {
  proxyDir: string;
  bindPort: number;
  backends: Array<{ name: string; port: number }>;
  secret: string;
}): Promise<void> {
  await mkdir(opts.proxyDir, { recursive: true });
  await writeFile(join(opts.proxyDir, "forwarding.secret"), opts.secret + "\n");

  const serverLines = opts.backends
    .map((b) => `${b.name} = "127.0.0.1:${b.port}"`)
    .join("\n");

  const toml = [
    `bind = "0.0.0.0:${opts.bindPort}"`,
    `motd = "<#00aaff>PlugDev Network"`,
    "show-max-players = 500",
    "online-mode = false",
    'player-info-forwarding-mode = "modern"',
    'forwarding-secret-file = "forwarding.secret"',
    "",
    "[servers]",
    serverLines,
    "",
    `try = ["${opts.backends[0]?.name ?? "lobby"}"]`,
    "",
    "[forced-hosts]",
    "",
    "[advanced]",
    "compression-threshold = 256",
    "compression-level = -1",
    "",
  ].join("\n");

  await writeFile(join(opts.proxyDir, "velocity.toml"), toml);
}

export async function writeBackendPaperConfig(
  backendDir: string,
  secret: string,
): Promise<void> {
  const configDir = join(backendDir, "config");
  await mkdir(configDir, { recursive: true });

  const paperGlobal = [
    "proxies:",
    "  velocity:",
    "    enabled: true",
    "    online-mode: false",
    `    secret: '${secret}'`,
    "",
  ].join("\n");

  await writeFile(join(configDir, "paper-global.yml"), paperGlobal);
}

export async function ensurePaperDevTemplate(): Promise<string> {
  const dir = templatesCacheDir("paper-dev");
  await mkdir(dir, { recursive: true });

  const marker = join(dir, ".plugdev-template");
  try {
    await readFile(marker, "utf8");
    return dir;
  } catch {
    // seed template files
  }

  await writeFile(
    join(dir, "bukkit.yml"),
    "settings:\n  allow-end: false\n  allow-nether: false\n",
  );
  await writeFile(join(dir, "eula.txt"), "eula=true\n");
  await writeFile(marker, "plugdev paper-dev template\n");
  return dir;
}

export async function seedWorldCache(worldName: string): Promise<string> {
  const dir = worldsCacheDir(worldName);
  await mkdir(dir, { recursive: true });
  const metaPath = join(dir, "meta.json");
  try {
    await readFile(metaPath, "utf8");
  } catch {
    await writeFile(
      metaPath,
      JSON.stringify({ name: worldName, description: "PlugDev cached world seed" }, null, 2),
    );
  }
  return dir;
}

export async function copyTemplateFiles(templateDir: string, runDir: string): Promise<void> {
  for (const file of ["bukkit.yml", "eula.txt"]) {
    try {
      await cp(join(templateDir, file), join(runDir, file));
    } catch {
      // optional
    }
  }
}
