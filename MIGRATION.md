# MIGRATION.md — Unified Durable Run

> Owner: agents. This is transition memory, not product intent and not status truth.
> Intent lives in the relevant `VISION.md`. Current implementation state lives in code.
> Everything below is **planned** unless a phase is explicitly marked shipped. Do not present planned work as implemented.

## Why this migration exists

OpenDora has two execution paths that should be one:

- **Conversations** are already event-sourced. `packages/session/src/prompt.ts` (`SessionPrompt.loop`) holds no conversation state in memory — every iteration rebuilds context by replaying the persisted message/part stream (`MessageV2.stream(sessionID)`). A crash loses only the in-flight turn.
- **Workflows** are not. `packages/workflow/src/runner.ts` keeps run state in plain locals (`const ctx = {}`, `const steps = []`). A crash loses the whole run; there is no resume, no replay, no suspend. The only recovery today is `Session.reconcileInterruptedToolParts`, which marks interrupted tool parts as errored rather than resuming them.

The product intent (see root `VISION.md`) is that a **run** — conversation or workflow — is one durable, resumable, event-sourced execution: a normal conversation is the simplest workflow (message → reply), a workflow is the same run with more structure, and any conversation can be transformed into a reusable workflow. This migration closes the gap by giving every run the same durable substrate.

We replicate concepts from three repositories; we do **not** import them as orchestration dependencies (`ai` stays a model-call dependency only).

## Vocabulary (canonical across all docs)

- **Run** — one durable execution instance, recorded as a session. Conversations and workflows are both runs.
- **Step** — a journaled unit of work inside a run: an LLM call, a tool call, or a workflow node execution.
- **Step journal** — the ordered, persisted record of completed steps so replay skips completed work.
- **Checkpoint / run-state contract** — a storage-owned durable snapshot of a run's cursor, context, and step journal that enables resume, replay, and suspend.
- **Suspend / Resume** — a run can be suspended (awaiting human input, permission, a decision, or an external event) and resumed deterministically via a resume token.
- **Conversation = simplest workflow** — a built-in single-node "assistant turn" loop.
- **Conversation → workflow projection** — deriving a reusable workflow definition from a run's step journal.

## Inspiration map (concepts only — no library imports)

| Concept | OpenDora target | Source to study |
|---|---|---|
| Saver/checkpointer contract (`get`/`list`/`put`/`putWrites`, `{thread, ns, checkpoint}` id) | `packages/storage` run-state contract | `langchain-ai/langgraph` `libs/checkpoint/langgraph/checkpoint/base/__init__.py` |
| Concrete SQLite checkpointer + schema | `packages/session` checkpoint tables; `packages/storage` adapter impl | `langgraph` `libs/checkpoint-sqlite/.../sqlite/{__init__,aio}.py`; `vercel/workflow` `packages/world-local` |
| Pluggable durable run-store interface | extend `StorageAdapter` (jsonl/sqlite/postgres) | `vercel/workflow` `packages/world`, `packages/world-postgres` |
| Step journaling + replay-skip | rewritten `packages/workflow/src/runner.ts` | `vercel/workflow` `packages/core`; cookbook `durable-agent.ts`, `idempotency.ts` |
| Step loop + declarative stop condition | unify with `SessionPrompt.loop` | `vercel/ai` `packages/ai/src/generate-text/{stream-text,stop-condition,step-result}.ts` |
| Suspend/resume + resume token | `packages/runtime` + reuse `permission.asked`/`reply` | `langgraph` `types.py`, `libs/prebuilt/.../interrupt.py`; `vercel/workflow` cookbook `human-in-the-loop.ts`; `vercel/ai` `collect-tool-approvals.ts` |
| Reducer-based state merge (`add_messages`) | workflow `ctx` merge semantics | `langgraph` channels/reducers (OpenDora already upserts by id via `onConflictDoUpdate`) |
| State serialization with revivers (errors/streams/abort) | checkpoint serialization | `vercel/workflow` `packages/serde` |
| Child/nested runs | `parent_session_id` nesting (already present) | `vercel/workflow` cookbook `child-workflows.ts` |
| Replay determinism pitfalls | journal semantics design | `vercel/workflow` `.changeset/*replay*`, `*serde*` |

