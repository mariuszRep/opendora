---
name: unified-durable-run
title: Unified Durable Run — conversations and workflows become one durable, resumable, event-sourced execution
description: Make conversations and workflows share one durable, resumable, event-sourced run substrate. Adds checkpoint/run-state contract, checkpoint-driven workflow runner, suspend/resume, unified step-journaled executor, and conversation-to-workflow projection. This is the master goal consolidating content from the former root and package MIGRATION.md files.
status: ready
type: migration
scope: packages/storage, packages/session, packages/workflow, packages/runtime, packages/permission
attempt: 0
max_attempts: 5
last_result: none
next_action: Resolve stale-doc prerequisite (packages/session/AGENTS.md rewrite) then implement Phase 1 — run-state/checkpoint contract in packages/storage and packages/session.
success_criteria:
  - Phase 1: Run-state/checkpoint contract defined behind storage, Drizzle-backed checkpoint table in session.sql.ts, passing conformance tests, no behavior change.
  - Phase 2: Workflow runner checkpoint-driven — persists cursor/ctx/stepJournal after each node, hydrates on restart, skips completed steps on replay. Workflow run survives daemon restart.
  - Phase 3: Suspend/resume with suspended run status, resume token, permission/reply as first trigger. Run survives restart with injected input.
  - Phase 4: Unified step-journaled executor in runtime drives both conversations and workflows over the same journal. No separate workflow runner remains.
  - Phase 5: Conversation-to-workflow projection — agent clusters recurring steps into named workflow nodes from a run's step journal.
  - Existing cross-referencing goals (session-graph-ledger-and-chat-rail, investigate-current-session-ledger-state) remain consistent and do not conflict.
  - packages/session/AGENTS.md rewritten to describe OpenDora session reality before Phase 1 lands.
source: vision
predecessor_goals:
  - .projectflows/goals/session-graph-ledger-and-chat-rail/GOAL.md
  - .projectflows/goals/investigate-current-session-ledger-state/GOAL.md
---

# Unified Durable Run

## Goal

OpenDora has two execution paths that should be one:

- **Conversations** are already event-sourced. `packages/session/src/prompt.ts` (`SessionPrompt.loop`) holds no conversation state in memory — every iteration rebuilds context by replaying the persisted message/part stream (`MessageV2.stream(sessionID)`). A crash loses only the in-flight turn.
- **Workflows** are not. `packages/workflow/src/runner.ts` keeps run state in plain locals (`const ctx = {}`, `const steps = []`). A crash loses the whole run; there is no resume, no replay, no suspend.

The product intent (see root `VISION.md`) is that a **run** — conversation or workflow — is one durable, resumable, event-sourced execution: a normal conversation is the simplest workflow (message → reply), a workflow is the same run with more structure, and any conversation can be transformed into a reusable workflow. This goal closes the gap by giving every run the same durable substrate.

We replicate concepts from three reference repositories (LangGraph, Vercel AI SDK, Vercel Workflows); we do **not** import them as orchestration dependencies (`ai` stays a model-call dependency only).

## Vocabulary (canonical across all docs)

- **Run** — one durable execution instance, recorded as a session. Conversations and workflows are both runs.
- **Step** — a journaled unit of work inside a run: an LLM call, a tool call, or a workflow node execution.
- **Step journal** — the ordered, persisted record of completed steps so replay skips completed work.
- **Checkpoint / run-state contract** — a storage-owned durable snapshot of a run's cursor, context, and step journal that enables resume, replay, and suspend.
- **Suspend / Resume** — a run can be suspended (awaiting human input, permission, a decision, or an external event) and resumed deterministically via a resume token.
- **Conversation = simplest workflow** — a built-in single-node "assistant turn" loop.
- **Conversation → workflow projection** — deriving a reusable workflow definition from a run's step journal.

## Stale-doc prerequisite (resolve before Phase 1)

`packages/session/AGENTS.md` is currently a leftover `@pingpong/core` document (`ping`/`pong`, `@pingpong/core/sqlite`, a `packages/core/src/` layout). It does not describe OpenDora's actual session code (`prompt.ts`, `session.ts`, `session.sql.ts`, `MessageV2`, the Drizzle `SessionTable`/`MessageTable`/`PartTable`). Rewrite it to reflect reality before adding checkpoint guidance, otherwise new run-state rules will have no correct home. Tracked here as a prerequisite, not as part of any feature phase.

