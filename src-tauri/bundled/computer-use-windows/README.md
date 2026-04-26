# Bundled Windows Computer Use

This folder is a self-contained Windows Computer Use module for Codex App Plus.

Layout:

- `runtime/` contains the extracted Windows-only Go MCP server and embedded PowerShell UI Automation bridge.
- `.agents/plugins/marketplace.json` exposes a local Codex marketplace named `codex-app-plus-bundled`.
- `plugins/computer-use/` is the bundled Codex plugin. Its MCP server name is `computer-use`, matching Codex's Computer Use integration.
- `plugins/computer-use/open-computer-use.exe` is the built Windows runtime used by the plugin.

Rebuild the runtime after changing `runtime/`:

```powershell
.\src-tauri\bundled\computer-use-windows\build.ps1
```

Codex App Plus materializes this whole folder into a versioned local app data directory at startup and writes the required `marketplaces.codex-app-plus-bundled` / `plugins."computer-use@codex-app-plus-bundled"` entries into `~/.codex/config.toml` before starting `codex app-server`.
