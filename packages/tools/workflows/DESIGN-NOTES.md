# DESIGN-NOTES.md — packages/tools/workflows

> Captures the design conversation that produced `VISION.md`. Preserves alternatives considered and the reasons we rejected them, so future agents do not relitigate settled questions.

---

## Problem statement

We want a simple, structural way to define agentic workflows as JSON. Properties required:

- An LLM can both **author** and **execute** them.
- A workflow is itself a kind of "skill that defines skills" — composable.
- A workflow run is a session; each step is a sub-session.
- Must support: sequential and parallel steps, decisions, loops (e.g. *plan → execute phases → review → either finish or loop back*).
- Must be designable by humans later via a node/edge UI.
- Must keep deterministic boundaries so behaviour is predictable.

---

## Mental model

- **Workflow** = parent session. Holds shared `ctx` (the blackboard).
- **Step** = sub-session. Loads one skill, runs in isolation, writes a named output back to `ctx`.
- **Control flow** = transitions between steps. Either deterministic (`next` / next sibling) or LLM-decided (`decide` branches).

Plan/execute/review is just three steps where `review` is a `decide` whose branches point to `finish`, back to `execute`, or back to `plan`.

---

## Step kinds — the closed set

We intentionally restrict to **five kinds**. Anything else is composition.

- `task` — single sub-session: load skill, give input, capture output.
- `sequence` — run children in order.
- `parallel` — fan out, join on completion (`all` / `any` / `n`).
- `foreach` — iterate items from `ctx`, sequential or parallel.
- `decide` — LLM step that returns a branch label; routes to that branch.

Loops are not a kind. A `decide` whose branch points back to an earlier `id` *is* the loop. `goto` exists only inside `decide.branches` — no general `goto`.

---

## Authoring format: nested tree, not flat graph

We considered three forms:

| Form | LLM authoring | Human UI editing | Determinism |
|---|---|---|---|
| Nested tree | **Best** — local context, brackets enforce structure | OK (renderable as graph via dagre) | High |
| Flat node/edge graph | Worst — LLM must keep `nodes` and `edges` in sync, prone to dangling refs | **Best** — natural for canvas | High |
| Hybrid (containers + edges) | Mediocre | Mediocre | Mediocre |

**Decision: nested tree is canonical.** The UI is a *projection* of the tree onto a canvas, not a separate storage format. Trees cannot dangle; each `kind` dictates required keys; LLMs are trained on billions of nested configs and ASTs.

Trade-off: trees can't natively express back-edges. We accept this and add a single, narrow escape hatch: any node may carry an `id`; only `decide.branches` may reference one via `goto`. Cycles become explicit and visible exactly where decisions happen.

---

## Execution model: orchestrator agent, not interpreter

Two architectures considered:

- **Interpreter** — code walks the JSON tree, spawns sub-sessions, evaluates `decide`, follows `goto`. Strict, replayable, but rigid; large surface area to write; brittle when step outputs are messy.
- **Orchestrator agent** — one LLM session reads the workflow JSON as a document, calls a small fixed set of tools to advance through it. Flexible, native error recovery, smaller runtime, but risks drift (skipping steps, claiming false completion, getting lost).

**Decision: orchestrator agent + structured tool surface.** The agent thinks freely but can only *act* through five verbs. The JSON shape constrains what's reachable; the tool contract constrains what can happen. This is the pragmatic sweet spot adopted by most production agentic systems (LangGraph react agents, AutoGen, Claude computer-use loops).

A future "deterministic mode" knob (`auto: true` per node) can collapse `run_step` + `complete_step` into a single automatic transition where reliability matters, without changing the JSON shape.

---

## The five tools (chosen surface)

Per user direction:

- `workflow_create` — instantiate a run.
- `workflow_run_step` — execute the current (or specified) step.
- `workflow_complete_step` — commit output, advance cursor.
- `workflow_goto` — jump to a named step id, with required `reason`.
- `workflow_finish` — terminate run with summary.

Internal-only state (cursor, ctx, completed, history) is exposed via the return values of these tools — particularly `run_step` and `create` — so the agent re-grounds every turn. We deliberately did **not** add a separate `workflow_state` read tool: keeping the surface to five forces every state read to be tied to an action, which makes the trajectory cleaner and auditable.

---

## Three-session topology

```
outer session            ← user request lives here
  └── orchestrator       ← workflow JSON + the five tools
        ├── step a       ← skill A, isolated sub-session
        ├── step b       ← skill B, isolated sub-session
        └── ...
```

- The outer session decides "run workflow X" and spawns the orchestrator.
- The orchestrator never does substantive work itself; it only routes.
- Step sub-sessions are stateless from the orchestrator's view: input → output.

---

## What we explicitly rejected (and why)

- **Inline prompts inside workflow JSON.** Rejected: would couple workflows to prompt revisions and make them un-versionable. All work is via skills.
- **Expression DSL inside JSON (`$ctx.x > 5 && ...`).** Rejected for v1: introduces a parser, evaluator, and a hidden Turing-completeness. Use a `task` whose skill encapsulates the logic.
- **Separate workflow registry per agent.** Rejected: workflows are global resources, like skills. One `.opendora/workflows/` namespace.
- **General `goto` from any node.** Rejected: makes static analysis impossible and turns the tree into spaghetti. Only `decide` may jump.
- **Letting the orchestrator call skills directly.** Rejected: this is the central guarantee. All work goes through `workflow_run_step`, otherwise the trajectory becomes unauditable and the workflow JSON becomes decorative.
- **Storing layout (`x`,`y`) in a sidecar file.** Rejected: layout is metadata; carrying it on nodes keeps everything in one round-trippable JSON.

---

## Open questions (not blocking v1)

- How does a workflow expose itself as a skill so workflows can compose? Likely via a synthetic skill manifest generated from the workflow's `input`/final-`ctx` shape.
- Failure semantics for `parallel` with mixed success — fail-fast vs. collect-all?
- Where do per-step retries live — in the workflow JSON (declarative) or in tool args (imperative)? Probably declarative on `task`, deferred until needed.
- Token-cost mitigation for long orchestrator sessions: do we summarise `history` periodically, or rely on the orchestrator's own context-management?

These are intentionally left open; resolving them prematurely would over-fit the schema.

---

## Source conversation

This document distils the design conversation in the chat that created this folder. The progression was:

1. Should workflows be JSON? → yes, simple structural shape with a few primitives.
2. Should they be node/edge graphs for a future UI? → graphs are good for humans, trees are better for LLMs; resolve by treating the canvas as a projection.
3. Should execution be a deterministic interpreter? → no, an orchestrator agent over a fixed tool surface gives the right balance of structure and flexibility.
4. What's the tool surface? → `create`, `run_step`, `complete_step`, `goto`, `finish`.