## Phases

Each phase is independently shippable and respects existing package boundaries (root `VISION.md`). Implementation guidance from former per-package MIGRATION.md files is incorporated below.

### Phase 1 — Run-state / checkpoint contract (storage + session)

Storage leads; session provides run state shape.

**Storage's role** (from former `packages/storage/MIGRATION.md`):
- Add a contract modeled on LangGraph's `BaseCheckpointSaver` and vercel/workflow's `World`:
  - **Identity** — a run is keyed by `runId` (= `sessionID`), with an optional namespace and an ordered `checkpointId`, plus `parentCheckpointId` for branching/time-travel. Mirror LangGraph's `{thread_id, checkpoint_ns, checkpoint_id}` triple.
  - **Snapshot shape** — `{ cursor, ctx, stepJournal[], status }` where `status ∈ { running, suspended, done, error }`. `ctx` merges via reducer semantics; `stepJournal` records completed steps so replay skips them.
  - **Operations** — `getRunState`, `listRunStates`, `putRunState`, `putStepWrites` (append journal entries).
  - **Serialization** — values may include errors, aborted states, and stream remnants. Borrow vercel/workflow `packages/serde`'s reviver approach.
- Implement across the existing adapter family (jsonl/sqlite/postgres split).
- Port LangGraph's checkpoint conformance spec as OpenDora tests.

**Session's role** (from former `packages/session/MIGRATION.md`):
- Define the durable run state type: `{ cursor, ctx, stepJournal[], status }`, `status ∈ { running, suspended, done, error }`.
- Add a Drizzle-backed checkpoint table next to `SessionTable`/`MessageTable`/`PartTable` in `src/session.sql.ts`, keyed by `runId` (= `sessionID`) + ordered `checkpointId` + `parentCheckpointId`.
- Reuse existing columns where possible: `parent_session_id` already models nested runs; `session_status` already models lifecycle — extend rather than duplicate.

**Sources to study:** `langchain-ai/langgraph` `libs/checkpoint/`; `vercel/workflow` `packages/world`, `packages/world-local`, `packages/serde`.

**Exit:** contract defined, adapter implementations pass a ported conformance suite, no other package reads it yet (no behavior change).

### Phase 2 — Checkpoint-driven workflow runner (workflow + storage)

Workflow leads; consumes storage contract.

**Workflow's role** (from former `packages/workflow/MIGRATION.md`):
- Replace module-local run state in `src/runner.ts` with the durable run state: `{ cursor, ctx, stepJournal[], status }`.
- After each node completes, append a journal entry and persist the checkpoint. On start/resume, hydrate from the latest checkpoint and **skip completed steps** rather than re-running them.
- Make side-effecting nodes (Tool, RunWorkflow) idempotent under replay or guard them with a journaled completion marker.
- Preserve the synthetic tool-message surface (`workflow_parameters`, `workflow_decide`) and step ordering exactly, fresh or resumed.
- `Session.reconcileInterruptedToolParts` becomes resume-from-checkpoint instead of mark-as-error.

**Sources:** `vercel/workflow` `packages/core` (journaling + replay-skip), cookbook `durable-agent.ts`, `idempotency.ts`, `child-workflows.ts`.

**Exit:** a workflow run survives daemon restart and resumes at the next uncompleted node with an identical agent-visible transcript.

### Phase 3 — Suspend / resume (runtime + permission + session + workflow)

Runtime leads; all packages participate.

**Runtime's role** (from former `packages/runtime/MIGRATION.md`):
- Add a `suspended` run status and an opaque resume token to the run lifecycle. When a run hits a point that needs external input — a permission prompt, a `decide` node, a human approval, or an external event — runtime checkpoints, marks the run suspended, and returns instead of blocking on an in-memory promise.
- Resume re-hydrates run state from storage and continues at the next uncompleted step. The first resume trigger is the existing `permission.asked` / `permission.reply` flow.
- Route `decide` nodes and permission prompts through suspend/resume.

