# MIGRATION.md — packages/workflow

> Owner: agents. Transition memory for workflow's slice of the **Unified Durable Run** migration.
> Master plan and phase ordering: root `/MIGRATION.md`. Read it first. Everything here is **planned** unless marked shipped.

## Workflow's role in this migration

Workflow holds the largest single change: `src/runner.ts` currently keeps run state in plain locals (`const ctx = {}`, `const steps = []`), so a crash loses the whole run and there is no resume, replay, or suspend. This migration makes the runner **checkpoint-driven** over the run-state contract, then folds it into the unified executor so a workflow run and a conversation run advance identically.

## Phase 2 — Checkpoint-driven runner (this package leads)

- Replace module-local run state in `src/runner.ts` with the durable run state defined in `packages/session/MIGRATION.md` and persisted through storage (`packages/storage/MIGRATION.md`): `{ cursor, ctx, stepJournal[], status }`.
- After each node completes, append a journal entry and persist the checkpoint. On start/resume, hydrate from the latest checkpoint and **skip completed steps** rather than re-running them.
- Make side-effecting nodes (Tool, RunWorkflow) idempotent under replay or guard them with a journaled completion marker.
- Preserve the synthetic tool-message surface (`workflow_parameters`, `workflow_decide`) and step ordering exactly, fresh or resumed (see this package's `AGENTS.md`).
- `Session.reconcileInterruptedToolParts` stops being the recovery path for workflows — resume-from-checkpoint replaces mark-as-error.
- **Sources:** `vercel/workflow` `packages/core` (journaling + replay-skip), cookbook `durable-agent.ts` (steps as durable units), `idempotency.ts` (exactly-once), `child-workflows.ts` (nested runs map to `parent_session_id`).
- **Exit:** a workflow run survives a daemon restart and resumes at the next uncompleted node with an identical agent-visible transcript.

## Phase 3 — Suspend on decide/permission (with runtime)

- `Decide` nodes and permission prompts suspend the run (checkpoint + `suspended` status + resume token) instead of blocking in memory; runtime owns the transition and resume trigger. Reuse `permission.asked` / `permission.reply`.
- **Sources:** `vercel/workflow` cookbook `human-in-the-loop.ts`; `langgraph` `interrupt`/`Command`.

## Phase 4 — Fold runner into the unified executor (with runtime)

- The runner becomes a thin definition-walker that emits steps into runtime's single step-journaled executor; the bespoke loop in `src/runner.ts` is retired. Node kinds remain the authoring contract; execution is shared with conversations.

## Phase 5 — Conversation → workflow projection (this package leads)

- Add the operation that reads a run's step journal and clusters recurring step sequences into named nodes (`task`/`decide`/`foreach`), emitting a workflow definition via `WorkflowStorage` (`src/storage.ts`).
- The source session stays valid because the derived workflow replays into the same ledger shape.
- Surfaced to agents through `packages/tools/workflows` and the `manage-workflow` skill.
- **Exit:** "optimize this conversation into a workflow" yields a runnable, persisted definition.

## Cross-cutting rules

- Run state flows through storage contracts only — never module-local variables as the source of truth.
- Keep node-kind authoring (Parameters/Prompt/Structured/Tool/RunWorkflow/Decide/SetWorkdir/ForEach/ConfigureSession) and its UI/runtime type parity intact; this migration changes *how state is stored and replayed*, not the node vocabulary.
- **ConfigureSession node** (`configure_session`) — shipped. Patches mutable session parameters (model, cwd, title, agentID, systemPrompt, path, readPath) at a point in the workflow graph. Model changes are stamped into message history via a hidden `noReply` prompt so `lastModel()` carries them forward to subsequent nodes.
- Update `.opendora/skill/manage-workflow/SKILL.md` in the same change whenever runtime semantics it describes change.

## Cross-references

- Runner: `src/runner.ts`
- Definition CRUD: `src/storage.ts`
- Node definitions: `src/node-types.ts`, `src/node-registry.ts`
- Run state shape: `packages/session/MIGRATION.md`
- Persistence contract: `packages/storage/MIGRATION.md`
- Executor + suspend/resume: `packages/runtime/MIGRATION.md`
