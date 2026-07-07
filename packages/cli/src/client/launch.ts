import type { ResolvedConfig } from "../config/loader.js";
import { copyToClipboard } from "./clipboard.js";
import { defaultInstanceId } from "./detect.js";
import { resolveAdapter } from "./adapters/registry.js";
import { info, success, warn } from "../util/log.js";
import { waitForPortOpen } from "../util/port.js";

import type { ClientLauncherMode } from "./adapters/types.js";

export interface LaunchClientOptions {
  config: ResolvedConfig;
  host?: string;
  launcher?: ClientLauncherMode;
  waitForServer?: boolean;
}

export async function launchClient(opts: LaunchClientOptions): Promise<void> {
  const host = opts.host ?? "localhost";
  const port = opts.config.port;
  const address = `${host}:${port}`;
  const client = opts.config.client;
  const mode = opts.launcher ?? client?.launcher ?? "auto";
  const ctx = { config: opts.config };

  if (mode === "none") {
    await copyJoinAddress(address);
    return;
  }

  if (opts.waitForServer !== false) {
    info("Waiting for server...");
    const ready = await waitForPortOpen(port, host, 120_000);
    if (!ready) {
      warn("Server did not become ready in time; launching client anyway");
    }
  }

  const adapter = await resolveAdapter(ctx, mode);

  if (!adapter) {
    if (mode === "auto") {
      await copyJoinAddress(address);
      warn(
        "No Prism/MultiMC found. Set client.executable in plugdev.yml or run: plugdev client detect",
      );
      return;
    }
    await copyJoinAddress(address);
    warn(`Launcher "${mode}" not found — run: plugdev client detect`);
    return;
  }

  const instanceId = client?.instance ?? defaultInstanceId(opts.config.version);
  const offlineName = client?.offlineName ?? "DevPlayer";

  try {
    const detected = await adapter.detect(ctx);
    if (!detected) {
      throw new Error(`${adapter.id} adapter could not be detected`);
    }

    const instance = await adapter.ensureInstance(
      detected,
      opts.config.version,
      instanceId,
    );

    await adapter.launch(instance, { host, port, offlineName });
  } catch (err) {
    warn(`Client launch failed: ${err instanceof Error ? err.message : String(err)}`);
    await copyJoinAddress(address);
  }
}

export async function copyJoinAddress(address: string): Promise<void> {
  const copied = await copyToClipboard(address);
  if (copied) {
    success(`Copied ${address} to clipboard`);
  } else {
    info(`Join: ${address}`);
  }
}