**Sources:** `langgraph` `interrupt` / `Command(resume=…)`; `vercel/workflow` cookbook `human-in-the-loop.ts`; `vercel/ai` `collect-tool-approvals.ts`.

**Exit:** a run suspends on a permission/decision, persists, and resumes after daemon restart with injected input, with no change to the agent-visible surface.

### Phase 4 — Unified step-journaled executor (runtime + session + workflow)

Runtime leads.

**Runtime's role** (from former `packages/runtime/MIGRATION.md`):
- Express the conversation loop (`session` `SessionPrompt.loop`) and the workflow walk (`workflow` `runner.ts`) as one executor: a step loop with a declarative stop condition, journaling each step (LLM call, tool call, node execution) and skipping completed steps on replay.
- Define the built-in **chat workflow**: a single `assistant_turn` node. A normal conversation is this workflow with no extra nodes.
- Support `prepareStep`-style per-step reconfiguration so workflow nodes can reconfigure the agent mid-run.

**Sources:** `vercel/ai` `packages/ai/src/generate-text/{stream-text,stop-condition,step-result,prepare-step}.ts`; `vercel/workflow` `packages/core`.

**Exit:** one executor drives both run kinds over the same journal; the old standalone runner path is gone.

### Phase 5 — Conversation → workflow projection (workflow + tools)

Workflow leads.

- Read a run's step journal and have an agent cluster recurring step sequences into named workflow nodes (`task`/`decide`/`foreach`), writing a definition via `WorkflowStorage`.
- The source session stays valid because the derived workflow replays into the same ledger shape.
- Surfaced to agents through `packages/tools/workflows` and the `manage-workflow` skill.

**Exit:** "optimize this conversation into a workflow" produces a runnable, persisted workflow definition.

## Cross-cutting rules

