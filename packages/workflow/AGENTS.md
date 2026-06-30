# AGENTS.md — packages/workflow

Local instructions for agents working in `packages/workflow`.
Read the root file set first, then this package's local file set.

## Read order

1. Root `AGENTS.md`
2. `packages/workflow/VISION.md`
3. `.projectflows/goals/unified-durable-run/GOAL.md` — master goal for the **Unified Durable Run** migration (checkpoint-driven runner, suspend/resume, unified executor). Read before changing `src/runner.ts` run state.
4. This file
5. The user-facing authoring contract: `.projectflows/skill/manage-workflow/SKILL.md` — the **Authoring Standard** section is normative for any change that touches workflow shape or runtime semantics.

## Native tools, MCP-shaped

Projectflows workflows are **native tools**, not MCP servers. The codebase deliberately adopts MCP / JSON-Schema conventions across all native tool surfaces — `name`, `description`, `inputSchema`-style fields, `required`, `enum` — so any native tool can be exposed over MCP later without redesign.

When editing this package you are editing the contract that other agents use to author tools. Keep these properties intact:

- **`Parameters` node entries** (`workflowParameters`) are the workflow's `inputSchema`. The runtime contract — type vocabulary (`JsonSchemaType`), `required` enforcement, `enum` enforcement, descriptive metadata propagated to the agent transcript — must stay aligned with MCP tool input schemas. See `src/runner.ts` (Parameters node branch) and `src/node-types.ts` (`WorkflowParameter`, `JsonSchemaType`).
- **`Decide` node `cases[].label`** are routing tokens. The runtime injects a `workflow_decide` tool message so the agent sees decisions as native tool output — preserve that surface.
- **Tool node `parameters`** must continue to flow through the existing tool executor with the tool's own MCP-style schema validation.
- **Synthetic tool messages** (`workflow_parameters`, `workflow_decide`) are the channel by which the agent perceives workflow steps as tool calls. Do not bypass them.

## Editing rules

- Do not weaken validation. `required` and `enum` enforcement on the Parameters node is part of the contract.
- Do not introduce parameter shape divergence between `WorkflowParameter` (UI types) and the runner's `WfParam` (runtime types). Either extend both, or extend a shared definition.
- Do not invent ad-hoc field names that would not survive translation to an MCP `inputSchema`. New fields should map cleanly onto JSON Schema (`type`, `description`, `enum`, `default`, `format`, `items`, `properties`, etc.).
- If you add a new node kind, register it in `src/node-types.ts` + `src/node-registry.ts`, handle it in `src/runner.ts`, and document it in `.projectflows/skill/manage-workflow/SKILL.md` under the same Authoring Standard.
- If you change runtime semantics that the skill describes, update the skill in the same change. The skill is the agent-facing contract.

### Durable run state (Unified Durable Run migration)

- Do not reintroduce in-memory-only run state as a source of truth. `src/runner.ts` currently holds `ctx`/`steps` in plain locals; the migration moves run state (cursor, context, step journal, status) behind storage's run-state/checkpoint contract. New run-state must flow through that contract, not module-local variables.
- Resume must be deterministic: completed steps are replayed from the journal, never re-executed. Side-effecting nodes (Tool, RunWorkflow) must be idempotent under replay or guarded by a journaled completion marker.
- The synthetic tool-message surface (`workflow_parameters`, `workflow_decide`) and step ordering must be byte-for-byte identical whether a run is fresh or resumed — the agent must not be able to tell a resume happened.
- A previously granted permission/approval must be honored from the journal on resume, not re-prompted.

## Cross-references

- Runtime: `src/runner.ts`
- Node definitions: `src/node-types.ts`, `src/node-registry.ts`
- UI parameter types: `ui/web/components/react-flow/unified-node.ts`
- Workflow CRUD tools: `packages/tools/workflows/`
- Agent-facing skill: `.projectflows/skill/manage-workflow/SKILL.md`
- Durable run master goal: `.projectflows/goals/unified-durable-run/GOAL.md`
