import { runUpdateCommand } from "../util/update-check.js";

export async function runUpdate(
  cwd: string,
  opts: { check?: boolean } = {},
): Promise<number> {
  return runUpdateCommand({ checkOnly: opts.check === true, cwd });
}