- Durable run state goes through `storage` contracts only — never a direct JSON/SQLite/Postgres choice in `runtime`/`workflow`/`session`.
- `runtime` owns resume/replay; `session` records run state and history; `storage` persists. No package may reintroduce in-memory-only run state as the source of truth.
- The agent-perceivable surface (message parts, synthetic workflow tool messages, permission events) must remain identical whether a run is fresh or resumed.
- Storage stores; it never orchestrates (no checkpoint/resume/replay decisions — those are runtime's).
- Session defines and records the run state shape; it never decides when to checkpoint/resume/suspend (runtime) or where to persist (storage).
- Resume must be deterministic: replay reads the journal; it never re-executes completed steps.
- Ask permission before protected actions — including on resume, where a previously granted approval must be honored from the journal rather than re-prompted.
- Keep the contract free of domain types; it stores opaque run snapshots, not message/agent/workflow schemas.

## Relationship to existing goals

- **`.projectflows/goals/session-graph-ledger-and-chat-rail/GOAL.md`** — This goal (unified-durable-run) is related but distinct. The session-graph-ledger goal focuses on migrating session/message/edge architecture to unified entries + universal edges per VISION. This goal focuses on checkpoint/run-state contracts, suspend/resume, and unified executor. They intersect at packages/session (both touch session schema) and runtime write paths. Implementers must coordinate to avoid conflicting schema changes. The entries+edges refactor defines how session history is stored; the durable-run migration defines how execution state is checkpointed and resumed. They are complementary and should be sequenced with awareness of each other.
- **`.projectflows/goals/investigate-current-session-ledger-state/GOAL.md`** — Investigation prerequisite for session-graph-ledger-and-chat-rail. Its findings about current session write paths, ordering, and storage adapter behavior are also relevant to this goal's Phase 1 checkpoint table design.
- **`.projectflows/goals/structured-node-html-render-layout/GOAL.md`** and **`.projectflows/goals/structured-node-format-switching/GOAL.md`** — Focus on structured node output format views and render layout. These are orthogonal — they change how workflow output is displayed, not how run state is persisted/resumed. No conflict expected.
- **`.projectflows/goals/deliver-workflow-variable-node/GOAL.md`** — Adds a new workflow node type (variable). This is orthogonal to the durable-run migration's phases. The variable node must follow the existing Node-as-Tool standard and use the current runner patterns; it will naturally adopt checkpoint-driven semantics when Phase 2 lands.

## Key design decisions

### Run-state/checkpoint contract reference

```
Operations: getRunState, listRunStates, putRunState, putStepWrites
Snapshot: { cursor, ctx, stepJournal[], status }
Status: running | suspended | done | error
Identity: runId (= sessionID) + checkpointId + parentCheckpointId
```

### Checkpoint table (Drizzle schema, added in session.sql.ts)

Keyed by `(runId, checkpointId, parentCheckpointId)` alongside `SessionTable`/`MessageTable`/`PartTable`.

### Journal entry format

Each journal entry records one completed step: step ID, node ID (for workflows), type (llm_call | tool_call | node_execution | permission), input hash, output hash, timestamp.

## Risks / Open Questions

1. **Schema intersection with entries+edges refactor** — The session-graph-ledger-and-chat-rail goal may add/modify session tables (entries, universal edges). The checkpoint table addition in Phase 1 must not conflict. Coordinate schema evolution across both goals.
2. **Exact current method signatures of LangGraph's saver and vercel `world`** — confirm against source before locking the contract; both evolve.
3. **Replay determinism** (clock, ordering, redelivery, divergence) is the hard part — read vercel/workflow's replay/serde changesets first.
4. **`packages/session/AGENTS.md` stale-doc prerequisite** — must be rewritten before Phase 1 so checkpoint guidance has a correct home.
5. **Whether checkpoints are full snapshots, deltas, or both** — decide based on OpenDora journal size.
6. **Workflow runner output serialization** — `startNodeToolPart.finish()` currently stores `typeof output === "string" ? output : JSON.stringify(output, null, 2)`. Moving to structured payload_json in entries changes this.
7. **Phase 4 unified executor** must preserve the existing agent-visible surface exactly. The agent must not be able to tell whether it's running in the legacy runner or the unified executor.
8. **Permission approval on resume** — a previously granted approval must be honored from the journal, not re-prompted. Design the journal entry format to capture approval state.

## Verification Expectations

### Phase 1
- Checkpoint/run-state contract defined in storage with typed method signatures
- Drizzle checkpoint table DDL verified (column types, keys, indexes)
- Conformance tests (ported from LangGraph spec) pass for each adapter (SQLite, Postgres, JSONL)
- No behavior change: existing session/workflow tests pass unchanged

### Phase 2
- Workflow runner persists checkpoint after each node completion
- Workflow run survives daemon restart and resumes at next uncompleted node
- Completed steps are skipped on replay (verify via step journal)
- Side-effecting nodes are idempotent under replay
- Agent-visible transcript (tool messages, step ordering) is byte-for-byte identical fresh vs. resumed
- `Session.reconcileInterruptedToolParts` fallback path still works for unrecoverable checkpoints

### Phase 3
- Run suspends on permission prompt and `decide` node
- Suspended run persists across restart
- Resume token deserializes correctly and run continues from correct step
- Permission approval from journal honored on resume (not re-prompted)
- Agent-visible surface identical fresh vs. resumed

### Phase 4
- Both conversation and workflow run through same executor
- Conversation loop output identical before and after unification
- No separate runner code path remains in workflow package
- Built-in chat workflow (single assistant_turn node) produces identical results to existing conversation loop

### Phase 5
- Agent can inspect a run's step journal and request workflow creation
- Generated workflow definition is syntactically valid (passes schema validation)
- Generated workflow replays into same ledger shape as source run
- "Optimize this conversation into a workflow" produces a runnable, persisted definition

## Attempts

No attempts yet.

## Do Not Repeat

None yet.

## Verification Log

No verification yet.

## Final Outcome

Pending.

## Ready For Execution

- Status: yes, pending stale-doc prerequisite
- Reason: All phases are defined with clear scope, owner, and exit criteria. Risks are documented. Cross-references to existing goals are stated. The stale-doc prerequisite (`packages/session/AGENTS.md` rewrite) is identified and must be completed before Phase 1. This goal consolidates content from the former root MIGRATION.md and per-package MIGRATION.md files that have been removed.
