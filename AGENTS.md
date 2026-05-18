# AGENTS.md

Guidance for agents working in this repository.

## Project Snapshot

- `codex-app-plus` is a Windows-first desktop client for Codex.
- Frontend: React 18, TypeScript, Vite, Vitest, CSS under `src/styles/replica`.
- Host app: Tauri 2 with Rust under `src-tauri/src`.
- Package manager: `pnpm`; lockfile is `pnpm-lock.yaml`.
- The app runs the Codex app-server through generated protocol code in `src/protocol`.

## Key Commands

- Install dependencies: `pnpm install`
- Frontend dev server: `pnpm run dev`
- Full Tauri dev app: `pnpm run dev:tauri`
- Typecheck: `pnpm run typecheck`
- Frontend tests: `pnpm run test`
- Frontend build: `pnpm run build`
- Tauri production build: `pnpm run build:tauri`
- Generate protocol files: `pnpm run generate:protocol`
- Sync bundled Codex CLI: `pnpm run sync:codex-cli`

Use the narrowest relevant command while iterating, then run the broader checks that match the change before finishing.

## Repository Layout

- `src/app`: top-level app bootstrapping, screen routing, controller wiring, theme/window hooks.
- `src/app/controller`: app-server lifecycle, protocol initialization, host event subscriptions, server-request handling, account refresh, retry logic, and Windows Sandbox setup.
- `src/features`: feature modules for conversation, composer, workspace, Git, terminal, browser, MCP, skills, settings, auth, automation, pets, preview, and notifications.
- `src/state`: external store and central reducers.
- `src/bridge`: typed frontend bridge contracts for Tauri commands and host events.
- `src/protocol`: generated Codex app-server protocol clients, guards, schemas, and tests.
- `src/domain`: shared frontend domain types and pure model helpers.
- `src/i18n`: locale infrastructure and English/Chinese message catalogs.
- `src/styles`: application CSS, mainly replica UI styles.
- `src-tauri/src/commands`: Tauri command handlers.
- `src-tauri/src/domains`: Rust domain services for app-server, auth, browser, settings, terminal, workspace, sessions, agents, dictation, and app behavior.
- `src-tauri/src/git`: Rust Git service and command implementation.
- `src-tauri/src/infra`: process, filesystem, RPC, and WSL infrastructure.
- `src-tauri/bundled`: bundled Codex CLI, Computer Use runtime, and Browser Use Node REPL helper.

## Code Style

- Match existing module boundaries and naming. Prefer adding focused functions near the feature/domain they serve.
- TypeScript is strict: avoid unused locals/parameters, keep public types explicit where existing code does, and prefer discriminated unions or typed helpers over loose `any`.
- React code uses function components, hooks, and colocated tests. Keep UI state close to the feature unless it belongs in the central store.
- Rust code is organized by `commands`, `domains`, `git`, and `infra`. Keep Tauri command handlers thin and put behavior in services/domain modules.
- Use existing bridge and protocol types rather than duplicating wire shapes.
- Keep comments sparse and useful; explain non-obvious lifecycle, process, or protocol decisions.

## Current Architecture

- Runtime flow: `src/main.tsx` creates the Tauri `HostBridge`, wraps the app in `AppStoreProvider`, and renders `src/app/App.tsx`.
- `App` composes preferences, theme/window hooks, top-level screen routing, workspace roots, automation state, notifications, and `useAppController`.
- `useAppController` is the frontend owner for Codex app-server lifecycle. It starts or reuses app-server, initializes the generated protocol client, maps host events and app-server notifications into store actions, handles server requests, account refresh, retry, and cleanup.
- `ProtocolClient` talks to app-server only through `HostBridge.rpc` and subscribes to `connection-changed`, `notification-received`, `server-request-received`, and `fatal-error` through `HostBridge.subscribe`.
- App state uses the custom external store in `src/state/store.tsx`; global transitions go through `src/state/appReducer.ts`.
- Feature code under `src/features/*` should stay domain-oriented. Prefer `hooks`, `model`, `service`, and `ui` slices over pushing orchestration into React components.
- Rust startup is centralized in `src-tauri/src/main.rs`; it registers plugins, managed state (`ProcessManager`, `TerminalManager`, `GitRuntimeState`), invoke handlers, tray behavior, and process cleanup.
- `src-tauri/src/commands/*` is a thin Tauri boundary. Business logic belongs in `src-tauri/src/domains/*`, `src-tauri/src/git/*`, or shared infrastructure in `src-tauri/src/infra/*`.
- Rust-to-frontend events are defined in `src-tauri/src/events.rs` and must stay aligned with `src/bridge/eventTypes.ts`.
- Detailed development guidance lives in `docs/development-guidelines.md`.

## Frontend/Backend Contract Rules

- New host capabilities must update the full contract chain: Rust input/output model, domain/git service, Tauri command, `main.rs` handler registration, `src/bridge/*Types.ts`, and `src/bridge/tauriHostBridge.ts`.
- React code should call host functionality through `HostBridge`; avoid direct scattered `invoke` or `listen` calls outside the bridge implementation.
- OS access, process lifecycle, file system writes, auth/config persistence, Git operations, and PTY terminal behavior belong on the Rust side.
- Protocol payloads should come from generated `src/protocol` types and guards. Do not hand-edit generated protocol files.
- For event contracts, add or change Rust emitters in `events.rs` and TypeScript event payload types together.

## Testing Guidance

- Add or update tests beside changed TypeScript files using `*.test.ts` or `*.test.tsx`.
- Existing frontend tests use Vitest with `jsdom` and setup in `src/test/setup.ts`.
- For reducer/model/parser changes, prefer small deterministic unit tests.
- For React hooks/components, follow existing Testing Library patterns and helpers such as `src/test/createI18nWrapper.tsx`.
- Rust tests are colocated in module `tests.rs` files or `#[cfg(test)]` modules. Add focused tests for parsing, service behavior, and filesystem/process edge cases where practical.
- Always run the most relevant targeted test first, then `pnpm run test` or `pnpm run typecheck` when the change warrants it.

## Generated And Bundled Files

- Treat `src/protocol` as generated unless the task is explicitly about protocol generation or tests around it.
- Do not hand-edit bundled runtime assets in `src-tauri/bundled` unless the task targets that bundled component.
- Run the relevant generator command after changing generator inputs or official protocol sources.

## Git And Workspace Safety

- The working tree may contain user or parallel-agent changes. Do not revert or overwrite unrelated changes.
- Stage only files directly related to the current task; use explicit paths, not `git add .`.
- If a requested change conflicts with existing uncommitted work, stop and report the conflict.
- Keep edits small and testable, and avoid broad refactors unless they are necessary for the task.

## Documentation Lookup

- For current library, framework, SDK, API, CLI, or cloud-service behavior, use Context7/official documentation before relying on memory.
- Do not use documentation lookup for ordinary business-logic debugging or repo-local refactoring unless an external API detail is involved.
