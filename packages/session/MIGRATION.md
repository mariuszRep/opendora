# MIGRATION.md — packages/session

> Owner: agents. Transition memory for session's slice of the **Unified Durable Run** migration.
> Master plan and phase ordering: root `/MIGRATION.md`. Read it first. Everything here is **planned** unless marked shipped.

## Session's role in this migration

Session already proves the target model for conversations: `SessionPrompt.loop` (`src/prompt.ts`) holds no conversation state in memory — it rebuilds context each iteration from `MessageV2.stream(sessionID)`. This migration extends that event-sourced ledger with an explicit **run state** layer (cursor, context, step journal, status) so workflows get the same durability, and defines the built-in chat workflow so a conversation *is* the simplest workflow.

## Stale-doc blocker (resolve before Phase 1)

`packages/session/AGENTS.md` is currently a leftover `@pingpong/core` document (`ping`/`pong`, `@pingpong/core/sqlite`, a `packages/core/src/` layout). It does not describe OpenDora's actual session code (`prompt.ts`, `session.ts`, `session.sql.ts`, `MessageV2`, the Drizzle `SessionTable`/`MessageTable`/`PartTable`). Rewrite it to reflect reality before adding checkpoint guidance, otherwise new run-state rules will have no correct home. Tracked here as a prerequisite, not as part of any feature phase.

## Phase 1 — Run state shape + checkpoint tables (with storage)

- Define the durable **run state** type: `{ cursor, ctx, stepJournal[], status }`, `status ∈ { running, suspended, done, error }`. This is the session-owned shape; storage owns the persistence contract (`packages/storage/MIGRATION.md`).
- Add a Drizzle-backed checkpoint table next to `SessionTable`/`MessageTable`/`PartTable` in `src/session.sql.ts`, keyed by `runId` (= `sessionID`) + ordered `checkpointId` + `parentCheckpointId`.
- Reuse existing columns where possible: `parent_session_id` already models nested runs; `session_status` already models lifecycle — extend rather than duplicate.
- **Sources:** `langgraph` `libs/checkpoint-sqlite/.../sqlite/__init__.py` (table design), the conformance spec for tests.
- **Exit:** table + run-state type exist and round-trip through storage; nothing reads it during a live run yet.

## Phase 2 — Resume replaces reconcile

- `Session.reconcileInterruptedToolParts` (`src/session.ts`) currently marks `pending`/`running` tool parts as errored after a restart. Once the workflow runner is checkpoint-driven, this becomes **resume-from-checkpoint**: re-hydrate run state and continue at the next uncompleted step instead of failing the part.
- Keep the error path only as a fallback when a checkpoint is genuinely unrecoverable.
- The existing `onConflictDoUpdate`-by-id upserts in `Session.updateMessage`/`updatePart` already behave like an `add_messages` reducer — formalize that as the merge rule for journal entries so replay is idempotent.

## Phase 3 — Suspended status

- Add a first-class `suspended` run status to session lifecycle, with an opaque resume token stored on the run state. The agent-visible surface (message parts, synthetic workflow tool messages, permission events) must be identical whether the run is fresh or resumed.

## Phase 4 — Built-in chat workflow

- Capture the conversation loop as the canonical single-node `assistant_turn` workflow shape so conversations and workflows share one step-journaled executor (owned by runtime). Session records the journal identically for both.

## Cross-cutting rules

- Session defines and records the run state shape; it never decides when to checkpoint/resume/suspend (runtime) or where to persist (storage).
- Do not reintroduce in-memory-only run state as a source of truth.

## Cross-references

- Loop: `src/prompt.ts` (`SessionPrompt.loop`)
- Persistence + reconcile: `src/session.ts` (`updateMessage`, `updatePart`, `reconcileInterruptedToolParts`)
- Schema: `src/session.sql.ts`
- Storage contract: `packages/storage/MIGRATION.md`
- Runner that becomes checkpoint-driven: `packages/workflow/MIGRATION.md`