Do **not** copy: vercel/workflow's `swc-plugin-workflow` / `typescript-plugin` source rewriting (`"use step"` magic). OpenDora expresses steps explicitly. LangGraph is Python — use it as a design spec, not a runtime.

## Phases

Each phase is independently shippable and respects existing package boundaries (root `VISION.md`). Per-package transition memory lives in each package's own `MIGRATION.md`; this file is the master.

### Phase 1 — Run-state / checkpoint contract (storage + session)

- Add a `Checkpoint` / `RunState` contract behind `packages/storage` modeled on LangGraph's saver and vercel `world`: `{ runId (=sessionID), checkpointId, parentCheckpointId, cursor, ctx, stepJournal[], status }`.
- Add a Drizzle-backed checkpoint table next to `SessionTable`/`MessageTable` in `packages/session/src/session.sql.ts`.
- Port LangGraph's checkpoint conformance spec as OpenDora tests.
- **No behavior change.** Owners: `storage`, `session`. Exit: contract + table + passing conformance tests; nothing reads it yet.

### Phase 2 — Checkpoint-driven workflow runner (workflow)

- Rewrite `packages/workflow/src/runner.ts` to persist `cursor`/`ctx`/`completed`/`stepJournal` after each node and hydrate on start; completed steps are skipped on replay.
- `Session.reconcileInterruptedToolParts` becomes resume-from-checkpoint instead of mark-as-error.
- Preserve the synthetic tool-message surface (`workflow_parameters`, `workflow_decide`) across resume (see `packages/workflow/AGENTS.md`).
- Owners: `workflow`, consuming `storage`. Exit: a workflow run survives daemon restart and resumes at the next uncompleted node.

### Phase 3 — Suspend / resume (runtime + permission + session)

- Introduce a `suspended` run status and a resume token. Route `decide` nodes and permission prompts through suspend/resume instead of blocking in-memory.
- Reuse the existing `permission.asked` / `permission.reply` flow as the first resume trigger; borrow AI SDK approval serialization + vercel `defineHook` shape.
- Owners: `runtime`, `permission`, `session`, `workflow`. Exit: a run can suspend on a permission/decision, persist, and resume after restart with injected input.

### Phase 4 — Unified step-journaled executor (runtime + session)

- Express the conversation loop (`SessionPrompt.loop`) and the workflow walk as one step-journaled executor in `packages/runtime`, with a declarative stop condition.
- Define the built-in **chat workflow**: a single `assistant_turn` node. A normal conversation is this workflow with no extra nodes.
- Owners: `runtime`, `session`, `workflow`. Exit: conversations and workflows run through the same executor over the same journal; no separate runner remains.

### Phase 5 — Conversation → workflow projection (workflow + tools)

- Read a run's step journal and have an agent cluster recurring step sequences into named workflow nodes (`task`/`decide`/`foreach`), writing a definition via `WorkflowStorage`.
- The source session stays valid because the derived workflow replays into the same ledger shape.
- Owners: `workflow`, `packages/tools/workflows`, `runtime`. Exit: "optimize this conversation into a workflow" produces a runnable, persisted workflow definition.

## Cross-cutting rules for this migration

- Durable run state goes through `storage` contracts only — never a direct JSON/SQLite/Postgres choice in `runtime`/`workflow`/`session`.
- `runtime` owns resume/replay; `session` records run state and history; `storage` persists. No package may reintroduce in-memory-only run state as the source of truth.
- The agent-perceivable surface (message parts, synthetic workflow tool messages, permission events) must remain identical whether a run is fresh or resumed.

## Risks / open questions (`needs verification`)

- Exact current method signatures of LangGraph's saver and vercel `world` — confirm against source before locking the contract; both evolve.
- Replay determinism (clock, ordering, redelivery, divergence) is the hard part — read vercel/workflow's replay/serde changesets first.
- `packages/session/AGENTS.md` is currently a stale `@pingpong/core` document and does not describe OpenDora's actual session code. It needs a separate rewrite before Phase 1 lands so checkpoint guidance has a correct home.
