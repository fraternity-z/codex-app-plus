<p align="center">
  <img src="./src/assets/official/app.png" alt="Codex App Plus icon" width="120" />
</p>

# Codex App Plus

[简体中文](./README.zh-CN.md)

Codex App Plus is a Windows-first Codex desktop client that tries to closely
replicate the official Codex App experience while adding practical local
enhancements and memory-usage optimizations. It runs the official
`codex app-server`, connects to it through the generated protocol, and presents a
desktop interface for workspaces, conversations, Git, terminals, settings,
plugins, MCP tools, and Windows integrations.

The app is built with `React + TypeScript + Vite` on the frontend and
`Tauri 2 + Rust` on the host side.

## Why This Exists

The goal is to stay as close as possible to the official Codex App in core
workflow, protocol behavior, and desktop interaction model, then layer on a few
opinionated improvements for local Windows engineering:

- Lower memory pressure through more explicit app-server, MCP, terminal, and
  child-process lifecycle management.
- Cleanup paths for long-lived child processes, especially cases where MCP or
  terminal sessions can otherwise keep resources alive after the UI no longer
  needs them.
- A Windows-native host layer for Git, PTY terminals, file opening, notifications,
  proxy handling, WSL support, and sandbox setup.
- Built-in plugin registration for Windows Computer Use and Browser Use related
  workflows.
- A fuller desktop UI for settings, workspaces, thread history, protocol traces,
  Git diffs, follow-up queues, and multi-agent work.

## Features

- Workspace and thread management with pinned threads, archived sessions, and
  cleanup tools.
- Conversation workflow with model selection, reasoning effort, service tier,
  permission profiles, plan mode, slash commands, attachments, image previews,
  queued follow-ups, and multi-agent controls.
- Generated Codex app-server protocol types and schemas under `src/protocol/`.
- MCP service status, tool/resource visibility, plugin and skill marketplace UI,
  and settings for installed plugins.
- Bundled Windows Computer Use plugin, registered as a local Codex marketplace
  on Windows native runs.
- Browser Use integration with an in-app browser backend, approval settings,
  allow/block domain lists, and browsing data cleanup.
- Embedded terminal sessions backed by `portable-pty` and rendered with xterm.
- Git status, diffs, staging, commits, branch operations, push/pull/fetch, and
  managed worktrees.
- Settings for appearance, language, fonts, code style, proxy, Git defaults,
  global instructions, custom agents, pets, notifications, app updates, and
  third-party license viewing.
- Windows Sandbox setup flow and Windows/WSL agent environment switching.
- Bundled official `@openai/codex` npm distribution, currently aligned to
  `0.129.0`.

## Architecture

At runtime the React app talks to a typed host bridge, and the Tauri host owns
OS access and long-running processes.

- `src/app/` boots the app, owns top-level routing, and connects the app
  controller to the protocol client.
- `src/features/` contains domain UI and behavior for conversation, composer,
  settings, workspace, Git, terminal, browser, skills, MCP, auth, and pets.
- `src/state/` implements the custom external store and central reducer.
- `src/bridge/` defines the typed frontend contract for Tauri commands and host
  events.
- `src/protocol/` contains generated Codex protocol clients, types, schemas, and
  guards.
- `src-tauri/src/` contains the Rust host modules for app-server lifecycle, RPC,
  Git, terminals, bundled plugins, bundled Codex CLI, browser backend, auth,
  config, proxy settings, notifications, workspace state, and Windows helpers.
- `src-tauri/bundled/` contains packaged runtime assets such as Computer Use,
  the official Codex CLI npm bundle, and the Browser Use Node REPL MCP helper.

## Requirements

- Windows 10/11.
- Node.js LTS and pnpm.
- Rust toolchain for Tauri development and builds.
- WebView2 runtime, normally already present on current Windows installs.
- Optional: WSL if you want agents to run in a Linux distribution.

Normal desktop runs prefer the bundled official Codex CLI. Set
`CODEX_APP_PLUS_ALLOW_SYSTEM_CODEX=1` only when you intentionally want to allow a
system `codex` fallback.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run the full desktop app in development mode:

```bash
pnpm run dev:tauri
```

Build a production installer:

```bash
pnpm run build:tauri
```

## Common Commands

| Command | Purpose |
| --- | --- |
| `pnpm run dev` | Start the Vite frontend only |
| `pnpm run dev:tauri` | Start the full desktop app in development mode |
| `pnpm run build` | Typecheck and build the frontend bundle |
| `pnpm run build:tauri` | Build the production Tauri installer |
| `pnpm run typecheck` | Run TypeScript type checking |
| `pnpm test` | Run the Vitest suite |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Run Rust host tests |
| `pnpm run generate:protocol` | Regenerate protocol types and schemas from the Codex CLI |
| `pnpm run generate:licenses` | Regenerate the bundled third-party license asset |
| `pnpm run sync:codex-cli` | Sync the bundled official `@openai/codex` npm package |

## Development Notes

- There is no dedicated lint script in `package.json`; use typecheck, targeted
  tests, and builds as the current verification path.
- Protocol files are generated. Regenerate them instead of hand-editing
  `src/protocol/generated` or `src/protocol/schema`.
- Frontend tests use Vitest and jsdom, colocated next to source files.
- Rust host tests live under `src-tauri/src/**` and are run through Cargo.
- Third-party license data is generated into
  `src/assets/third-party-licenses.json` and is surfaced from the app settings.

## Acknowledgments

Codex App Plus builds on a number of open-source projects and plugin ecosystems:

- [OpenAI Codex](https://github.com/openai/codex) and the official
  `@openai/codex` npm distribution for the app-server protocol and runtime.
- [iFurySt/open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use),
  which the bundled Windows Computer Use runtime and packaging are based on and
  adapted from. See
  `src-tauri/bundled/computer-use-windows/THIRD_PARTY_NOTICES.md`.
- OpenAI's Browser Use plugin ecosystem; Codex App Plus adds local registration
  and a Node REPL MCP helper for the in-app browser workflow.
- [CodexMonitor](https://github.com/Dimillian/CodexMonitor), which inspired
  several desktop workflow ideas.
- [Tauri](https://tauri.app/), React, Vite, TypeScript, xterm, portable-pty,
  Vitest, and the other JavaScript/Rust dependencies listed in
  `package.json`, `pnpm-lock.yaml`, and `src-tauri/Cargo.lock`.

Third-party packages remain under their respective licenses. The generated
license inventory can be refreshed with `pnpm run generate:licenses`.
