# AGENTS.md

Local instructions for `packages/opencode`.
Read the root file set first, then this package's `SCOPE.md`, `STATE.md`, and `ROADMAP.md`.

## Scope rules

- Keep `opencode` changes inside this package unless the change is clearly a shared contract change.
- Treat this package as the main runtime surface for the repository: CLI, server, TUI, tools, providers, storage integration, and project/session orchestration live here.
- When changing API behavior that affects consumers, check whether `packages/sdk/js` or `packages/ai-sdk` also need updates.

## Database and migration rules

- Drizzle schema lives in `src/**/*.sql.ts`.
- Tables and columns use snake_case.
- Join columns use `<entity>_id`.
- Indexes use `<table>_<column>_idx`.
- Generate migrations with `bun run db generate --name <slug>`.
- Migration output is expected under `migration/<timestamp>_<slug>/`.
- Tests that inspect migrations should account for the per-folder migration layout rather than `_journal.json`.

## Agent workflow expectations

- Prefer the existing utilities in `src/util`, `src/storage`, and `src/tool` before adding parallel abstractions.
- Keep shell execution changes conservative; see the local roadmap before expanding shell usage patterns.
- Avoid editing generated migration snapshots manually unless the task explicitly requires it.

## Boundaries

- `packages/opencode` owns runtime behavior.
- `packages/agent` owns file-based agent template definitions and storage helpers.
- `packages/sdk/js` owns the consumable SDK surface.
- `packages/pingpong-core` owns the separate session/storage core library that `opencode` depends on.
