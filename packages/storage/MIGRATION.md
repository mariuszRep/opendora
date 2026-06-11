# MIGRATION.md — packages/storage

> Owner: agents. Transition memory for storage's slice of the **Unified Durable Run** migration.
> Master plan and phase ordering: root `/MIGRATION.md`. Read it first. Everything here is **planned** unless marked shipped.

## Storage's role in this migration

Storage gains one new contract: the **run-state / checkpoint contract**. It is the stable, backend-agnostic interface through which a run's durable snapshot is persisted and retrieved. Storage stores; it never orchestrates (no checkpoint/resume/replay decisions — those are runtime's).

## Phase 1 — Run-state / checkpoint contract (this package leads)

Add a contract modeled on LangGraph's `BaseCheckpointSaver` and vercel/workflow's `World`:

- **Identity** — a run is keyed by `runId` (= `sessionID`), with an optional namespace and an ordered `checkpointId`, plus `parentCheckpointId` for branching/time-travel. Mirror LangGraph's `{thread_id, checkpoint_ns, checkpoint_id}` triple.
- **Snapshot shape** — `{ cursor, ctx, stepJournal[], status }` where `status ∈ { running, suspended, done, error }`. `ctx` merges via reducer semantics (Phase 4); `stepJournal` records completed steps so replay skips them.
- **Operations** — `getRunState`, `listRunStates`, `putRunState`, `putStepWrites` (append journal entries). Names follow LangGraph's `get_tuple`/`list`/`put`/`put_writes`.
- **Serialization** — values may include errors, aborted states, and stream remnants. Borrow vercel/workflow `packages/serde`'s reviver approach rather than raw `JSON.stringify`. `needs verification`: confirm which value types actually appear in OpenDora run ctx before fixing the reviver set.

Implement across the existing adapter family so it stays backend-swappable, exactly like the current jsonl/sqlite/postgres split (and like vercel `world` / `world-local` / `world-postgres`). The concrete table lives next to the session schema — see `packages/session/MIGRATION.md`.

**Sources to study:** `langchain-ai/langgraph` `libs/checkpoint/langgraph/checkpoint/base/__init__.py` (interface), `libs/checkpoint-sqlite/.../sqlite/{__init__,aio}.py` (concrete saver), `libs/checkpoint-conformance/.../spec/` (port as tests); `vercel/workflow` `packages/world`, `packages/world-local`, `packages/serde`.

**Exit criteria:** contract defined, adapter implementations pass a ported conformance suite, no other package reads it yet (no behavior change).

## Later phases (storage as a dependency)

- **Phase 2** — `workflow` writes/reads run state through this contract. Storage adds nothing new beyond what Phase 1 defines unless journal volume needs pagination.
- **Phase 3** — suspend/resume adds a resume-token field to the snapshot; keep it opaque to storage.

## Cross-cutting rules

- Do not leak orchestration semantics into storage. No "should I resume?" logic here.
- Keep the contract free of domain types; it stores opaque run snapshots, not message/agent/workflow schemas.
- All methods return `Promise` (consistent with the existing adapter contract).

## Open questions (`needs verification`)

- Exact signatures of LangGraph's saver and vercel `world` at current `main` — confirm before locking method names.
- Whether checkpoints are full snapshots, deltas, or both (LangGraph supports incremental channel versions); decide based on OpenDora journal size.
