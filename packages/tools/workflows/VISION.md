# VISION.md — packages/tools/workflows

> **Owner: human** — updated only when the vision for this tool group changes.
> Agents read this as the north star for the workflow tools. Never edit during migration work.
> See `DESIGN-NOTES.md` (same directory) for the full design discussion that led here.

---

## Goal

Provide a small, structured tool group that lets an LLM session **orchestrate other LLM sessions** by walking a JSON-defined workflow. The workflow itself is data; an orchestrator agent is the runtime.

This is not a deterministic interpreter. It is a **constrained agent loop**: the agent thinks freely, but can only *act* through the verbs in this group.

---

## Architecture in one paragraph

A user request lives in an **outer session**. When that session decides to run a workflow, it spawns an **orchestrator session** seeded with a workflow JSON document. The orchestrator's only legal moves are the tools in this group. Each call to `workflow_run_step` spawns a **step sub-session** that loads a single skill, runs it, and returns its output. The orchestrator inspects the output, then chooses to `complete_step`, `goto` an earlier step (loop / replan), or `finish`. Three session layers, one tool surface.

```
outer session  →  orchestrator session  →  step sub-session(s)
   (user)            (this tool group)         (one skill each)
```

---

## Workflow JSON shape (canonical)

Workflows are **nested trees**, not flat node/edge graphs. Trees are easier for an LLM to author and read; the canvas UI later renders them as a graph projection. Loops are the one exception, expressed only on `decide` nodes via `goto`.

Five — and only five — node `kind`s:

| kind | purpose | required keys |
|---|---|---|
| `task` | run a skill in a sub-session | `skill`, `input`, `output` |
| `sequence` | run children in order | `steps[]` |
| `parallel` | fan out, join on completion | `branches[]`, `join` |
| `foreach` | iterate over `ctx` items | `items`, `as`, `mode`, `body` |
| `decide` | LLM picks a labelled branch | `skill`, `input`, `branches{}` |

A node may carry an optional `id`. Only `decide.branches` may reference an `id` via `goto`. No general `goto`. No back-edges anywhere else.

Variable references are dotted paths only: `$input.x`, `$ctx.x`, `$<loop-var>`. Anything more complex is itself a `task`.

A full schema lives in code (Zod) — see roadmap below.

---

## Tool surface (this group)

Five tools, MCP-format `.json` + `.ts` per the package convention. The orchestrator session has access to **only these** plus its skill-loading primitive:

| Tool | Purpose |
|---|---|
| `workflow_create` | Instantiate a workflow run from a workflow id and input. Returns a `runId` and the initial cursor. |
| `workflow_run_step` | Execute the step at the current cursor (or a specified step) by spawning a step sub-session. Returns its output. |
| `workflow_complete_step` | Commit a step's output to the run's `ctx` and advance the cursor. |
| `workflow_goto` | Move the cursor to a named step id. Requires a `reason` — the agent must articulate *why* it is jumping. |
| `workflow_finish` | Mark the run complete with a final summary. Terminates the orchestrator session. |

Hard rules these tools enforce:

- `run_step` is the **only** way work happens. The orchestrator may not perform tasks directly.
- `complete_step` validates output shape against the step's declared `output` slot.
- `goto` targets must resolve to an existing `id` in the workflow tree.
- `finish` is terminal; once called, the run is immutable.

---

## State model

Each run holds:

```
{
  runId, workflowId, input,
  cursor: <stepId | path>,
  ctx: { <output-name>: <value>, ... },
  completed: [stepId, ...],
  history:   [{ tool, args, result, at }, ...]
}
```

`history` is append-only and is the source of truth for replay, audit, and UI rendering. The agent's natural-language reasoning is *not* state — only tool calls move the run forward.

This run state (`cursor`, `ctx`, `completed`, `history`) is the tool-surface view of the durable run state introduced by the **Unified Durable Run** migration (root `/MIGRATION.md`). It is persisted through storage's run-state / checkpoint contract — never as in-memory-only state — so a run can resume, replay completed steps, and suspend for input across process restarts. These tools author and advance run state; runtime decides when to checkpoint, suspend, and resume; storage persists it. `completed`/`history` map onto the migration's step journal, and `cursor` onto the run cursor.

---

## What lives where

```
workflows/
  VISION.md            ← this file
  DESIGN-NOTES.md      ← conversation rationale, alternatives considered
  index.ts             ← re-exports for tools (placeholder until implemented)
  workflow-create.json         ← MCP manifest (placeholder)
  workflow-run-step.json       ← MCP manifest (placeholder)
  workflow-complete-step.json  ← MCP manifest (placeholder)
  workflow-goto.json           ← MCP manifest (placeholder)
  workflow-finish.json         ← MCP manifest (placeholder)
  workflow-*.ts                ← implementations (not yet written)
  schema.ts                    ← Zod schema for workflow JSON (not yet written)
```

Workflow definitions themselves do **not** live in this package. They live alongside agents/skills in `.opendora/workflows/<id>.json` with an `index.json` mirror, analogous to `.opendora/agents/index.json`.

---

## Out of scope (deliberately deferred)

- Visual canvas editor (planned for `ui/web` once schema is locked).
- Retries, timeouts, backoff (handled later as per-`task` annotations).
- Typed I/O schemas per skill (will piggy-back on the skill manifest when that gains schemas).
- Streaming/checkpoint persistence (runtime concern, not part of this contract).
- Cross-run signalling, sub-workflows-as-skills (composition comes after v1 is stable).

---

## Roadmap

1. **Lock the workflow JSON schema** in `schema.ts` (Zod + JSON Schema export).
2. **Implement the 5 tools** as `.ts` files alongside their `.json` manifests.
3. **Author 2–3 fixture workflows** (e.g. `build-app`, `research`, `triage`) to ground LLM authoring with few-shot examples.
4. **Wire the orchestrator session template** — system prompt + tool registration.
5. **Canvas UI** in `ui/web` reading/writing the same JSON, once 1–4 are stable.

Each step is independently shippable; nothing here requires the canvas to exist.
