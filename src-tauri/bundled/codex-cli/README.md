# Bundled Official npm Codex CLI

This module stores an app-owned copy of the official `@openai/codex` npm
package. The app uses the official npm package layout and resolves the native
binary from:

```text
npm/node_modules/@openai/codex*/vendor/<target-triple>/codex/codex(.exe)
```

The runtime executes the native binary directly so the packaged app does not
need a user-installed Node.js or global npm package. This still keeps the files
and update flow aligned with the official npm distribution.

Sync from the repository root:

```sh
pnpm sync:codex-cli -- --source E:/code/codex
```

or install a published package:

```sh
pnpm sync:codex-cli -- --npm @openai/codex@latest
```

The generated `npm/` directory is intentionally ignored by git because release
builds should generate it from the official source or npm registry artifact.
