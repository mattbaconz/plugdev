import type { ResolvedConfig } from "../config/loader.js";
import { copyToClipboard } from "./clipboard.js";
import { defaultInstanceId, detectLauncher } from "./detect.js";
import { resolveAdapter, resolveInstanceId } from "./adapters/registry.js";
import { embeddedAdapter } from "./adapters/embedded.js";
import { info, success, warn, phase } from "../util/log.js";
import { waitForPortOpen } from "../util/port.js";
import {
  ensureEmbeddedClient,
  isEmbeddedClientReady,
  isMissingLibrariesError,
} from "./prefetch.js";
import { hasViaCompatDeps } from "../deps/presets.js";
import { readInstanceMcVersion } from "./detect.js";

import type { ClientLauncherMode } from "./adapters/types.js";
import type { ClientAdapterContext, LauncherAdapter } from "./adapters/types.js";

export interface LaunchClientOptions {
  config: ResolvedConfig;
  host?: string;
  port?: number;
  launcher?: ClientLauncherMode;
  waitForServer?: boolean;
  /** Override offline player name (multi-player / open --name). */
  offlineName?: string;
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
  const port = opts.port ?? opts.config.port;
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
  const offlineName =
    opts.offlineName ?? client?.offlineName ?? "DevPlayer";

  const labelFor = async (a: LauncherAdapter) =>
    clientPhaseLabel(
      a,
      a.id === "embedded" ? opts.config.version : instanceId,
      a.id === "embedded" ? await isEmbeddedClientReady(opts.config.version) : false,
    );

  phase(await labelFor(adapter), "active");

  const tryLaunch = async (a: LauncherAdapter, join: { offlineName?: string; useOffline: boolean }) => {
    await launchWithAdapter(
      a,
      ctx,
      instanceId,
      opts.config.version,
      host,
      port,
      join,
    );
  };

  try {
    await tryLaunch(adapter, { offlineName, useOffline });
    phase(await labelFor(adapter));
  } catch (err) {
    // Corrupt/incomplete libraries: repair once and retry embedded launch
    if (
      isMissingLibrariesError(err) &&
      (adapter.id === "embedded" || mode === "auto")
    ) {
      warn(`Client libraries incomplete — repairing…`);
      try {
        await ensureEmbeddedClient(opts.config.version, { force: true });
        phase("Client: embedded", "active");
        await tryLaunch(embeddedAdapter, {
          offlineName,
          useOffline: true,
        });
        const ready = await isEmbeddedClientReady(opts.config.version);
        phase(clientPhaseLabel(embeddedAdapter, opts.config.version, ready));
        return;
      } catch (repairErr) {
        warn(
          `Client repair failed: ${repairErr instanceof Error ? repairErr.message : String(repairErr)}`,
        );
      }
    }

    warn(`Client launch failed: ${err instanceof Error ? err.message : String(err)}`);

    if (mode === "auto" && adapter.id !== "embedded") {
      warn("Falling back to embedded client…");
      try {
        phase("Client: embedded", "active");
        await tryLaunch(embeddedAdapter, { offlineName, useOffline: true });
        const ready = await isEmbeddedClientReady(opts.config.version);
        phase(clientPhaseLabel(embeddedAdapter, opts.config.version, ready));
        return;
      } catch (embeddedErr) {
        warn(
          `Embedded client launch failed: ${embeddedErr instanceof Error ? embeddedErr.message : String(embeddedErr)}`,
        );
      }
    }

    await copyJoinAddress(address);
    if (mode === "auto" || adapter.id === "embedded") {
      info("Tip: plugdev cache prefetch --client --force");
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
