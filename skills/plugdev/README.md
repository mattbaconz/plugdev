# plugdev

Agent skill for the PlugDev Minecraft plugin test loop — set up the best local Paper/Folia env, run `plug run`, and optionally wire MCP for headless control.

[![Install with skills](https://skills.sh/badge.svg)](https://skills.sh/mattbaconz/plugdev/plugdev)

## Install

```bash
npx skills add mattbaconz/plugdev --skill plugdev
```

Global (personal ADE):

```bash
npx skills add mattbaconz/plugdev --skill plugdev -g -y
```

Then ask your agent:

```text
Set up PlugDev for this Minecraft plugin and run the test loop
```

## What the skill does

1. Installs `@plugdev/cli` if missing
2. Runs `plugdev init --setup --agents --mcp`
3. Prefers `plug run` / `plug doctor` over manual Paper + JAR copy
4. Uses MCP tools when configured for headless server control

## Requirements

- Node.js 20+
- Java 21+ (Java 25+ for Paper/Folia 26.x)
- A Paper-family plugin project (Gradle or Maven)

## Related

- CLI: [`@plugdev/cli`](https://www.npmjs.com/package/@plugdev/cli)
- MCP: [`@plugdev/mcp`](https://www.npmjs.com/package/@plugdev/mcp)
- Docs: [pluglabs.app/plugdev](https://pluglabs.app/plugdev)
- Site agents page: [pluglabs.app/plugdev/agents](https://pluglabs.app/plugdev/agents)
