# @plugdev/cli

**`plug run` / `plugdev run` for Minecraft plugins.**

```powershell
npm install -g @plugdev/cli
cd your-plugin
plugdev init --setup
plug run
```

Both `plug` and `plugdev` are installed. Same commands either way.

- Paper + Via* + Vault/Essentials/MineConomy (modular) + embedded client
- Void world with a solid platform
- Safe reload on `src/` save
- Type server commands in the same terminal after ready (RCON)
- `plug clean` / `run.cleanup` for disk lifecycle

### AI agents

```powershell
plugdev agent install --all
# or: --cursor / --claude / --codex
```

Optional MCP (experimental): `npx @plugdev/mcp` — same loop for agents; not a public “AI product” promo.

Full docs: [github.com/mattbaconz/plugdev](https://github.com/mattbaconz/plugdev) · [pluglabs.app/plugdev](https://pluglabs.app/plugdev)
