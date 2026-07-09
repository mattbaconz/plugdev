# PlugDev GUI (experimental spike)

Thin Tauri 2 shell around the PlugDev CLI. **Not a product** — proves Start/Stop + log stream + RCON command box.

## Prerequisites

- Rust + Cargo
- Node 20+
- Global CLI: `npm i -g @plugdev/cli`
- A Paper plugin project with `plugdev.yml`

## Run

```powershell
cd apps/gui
npm install
npm run tauri dev
```

1. Paste the project folder path
2. **Start** → spawns `plugdev run`
3. After the server is ready, type `list` or `op DevPlayer` and **Send** (uses `plugdev server command` + session RCON)

## Scope cut

No Prism UI, marketplace, auto-update, or installer. Kill via **Stop** (process kill).
