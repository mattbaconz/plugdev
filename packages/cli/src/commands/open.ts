import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { JOIN_HOST, launchClient, copyJoinAddress } from "../client/launch.js";
import type { ClientLauncherMode } from "../client/adapters/types.js";

export async function runOpen(
  cwd: string,
  opts: { client?: boolean; embedded?: boolean; name?: string; port?: number },
): Promise<number> {
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);
  const port = opts.port ?? config.port;

  if (opts.client || opts.name) {
    const launcher: ClientLauncherMode = opts.embedded ? "embedded" : "auto";
    const offlineName = opts.name?.trim() || config.client?.offlineName || "DevPlayer";
    await launchClient({
      config,
      launcher: opts.name ? "embedded" : launcher,
      // Wait until the game port is open (server must already be running / coming up)
      waitForServer: true,
      offlineName,
      port,
      host: JOIN_HOST,
    });
  } else {
    await copyJoinAddress(`${JOIN_HOST}:${port}`);
  }

  return 0;
}
