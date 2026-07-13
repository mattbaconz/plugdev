# Cursor plugin — PlugDev

Bundles the [plugdev skill](../skills/plugdev/) and [`@plugdev/mcp`](../packages/mcp/) for one-click agent setup.

## Local test

```powershell
# From plugdev repo root (PowerShell)
$dest = Join-Path $HOME ".cursor\plugins\local\plugdev"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
cmd /c mklink /J $dest (Get-Location).Path
```

Then **Developer: Reload Window** in Cursor. Confirm the PlugDev skill and MCP server appear under Plugins / MCP.

## Marketplace submit

1. Push this repo to `main` (includes `.cursor-plugin/plugin.json` + root `mcp.json`).
2. Submit at https://cursor.com/marketplace/publish
3. Optional community listing: https://cursor.directory

## Project wiring (without plugin)

```powershell
npm install -g @plugdev/cli
plugdev init --setup --agents --mcp
```

## skills.sh

```bash
npx skills add mattbaconz/plugdev --skill plugdev
```
