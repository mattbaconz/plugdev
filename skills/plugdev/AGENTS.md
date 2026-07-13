# PlugDev — agent entry

This skill teaches coding agents to set up and drive [PlugDev](https://pluglabs.app/plugdev), the local Minecraft plugin test environment.

## Install this skill

```bash
npx skills add mattbaconz/plugdev --skill plugdev
```

## Canonical setup (best env)

```powershell
npm install -g @plugdev/cli
plugdev init --setup --agents --mcp
plug run
```

## Prefer

- `plug run` over manually starting Paper and copying JARs
- `plug doctor` when detection or boot fails
- MCP tools (`plugdev_*`) for headless server control when MCP is configured
- Safe JAR reload — never Bukkit `/reload`
- Full restart on Folia

## Do not

- Treat PlugDev as an AI plugin generator
- Delete `~/.plugdev` unless the user asks

See [SKILL.md](./SKILL.md) and [references/mcp.md](./references/mcp.md).
