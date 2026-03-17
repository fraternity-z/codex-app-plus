<p align="center">
  <img src="./src/assets/official/app.png" alt="Codex App Plus 图标" width="120" />
</p>

# Codex App Plus

[简体中文](./README.zh-CN.md)

Codex App Plus is a Windows desktop shell for Codex, built with `React + TypeScript + Vite + Tauri 2`.
The project bridges the official `codex app-server` and `codex CLI` protocol capabilities into a local desktop experience with explicit state, visible errors, and host-level integrations.

## What The Project Does

- Workspace and thread management
  - Add, switch, and remove multiple workspaces
  - Create threads, switch between them, and restore local Codex sessions
  - Browse archived threads and delete local sessions
- Conversation and Composer workflow
  - Send turns, interrupt responses, and manage follow-up queues
  - Pick model, reasoning effort, and service tier
  - Switch permission profiles, attach context, and use slash commands
  - Show plan drawers, context window indicators, and experimental multi-agent signals when the protocol supports them
- Settings and configuration
  - Manage general preferences, config, personalization, MCP services, Git, environment, worktree, and archived-thread pages
  - Open `config.toml`
  - Read and write global agent instructions
  - List, create, update, delete, and apply Codex providers
  - Read Windows Sandbox configuration and run setup flows
- Desktop and host integration
  - Open external links and workspace folders
  - Show system notifications and context menus
  - Import official app data
  - Assist with ChatGPT auth token read and write flows
- Developer tooling inside the app
  - Create, resize, write to, and close embedded terminal sessions
  - Inspect Git state and run stage, unstage, discard, commit, fetch, pull, push, checkout, and init actions
  - Surface session timelines, server request/response traffic, and fatal host errors

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Vitest
- Desktop host: Tauri 2, Rust, portable PTY support
- Rich content and terminal UI: `react-markdown`, `remark-gfm`, `highlight.js`, `xterm`
- Protocol layer: generated TypeScript types and JSON Schema derived from the official `codex app-server`

## Runtime And Version Alignment

- The app depends on a locally installed official `codex` CLI at runtime because the desktop host starts `codex app-server` through it
- The current repository documentation and generated protocol artifacts are aligned to `codex-cli 0.114.0`
- If your local `codex` CLI is significantly newer or older than `0.114.0`, protocol fields, events, or runtime behavior may drift
- Verify the local installation first:

```bash
codex --version
```

- On Windows, if `codex` is not available on `PATH`, add it to `PATH` or point `CODEX_BINARY_PATH` at the executable when regenerating protocol artifacts

## Repository Layout

```text
.
├─ src/
│  ├─ app/                  App bootstrap and controller orchestration
│  ├─ bridge/               Typed bridge for Tauri commands and events
│  ├─ features/             Feature-domain React code
│  ├─ protocol/             Generated protocol types, schema, guards, and tests
│  ├─ state/                Global state and reducers
│  └─ assets/               Official assets and generated license data
├─ src-tauri/               Rust host runtime, commands, events, Git, and terminal logic
├─ scripts/                 Protocol and license generation scripts
├─ docs/                    Supporting project documentation
├─ README.md                Main documentation in English
└─ README.zh-CN.md          Chinese documentation
```

## Development Steps

### 1. Prepare the environment

You will typically need:

- Windows for the full desktop workflow
- A recent Node.js LTS release
- `pnpm`
- Rust toolchain and the dependencies required by Tauri 2
- The official `codex` CLI

Notes:

- Day-to-day desktop runtime depends on the local `codex` CLI because the app needs it to launch `app-server`
- Protocol output is already committed, so you do not need to regenerate protocol artifacts on every change
- However, without a local `codex` CLI, the desktop host flow itself cannot run end to end

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start the desktop app in development mode

```bash
pnpm run dev:tauri
```

This launches the Vite frontend together with the Tauri host runtime.

### 4. Start the frontend only when you do not need the host

```bash
pnpm run dev
```

Use this mode for UI iteration that does not depend on Tauri commands or host events.

### 5. Run verification before committing

```bash
pnpm run typecheck
pnpm test
```

### 6. Build distributable artifacts

```bash
pnpm run build
pnpm run build:tauri
```

`build` validates TypeScript and produces the frontend bundle.
`build:tauri` builds the frontend first and then packages the desktop application.

## Common Scripts

| Command | Purpose |
| --- | --- |
| `pnpm run dev` | Start the Vite development server |
| `pnpm run dev:tauri` | Start the desktop app in Tauri development mode |
| `pnpm run build` | Run TypeScript checks and build the frontend bundle |
| `pnpm run build:tauri` | Build the frontend and package the Tauri app |
| `pnpm run preview` | Preview the built frontend locally |
| `pnpm run typecheck` | Run TypeScript type checking |
| `pnpm test` | Run the Vitest suite |
| `pnpm run generate:protocol` | Regenerate protocol TypeScript types and JSON Schema |
| `pnpm run generate:licenses` | Regenerate `src/assets/third-party-licenses.json` |

## Generated Artifacts

### Protocol generation

Run the following when the upstream Codex protocol changes or when you upgrade the local `codex` CLI:

```bash
pnpm run generate:protocol
```

The script reads `CODEX_BINARY_PATH` first. If that variable is not set, it searches the executable from `PATH`, including common names such as `codex`, `codex.cmd`, `codex.exe`, and `codex.ps1`.

Example on Windows PowerShell:

```powershell
$env:CODEX_BINARY_PATH = "C:\\path\\to\\codex.cmd"
pnpm run generate:protocol
```

This refreshes:

- `src/protocol/generated`
- `src/protocol/schema`

Notes:

- Protocol generation depends on the local `codex` CLI
- To avoid mismatches between generated artifacts and runtime behavior, use `codex-cli 0.114.0` for both generation and local runtime whenever possible

### License data generation

If dependency metadata changes, refresh the generated third-party license file with:

```bash
pnpm run generate:licenses
```

## Runtime Notes

- The app is protocol-first: frontend and host communication flows through typed bridge calls and protocol payloads.
- Host failures are expected to surface explicitly instead of falling back silently.
- Local application data is stored under `%LOCALAPPDATA%\\CodexAppPlus` by default.

## Versioning Policy

Starting from `1.2.2`, project versions follow Semantic Versioning (SemVer), and release tags must use `vX.Y.Z` or a prerelease form such as `vX.Y.Z-beta.N`.

- `PATCH`: `1.2.2 -> 1.2.3`
  Use for bug fixes, style or copy corrections, build or release workflow fixes, and performance improvements that do not add a new user-facing capability
- `MINOR`: `1.2.2 -> 1.3.0`
  Use for new features that keep existing configuration, data, and usage flows compatible
- `MAJOR`: `1.2.2 -> 2.0.0`
  Use for breaking changes such as incompatible config formats, protocol fields, data layout changes, or plugin / skill interface changes

Practical rule of thumb:

- Fix something: bump `PATCH`
- Add something: bump `MINOR`
- Break compatibility: bump `MAJOR`

Additional rules:

- Historical tags before `1.2.2` remain as-is and are not rewritten
- This policy applies from `1.2.2` onward
- The release workflow derives the build version from the tag, so installer versioning should match the GitHub release tag
