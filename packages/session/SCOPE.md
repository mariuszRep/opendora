# SCOPE.md

## What this package is

`packages/pingpong-core` is a standalone session and storage core library published as `@pingpong/core`.

## What this package owns

- domain types for sessions and messages
- session lifecycle and retention logic
- the storage adapter interface
- bundled JSONL, SQLite, and Postgres adapters
- process-local bus behavior for this library

## What this package does not own

- LLM provider integrations
- UI concerns
- channel-specific runtime orchestration
- repository-wide runtime behavior in `packages/opencode`

## Boundaries

- This package is intentionally storage-aware but runtime-agnostic.
- Consumers such as `packages/opencode` should depend on its public exports rather than package-internal files.
