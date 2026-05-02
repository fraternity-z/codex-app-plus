<p align="center">
  <img src="./src/assets/official/app.png" alt="Codex App Plus 图标" width="120" />
</p>

# Codex App Plus

[简体中文](./README.zh-CN.md)

Codex App Plus is an enhanced Windows desktop client for Codex, built with `React + TypeScript + Vite + Tauri 2`.

## Key Improvements Over Official Client

- **Optimized Memory Management**: Fixed memory leaks caused by MCP process lifecycle issues, preventing unloadable child processes
- **Enhanced Process Supervision**: Improved child process management for better stability and resource cleanup
- **Additional Features**: Integrated useful capabilities inspired by [CodexMonitor](https://github.com/Dimillian/CodexMonitor)

## Core Features

- Multi-workspace and thread management
- Full conversation workflow with model selection, permission profiles, and slash commands
- Comprehensive settings management (MCP services, Git, environment, providers)
- Embedded terminal sessions with PTY support
- Git operations (stage, commit, push, branch management)
- Windows Sandbox integration
- Session timeline and protocol traffic inspection

## Tech Stack

- Frontend: React 18, TypeScript, Vite
- Desktop: Tauri 2, Rust
- Terminal: xterm, portable PTY
- Protocol: Generated from official `codex app-server`

## Requirements

- Windows OS
- Node.js LTS + pnpm
- Rust toolchain
- Official `codex` CLI (aligned to v0.128.0)

## Quick Start

### Install dependencies

```bash
pnpm install
```

### Run in development mode

```bash
pnpm run dev:tauri
```

### Build for production

```bash
pnpm run build:tauri
```

## Common Commands

| Command | Purpose |
| --- | --- |
| `pnpm run dev:tauri` | Start desktop app in development mode |
| `pnpm run build:tauri` | Build production installer |
| `pnpm run typecheck` | Run TypeScript type checking |
| `pnpm test` | Run test suite |
| `pnpm run generate:protocol` | Regenerate protocol types from codex CLI |

## Acknowledgments

Special thanks to [CodexMonitor](https://github.com/Dimillian/CodexMonitor) for inspiration on several features.

## License

See [LICENSE](./LICENSE) for details.
