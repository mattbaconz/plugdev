import { detectProject } from "../detect/project.js";
import { loadConfig } from "../config/loader.js";
import { launchClient, copyJoinAddress } from "../client/launch.js";
import type { ClientLauncherMode } from "../client/adapters/types.js";

export async function runOpen(
  cwd: string,
  opts: { client?: boolean; embedded?: boolean },
): Promise<number> {
  const project = await detectProject(cwd);
  const config = await loadConfig(cwd, project);

  if (opts.client) {
    const launcher: ClientLauncherMode = opts.embedded ? "embedded" : "auto";
    await launchClient({
      config,
      launcher,
      waitForServer: false,
    });
  } else {
    await copyJoinAddress(`localhost:${config.port}`);
  }

  return 0;
}
