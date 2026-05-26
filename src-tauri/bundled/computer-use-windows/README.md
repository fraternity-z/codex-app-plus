# Bundled Windows Computer Use

This folder is a self-contained Windows Computer Use module for Codex App Plus.

Layout:

- `runtime/` contains the extracted Windows-only Go MCP server and embedded PowerShell UI Automation bridge.
- `.agents/plugins/marketplace.json` exposes a local Codex marketplace named `codex-app-plus-bundled`.
- `plugins/computer-use/` is the bundled Codex plugin. Its MCP server name is `computer-use`, matching Codex's Computer Use integration. It also includes the `computer-use` skill with action-time safety confirmation rules adapted for Windows.
- `plugins/computer-use/open-computer-use.exe` is the built Windows runtime used by the plugin.

The MCP server keeps a persistent PowerShell UI Automation worker while the server is running. This avoids paying the UIAutomation assembly load and Win32 bridge setup cost on every tool call; one-shot PowerShell execution remains available as a fallback. Use `activate_app` before modifier keyboard shortcuts when the target window is not already foreground; after explicit activation, the worker may re-activate that same app for subsequent modifier shortcuts in the same session. Text entry requires a writable text target by default; raw text injection into an ambiguous main window is disabled unless `OPEN_COMPUTER_USE_WINDOWS_ALLOW_RAW_TEXT_FALLBACK=1` is explicitly set for trusted local debugging.

Rebuild the runtime after changing `runtime/`:

```powershell
.\src-tauri\bundled\computer-use-windows\build.ps1
```

Codex App Plus materializes this whole folder into a versioned local app data directory at startup, installs `plugins/computer-use/` into the Codex plugin cache at `~/.codex/plugins/cache/codex-app-plus-bundled/computer-use/<version>/`, and writes the required `marketplaces.codex-app-plus-bundled` / `plugins."computer-use@codex-app-plus-bundled"` entries into `~/.codex/config.toml` before starting `codex app-server`.

App access can be constrained in `~/.codex/computer-use/config.toml`:

```toml
[apps]
require_approvals = false
allowed = []
denied = ["powershell", "pwsh", "cmd", "wt", "diskmgmt", "regedit", "bitwarden"]
```

`denied` entries always block access, including app listing output. New policy files block common Windows shells, terminal hosts, disk-management consoles, registry tools, credential prompts, and password managers by default so dangerous local operations go through safer Codex tooling or manual user control instead of UI automation. The runtime also keeps a built-in protected-app deny layer before normal app policy checks, and it refuses to inspect or control the desktop while Windows is locked or a secure non-Default input desktop is active.

When `allowed` is non-empty, Computer Use only inspects or controls matching process names. Set `require_approvals = true` or `OPEN_COMPUTER_USE_WINDOWS_REQUIRE_APP_APPROVALS=1` to require explicit entries even while `allowed` is empty. Set `OPEN_COMPUTER_USE_WINDOWS_ALLOW_UNAPPROVED_APPS=1` to temporarily bypass the allow list while still honoring `denied`.

Snapshots redact password-like fields, window titles, and common secret patterns. If sensitive controls or known secret-looking text are present, the runtime omits the screenshot and returns the redacted accessibility tree instead.

Action guards run before input is sent. Element clicks, coordinate clicks, text entry, confirmation keys, and Windows global keyboard shortcuts are blocked when the target or current dialog appears to delete data, format storage, reveal or submit credentials, send/publish/submit data, create financial side effects, or escape the target app into privileged system surfaces. Coordinate actions first resolve the hit-tested UI element from the latest snapshot, so safe controls can still be used on screens that also contain risky controls; unknown coordinate targets stay blocked in risky contexts.

Error tool results keep the normal text message and also include a machine-readable `errorCode`, such as `app_not_found`, `missing_app_state`, `app_policy_blocked`, `desktop_locked`, `action_blocked`, `unknown_element`, `invalid_arguments`, or `windows_runtime_error`. Callers should use this code to recover cleanly instead of parsing prose.

## Attribution

The Windows Computer Use runtime and plugin packaging in this module are based on and adapted from [iFurySt/open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use), which is licensed under the MIT License. Keep this attribution and the third-party license notice when modifying or redistributing this module. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
