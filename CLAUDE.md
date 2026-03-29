# CLAUDE.md

@import .claude/skills/

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project summary

Codex App Plus is a Windows desktop shell for Codex, built with React + TypeScript + Vite on the frontend and Tauri 2 + Rust on the host side. The app starts and talks to the official `codex app-server`, then projects that protocol into a desktop UI with local state, terminal integration, Git actions, settings management, and Windows-specific host features.

## Important repo guidance

- `AGENTS.md` contains a Trellis-managed instruction block. At the start of a fresh AI workflow, use `/trellis:start` and check `@/.trellis/` if that workflow is present in the repo.
- There is no dedicated lint script in `package.json`; do not claim linting exists unless you add/configure it.
- Runtime and generated protocol artifacts are documented as aligned with `codex-cli 0.114.0`. If protocol behavior looks inconsistent, check the local `codex --version` first.

## Common commands

### Frontend / app development

- Install deps: `pnpm install`
- Run frontend only: `pnpm run dev`
- Run full desktop app: `pnpm run dev:tauri`
- Typecheck: `pnpm run typecheck`
- Run all frontend tests: `pnpm test`
- Watch frontend tests: `pnpm run test:watch`
- Run a single test file: `pnpm test -- src/features/conversation/hooks/useWorkspaceConversation.test.tsx`
- Run tests matching a name: `pnpm test -- -t "thread resume"`
- Build frontend bundle: `pnpm run build`
- Build desktop app bundle: `pnpm run build:tauri`
- Preview built frontend: `pnpm run preview`

### Rust / Tauri host checks

- Run Rust host tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Build Rust host directly: `cargo build --manifest-path src-tauri/Cargo.toml`

### Generated artifacts

- Regenerate Codex protocol TS types + JSON schema: `pnpm run generate:protocol`
- Regenerate third-party license asset: `pnpm run generate:licenses`

Notes for protocol generation:
- `scripts/generate-protocol.mjs` resolves the Codex binary from `CODEX_BINARY_PATH` first, then from `PATH`.
- On Windows it supports `codex.cmd`, `codex.exe`, `codex.ps1`, and `codex`.

## Architecture

### High-level flow

1. The React app boots through [src/app/App.tsx](src/app/App.tsx).
2. App startup logic lives in the app controller layer, centered on [src/app/controller/useAppController.ts](src/app/controller/useAppController.ts).
3. `useAppController` attaches a typed [ProtocolClient](src/protocol/client.ts) to Tauri bridge events, starts or reuses `codex app-server`, initializes the connection, and converts notifications / server requests into store actions.
4. The Rust host in [src-tauri/src/main.rs](src-tauri/src/main.rs) exposes Tauri commands for app-server lifecycle, RPC transport, Git operations, terminal sessions, auth/config management, and desktop integrations.
5. The UI reads from a custom global store and renders feature-specific screens for conversations, composer, settings, Git, terminal, workspace management, and skills.

### Frontend structure

- [src/app/](src/app/) — app shell, startup, top-level screen routing, controller orchestration.
- [src/features/](src/features/) — domain-oriented UI and logic. Major areas include `conversation`, `composer`, `settings`, `workspace`, `git`, `terminal`, `skills`, and `auth`.
- [src/bridge/](src/bridge/) — typed frontend contract for invoking Tauri commands and subscribing to host events. `HostBridge` in [src/bridge/hostBridgeTypes.ts](src/bridge/hostBridgeTypes.ts) is the boundary the React app talks to.
- [src/protocol/](src/protocol/) — generated Codex protocol types/schemas plus client and guards. Treat this as the source of truth for app-server payload shapes.
- [src/state/](src/state/) — custom store implementation and reducer pipeline.
- [src/domain/](src/domain/) — shared frontend domain types for conversations, timeline, server requests, themes, etc.

### State model

This app does not use Redux/Zustand. It uses a small custom external store in [src/state/store.tsx](src/state/store.tsx):

- `AppStoreProvider` owns a mutable store object.
- `useAppSelector` uses `useSyncExternalStore` for subscriptions.
- `appReducer` in [src/state/appReducer.ts](src/state/appReducer.ts) is the central state transition point.

When changing app behavior, look for controller-dispatched actions first, then trace how `appReducer` and the feature model helpers update conversation or UI state.

### Conversation and composer architecture

Conversation behavior is event-driven and protocol-first:

- `useAppController` receives app-server notifications and server requests.
- Notification mapping happens in `appControllerNotifications.ts`; these events drive turn lifecycle, text deltas, plan updates, diffs, review state, token usage, realtime events, and error banners.
- Conversation selection, thread lists, timelines, and workspace scoping are assembled in hooks under `src/features/conversation/hooks/`, especially [src/features/conversation/hooks/useWorkspaceConversation.ts](src/features/conversation/hooks/useWorkspaceConversation.ts).
- Composer slash-command behavior is partly local: [src/features/composer/service/composerSlashCommandExecutor.ts](src/features/composer/service/composerSlashCommandExecutor.ts) handles built-in direct commands like `/fast`, `/review`, `/plan`, `/mcp`, `/plugins`, etc. `/init` is intentionally not executed there and must go through the user message flow.

### Host bridge and backend boundary

The frontend should not reach into Tauri details directly. It should go through `HostBridge` abstractions:

- `appServer.*` starts/stops/restarts the official Codex app-server.
- `rpc.*` sends protocol requests/notifications.
- `serverRequest.resolve` answers app-server approval / token-refresh requests.
- `app.*` wraps desktop capabilities and config/auth/session operations.
- `git.*` and `terminal.*` expose host-managed Git and PTY functionality.

This separation is important: if a feature needs OS access or long-running process management, the implementation usually belongs in Rust plus the typed bridge layer, not directly in React.

### Rust host structure

The host entrypoint [src-tauri/src/main.rs](src-tauri/src/main.rs) wires together several subsystems:

- `commands.rs` — Tauri commands for app-server lifecycle, RPC, config, auth, session import/export, notifications, etc.
- `git/` — repository inspection, diffing, stage/unstage/discard, commit/sync/checkout/delete branch.
- `terminal_manager.rs` + `terminal_commands.rs` — embedded terminal session lifecycle.
- `process_manager.rs` / `process_supervisor.rs` — managed child processes.
- `codex_cli/`, `codex_auth/`, `codex_provider/`, `codex_data/` — Codex-specific host integrations and storage.
- `events.rs` / `rpc_transport.rs` / `app_server_*` — bridge transport between Tauri and the official `codex app-server`.

When debugging desktop-only behavior, inspect both the Rust command/event layer and the matching TypeScript bridge/protocol consumer.

### Testing layout

- Frontend tests use Vitest + jsdom from [vite.config.ts](vite.config.ts) and [src/test/setup.ts](src/test/setup.ts).
- Test files live alongside source as `src/**/*.test.ts` and `src/**/*.test.tsx`.
- There are many reducer/model/controller tests; prefer extending the closest colocated test file rather than creating broad new harnesses.
- Rust host tests exist under `src-tauri/src/**` and run with `cargo test --manifest-path src-tauri/Cargo.toml`.

## Practical guidance for edits

- Prefer tracing from `useAppController` for anything involving app-server lifecycle, notifications, approvals, retry logic, or bootstrap.
- Prefer tracing from `HostBridge` types before changing frontend/backend contracts.
- If protocol payloads change, regenerate `src/protocol/generated` and `src/protocol/schema` instead of hand-editing generated files.
- For UI state bugs, inspect reducer actions and feature model helpers before patching components.
- For desktop integration bugs, confirm whether the behavior belongs to React state, bridge typing, or Rust host command/event code.
