import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execa } from "execa";
import { z } from "zod";
import { parsePlugdevJson, type JsonResult } from "./json.js";
import { resolvePlugdevInvocation } from "./resolve-cli.js";

const MCP_VERSION = "0.2.0";
const projectRoot = process.env.PLUGDEV_PROJECT_ROOT ?? process.cwd();

async function plugdev(args: string[]): Promise<JsonResult> {
  const { command, baseArgs } = resolvePlugdevInvocation();
  const result = await execa(command, [...baseArgs, "--json", ...args], {
    cwd: projectRoot,
    reject: false,
    env: process.env,
  });

  const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  const parsed = parsePlugdevJson(combined);

  if (parsed) return parsed;

  return {
    ok: false,
    error: result.exitCode !== 0 ? combined || "plugdev command failed" : "Invalid JSON from plugdev",
    hint:
      "Ensure @plugdev/cli is available (npm i -g @plugdev/cli), or set PLUGDEV_CLI to the CLI entrypoint",
    data: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr },
  };
}

function textResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

const server = new McpServer({
  name: "plugdev",
  version: MCP_VERSION,
});

server.tool(
  "plugdev_init",
  "Scaffold plugdev.yml, prefetch server/client, and wire Cursor/Claude/Codex agent rules (init --setup --agents)",
  {
    force: z.boolean().optional().describe("Overwrite existing plugdev.yml and agent snippets"),
    agents: z
      .boolean()
      .optional()
      .describe("Write agent rules (default true)"),
    setup: z
      .boolean()
      .optional()
      .describe("Prefetch Paper/client/deps (default true)"),
  },
  async ({ force, agents, setup }) => {
    const args = ["init"];
    if (setup !== false) args.push("--setup");
    if (agents !== false) args.push("--agents");
    if (force) args.push("--force");
    const result = await plugdev(args);
    if (!result.ok && result.error) return { ...textResult(result), isError: true };
    return textResult(result.data ?? { ok: true, message: "init complete" });
  },
);

server.tool(
  "plugdev_doctor",
  "Check project toolchain, cache, and client readiness",
  {},
  async () => {
    const result = await plugdev(["doctor"]);
    // doctor may return ok:false with setupReady false — still return data
    if (!result.data && !result.ok) return { ...textResult(result), isError: true };
    return textResult(result.data ?? result);
  },
);

server.tool(
  "plugdev_setup",
  "Prefetch Paper server JAR and Minecraft client; provision Prism if found",
  {},
  async () => {
    const result = await plugdev(["setup"]);
    if (!result.ok && result.error) return { ...textResult(result), isError: true };
    return textResult(result.data ?? { ok: true, message: "setup complete" });
  },
);

server.tool(
  "plugdev_build_plugin",
  "Build the plugin JAR using Gradle or Maven",
  {},
  async () => {
    const result = await plugdev(["build"]);
    if (!result.ok) return { ...textResult(result), isError: true };
    return textResult(result.data);
  },
);

server.tool(
  "plugdev_sync_plugin",
  "Build and sync plugin JAR to the dev server plugins folder",
  {},
  async () => {
    const result = await plugdev(["sync"]);
    if (!result.ok) return { ...textResult(result), isError: true };
    return textResult(result.data);
  },
);

server.tool(
  "plugdev_start_server",
  "Start the Paper dev server (headless, no client join)",
  {
    detach: z.boolean().optional().describe("Return after server ready (default true)"),
    version: z.string().optional().describe("Minecraft version override"),
    paper: z.boolean().optional(),
    purpur: z.boolean().optional(),
    folia: z.boolean().optional(),
  },
  async ({ detach, version, paper, purpur, folia }) => {
    const args = ["server", "start"];
    if (detach === false) args.push("--no-detach");
    if (version) args.push("--version", version);
    if (paper) args.push("--paper");
    if (purpur) args.push("--purpur");
    if (folia) args.push("--folia");
    const result = await plugdev(args);
    if (!result.ok) return { ...textResult(result), isError: true };
    return textResult(result.data);
  },
);

server.tool(
  "plugdev_stop_server",
  "Stop the running dev server",
  {},
  async () => {
    const result = await plugdev(["server", "stop"]);
    if (!result.ok) return { ...textResult(result), isError: true };
    return textResult(result.data);
  },
);

server.tool(
  "plugdev_get_server_status",
  "Check if dev server is running and on which port",
  {},
  async () => {
    const result = await plugdev(["server", "status"]);
    if (!result.ok) return { ...textResult(result), isError: true };
    return textResult(result.data);
  },
);

server.tool(
  "plugdev_tail_logs",
  "Read recent server log lines",
  {
    lines: z.number().optional().describe("Number of lines (default 50)"),
  },
  async ({ lines }) => {
    const args = ["server", "logs"];
    if (lines) args.push("--lines", String(lines));
    const result = await plugdev(args);
    if (!result.ok) return { ...textResult(result), isError: true };
    return textResult(result.data);
  },
);

server.tool(
  "plugdev_run_server_command",
  "Run a console command on the dev server via RCON",
  {
    command: z.string().describe("Server command e.g. op DevPlayer or say hello"),
  },
  async ({ command }) => {
    const result = await plugdev(["server", "command", command]);
    if (!result.ok) return { ...textResult(result), isError: true };
    return textResult(result.data);
  },
);

server.tool(
  "plugdev_op_player",
  "Grant OP to a player on the dev server",
  {
    playerName: z.string(),
  },
  async ({ playerName }) => {
    const result = await plugdev(["server", "command", `op ${playerName}`]);
    if (!result.ok) return { ...textResult(result), isError: true };
    return textResult(result.data);
  },
);

server.tool(
  "plugdev_run_test_loop",
  "Build, sync, start dev server, and OP a player — one-shot test loop for agents",
  {
    playerName: z.string().optional().describe("Player to OP (default DevPlayer)"),
    version: z.string().optional(),
    paper: z.boolean().optional(),
  },
  async ({ playerName, version, paper }) => {
    const steps: Record<string, unknown> = {};

    const doctor = await plugdev(["doctor"]);
    steps.doctor = doctor;
    const setupReady = (doctor.data as { setupReady?: boolean } | undefined)?.setupReady;
    if (setupReady === false) {
      const setup = await plugdev(["setup"]);
      steps.setup = setup;
    }

    const build = await plugdev(["build"]);
    steps.build = build;
    if (!build.ok) return { ...textResult({ ok: false, steps }), isError: true };

    const sync = await plugdev(["sync"]);
    steps.sync = sync;
    if (!sync.ok) return { ...textResult({ ok: false, steps }), isError: true };

    const startArgs = ["server", "start"];
    if (version) startArgs.push("--version", version);
    if (paper) startArgs.push("--paper");
    const start = await plugdev(startArgs);
    steps.start = start;
    if (!start.ok) return { ...textResult({ ok: false, steps }), isError: true };

    const op = await plugdev(["server", "command", `op ${playerName ?? "DevPlayer"}`]);
    steps.op = op;

    return textResult({
      ok: op.ok,
      port: start.data?.port,
      player: playerName ?? "DevPlayer",
      steps,
    });
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
