# STATE.md

## Current repository shape

The repository is a Bun workspace monorepo with these configured workspaces:

- `packages/agent`
- `packages/opencode`
- `packages/sdk/js`
- `packages/util`
- `packages/ai-sdk`
- `packages/pingpong-core`

## What is known to work today

- Root `bun run dev` starts `packages/opencode` in local development mode.
- Root `bun run serve` starts `packages/opencode` as an API server on port `4096`.
- Root `bun run dev:ui` runs the API and the Next.js UI in `packages/ai-sdk` together.
- Root `bun run typecheck` delegates to Turbo.
- Root `bun test` is intentionally disabled and exits with an error telling callers not to run tests from the root.

## Package roles visible from code

- `packages/opencode` is the main runtime and publishes the `opendora` CLI binary.
- `packages/agent` exports file-based agent management plus built-in template definitions.
- `packages/ai-sdk` is a private Next.js app and currently redirects `/` to `/dashboard`.
- `packages/sdk/js` exports TypeScript client/server entry points and generated v2 SDK code.
- `packages/util` exports shared utility modules.
- `packages/pingpong-core` exports a separate `@pingpong/core` library with storage adapter subpath exports.

## Existing documentation state

- Root `README.md` describes the repository at a high level.
- `packages/opencode` already had package-specific documentation, including a database-focused `AGENTS.md` and a migration plan.
- `packages/pingpong-core` already had detailed `AGENTS.md`, `STATE.md`, and backlog material.

## Unknown or needs verification

- Whether all README examples still match current runtime behavior needs verification.
- Whether every package is actively maintained to the same degree is unknown.
- Whether `packages/ai-sdk` is production-ready or still experimental needs verification.
