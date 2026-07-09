import type { ResolvedConfig } from "../config/loader.js";
import { copyToClipboard } from "./clipboard.js";
import { defaultInstanceId, detectLauncher } from "./detect.js";
import { resolveAdapter, resolveInstanceId } from "./adapters/registry.js";
import { embeddedAdapter } from "./adapters/embedded.js";
import { info, success, warn, phase } from "../util/log.js";
import { waitForPortOpen } from "../util/port.js";
import { isEmbeddedClientCached } from "./prefetch.js";
import { hasViaCompatDeps } from "../deps/presets.js";
import { readInstanceMcVersion } from "./detect.js";

import type { ClientLauncherMode } from "./adapters/types.js";
import type { ClientAdapterContext, LauncherAdapter } from "./adapters/types.js";

export interface LaunchClientOptions {
  config: ResolvedConfig;
  host?: string;
  launcher?: ClientLauncherMode;
  waitForServer?: boolean;
}

function clientPhaseLabel(
  adapter: LauncherAdapter,
  instanceId: string,
  embeddedCached: boolean,
): string {
  if (adapter.id === "embedded") {
    return embeddedCached
      ? "Client: embedded (cached)"
      : "Client: embedded";
  }
  if (adapter.id === "prism") return `Client: Prism ${instanceId}`;
  if (adapter.id === "multimc") return `Client: MultiMC ${instanceId}`;
  return `Client: ${adapter.id}`;
}

async function launchWithAdapter(
  adapter: LauncherAdapter,
  ctx: ClientAdapterContext,
  instanceId: string,
  mcVersion: string,
  host: string,
  port: number,
  join: { offlineName?: string; useOffline: boolean },
): Promise<void> {
  const detected = await adapter.detect(ctx);
  if (!detected) {
    throw new Error(`${adapter.id} adapter could not be detected`);
  }

  const instance = await adapter.ensureInstance(detected, mcVersion, instanceId);
  await adapter.launch(instance, {
    host,
    port,
    offlineName: join.useOffline ? join.offlineName : undefined,
  });
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
    await copyJoinAddress(address);
    warn(`Launcher "${mode}" not found — run: plugdev setup`);
    return;
  }

  let instanceId = client?.instance ?? defaultInstanceId(opts.config.version);
  if (adapter.id === "prism" || adapter.id === "multimc") {
    const prefer =
      mode === "prism" || mode === "multimc" ? mode : ("auto" as const);
    const legacy = await detectLauncher(prefer, client);
    if (legacy) {
      instanceId = await resolveInstanceId(ctx, legacy);
      const mc = await readInstanceMcVersion(legacy, instanceId);
      if (mc && mc !== opts.config.version) {
        if (hasViaCompatDeps(opts.config.deps)) {
          warn(
            `Client MC ${mc} ≠ server ${opts.config.version} — joining via ViaVersion`,
          );
        } else {
          warn(
            `Client MC ${mc} ≠ server ${opts.config.version} — add Via* deps or match versions`,
          );
        }
      }
    }
  }

  // Prism/MultiMC: Microsoft account by default. Offline only when client.offline: true.
  // Embedded always uses offlineName (no MS auth in xmcl path yet).
  const useOffline =
    adapter.id === "embedded" || client?.offline === true;
  const offlineName = client?.offlineName ?? "DevPlayer";

  const labelFor = async (a: LauncherAdapter) =>
    clientPhaseLabel(
      a,
      a.id === "embedded" ? opts.config.version : instanceId,
      a.id === "embedded" ? await isEmbeddedClientCached(opts.config.version) : false,
    );

  phase(await labelFor(adapter), "active");

  try {
    await launchWithAdapter(
      adapter,
      ctx,
      instanceId,
      opts.config.version,
      host,
      port,
      { offlineName, useOffline },
    );
    phase(await labelFor(adapter));
  } catch (err) {
    warn(`Client launch failed: ${err instanceof Error ? err.message : String(err)}`);

    if (mode === "auto" && adapter.id !== "embedded") {
      warn("Falling back to embedded client…");
      try {
        phase("Client: embedded", "active");
        await launchWithAdapter(
          embeddedAdapter,
          ctx,
          instanceId,
          opts.config.version,
          host,
          port,
          { offlineName, useOffline: true },
        );
        const cached = await isEmbeddedClientCached(opts.config.version);
        phase(clientPhaseLabel(embeddedAdapter, opts.config.version, cached));
        return;
      } catch (embeddedErr) {
        warn(
          `Embedded client launch failed: ${embeddedErr instanceof Error ? embeddedErr.message : String(embeddedErr)}`,
        );
      }
    }

    await copyJoinAddress(address);
    if (mode === "auto") {
      info("Tip: run plugdev setup to prefetch the embedded client");
    }
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
