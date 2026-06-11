# MIGRATION.md — packages/runtime

> Owner: agents. Transition memory for runtime's slice of the **Unified Durable Run** migration.
> Master plan and phase ordering: root `/MIGRATION.md`. Read it first. Everything here is **planned** unless marked shipped.

## Runtime's role in this migration

Runtime is where the two execution paths converge. It already coordinates live work; this migration makes it own **resume, replay, and suspend** over a single step-journaled executor, so conversations and workflows run the same way. Runtime decides *when* to checkpoint/suspend/resume; session defines the run state shape; storage persists it.

## Phase 3 — Suspend / resume (this package leads)

- Add a `suspended` run status and an opaque resume token to the run lifecycle. When a run hits a point that needs external input — a permission prompt, a `decide` node, a human approval, or an external event — runtime checkpoints, marks the run suspended, and returns instead of blocking on an in-memory promise.
- Resume re-hydrates run state from storage and continues at the next uncompleted step. The first resume trigger is the existing `permission.asked` / `permission.reply` flow — reuse it, do not build a parallel mechanism.
- **Sources:** `langgraph` `libs/langgraph/langgraph/types.py` (`interrupt` / `Command(resume=…)`), `libs/prebuilt/.../interrupt.py`; `vercel/workflow` cookbook `human-in-the-loop.ts` (`defineHook` + race-with-timeout); `vercel/ai` `packages/ai/src/generate-text/collect-tool-approvals.ts` (approval serialization).
- **Exit:** a run suspends on a permission/decision, persists, and resumes after a daemon restart with injected input, with no change to the agent-visible surface.

## Phase 4 — Unified step-journaled executor (this package leads)

- Express the conversation loop (`session` `SessionPrompt.loop`) and the workflow walk (`workflow` `runner.ts`) as one executor: a step loop with a declarative stop condition, journaling each step (LLM call, tool call, node execution) and skipping completed steps on replay.
- Run the built-in **chat workflow** (single `assistant_turn` node) through this executor so a normal conversation is literally the simplest workflow.
- Support `prepareStep`-style per-step reconfiguration (swap model/tools/system per step) so a workflow node can reconfigure the agent mid-run without a separate engine.
- **Sources:** `vercel/ai` `packages/ai/src/generate-text/{stream-text,stop-condition,step-result,prepare-step}.ts`; `vercel/workflow` `packages/core` (journaling/replay) and cookbook `durable-agent.ts`.
- **Exit:** one executor drives both run kinds over the same journal; the old standalone runner path is gone.

## Phase 5 — Conversation → workflow projection (supporting)

- Provide the runtime entry point that lets an agent read a run's journal and emit a workflow definition (authored via `workflow` + `packages/tools/workflows`). Runtime executes the resulting workflow through the same executor.

## Cross-cutting rules

- Runtime never persists run state directly — always through storage contracts via session.
- Resume must be deterministic: replay reads the journal; it never re-executes completed steps. Read vercel/workflow's replay/serde changesets for the determinism pitfalls (clock, ordering, redelivery, divergence) before implementing.
- Ask permission before protected actions — including on resume, where a previously granted approval must be honored from the journal rather than re-prompted.

## Cross-references

- Conversation loop: `packages/session/src/prompt.ts`
- Workflow runner (becomes a thin caller of the unified executor): `packages/workflow/src/runner.ts`
- Run state shape: `packages/session/MIGRATION.md`
- Persistence contract: `packages/storage/MIGRATION.md`
