# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React + TypeScript frontend: `app/` bootstraps the shell, `features/` holds feature slices, `bridge/` wraps Tauri APIs, `state/` stores reducers and providers, and `protocol/` keeps generated Codex protocol types and schema. `src-tauri/` contains the Rust host, command handlers, Git support, and terminal/runtime integration. Use `scripts/` for generators, `docs/` for design notes, and treat `dist/`, `node_modules/`, and `src-tauri/target/` as generated output.

## Build, Test, and Development Commands
Use `pnpm install` once to sync dependencies. `pnpm run dev` starts the Vite UI only; `pnpm run dev:tauri` launches the full desktop app. `pnpm run build` runs `tsc --noEmit` and builds the frontend bundle, while `pnpm run build:tauri` packages the Tauri app. Verification commands are `pnpm run typecheck`, `pnpm test`, and, when editing Rust code, `cargo test --manifest-path src-tauri/Cargo.toml`. Regenerate checked-in artifacts only when needed with `pnpm run generate:protocol` or `pnpm run generate:licenses`.

## Coding Style & Naming Conventions
Match the existing codebase instead of introducing new patterns. TypeScript uses 2-space indentation, double quotes, `PascalCase` for React components, `useX` for hooks, and colocated domain files such as `conversationState.ts` with sibling `*.test.ts(x)` files. Rust modules in `src-tauri/src/` use `snake_case` and should stay `rustfmt`-friendly. Keep boundaries clear between frontend state, feature UI, typed bridge calls, and host commands. Do not add silent fallbacks; surface failures explicitly.

## Testing Guidelines
Frontend tests run on Vitest with Testing Library and shared setup from `src/test/setup.ts`. Prefer colocated `*.test.ts` and `*.test.tsx` files, plus `src/protocol/__tests__/` for protocol contracts. Cover new reducers, hooks, and UI behaviors close to the changed module. If you touch Tauri or Rust-only logic, add or update `cargo test` coverage in the relevant module.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit style such as `feat: add support for custom prompts` and `feat(proxy): add proxy settings management`. Keep the type prefix (`feat`, `fix`, `refactor`, `docs`) and optional scope, then write a short imperative summary in English or Chinese. Pull requests should describe user-visible behavior, list verification commands, link related issues, and include screenshots or recordings for UI changes.

## Agent-Specific Notes
Before editing, read this file, `README.md`, and the relevant implementation files. Keep changes minimal, follow existing architecture and test constraints, and run the checks that match the files you changed.
