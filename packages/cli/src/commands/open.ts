import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { launchClient, copyJoinAddress } from "../client/launch.js";
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
      waitForServer: false,
      offlineName,
      port,
      host: "localhost",
    });
  } else {
    await copyJoinAddress(`localhost:${port}`);
  }

  return 0;
}
