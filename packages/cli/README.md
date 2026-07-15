# @plugdev/cli

**`plugdev` opens a TUI; `plug run` starts the test loop.**

```powershell
npm install -g @plugdev/cli@0.12.5
cd your-plugin
plugdev init --setup
plugdev          # TUI: configure + run
plug run         # one-shot loop
```

`plug` and `plugdev` are the same CLI.

- Detect Gradle/Maven (including multi-module reactors)
- Paper-family server + deps cache in `~/.plugdev/`
- Safe reload on save; optional `--hotswap`
- Client join (embedded or Prism)
- TUI: configure, module pick, deps

Docs: [github.com/mattbaconz/plugdev](https://github.com/mattbaconz/plugdev) · [pluglabs.app/plugdev](https://pluglabs.app/plugdev) · [Discord](https://discord.gg/C4X3rThtAM)
