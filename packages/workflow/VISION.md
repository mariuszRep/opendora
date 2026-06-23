# VISION.md — packages/workflow

> Owner: human. Approved intent only.

## Intent

Workflow owns reusable process definitions and workflow domain behavior. Workflows are the only executable unit that schedules may trigger.

---

## Node-as-Tool Standard

Every workflow node type is a **first-class tool**. This is the core design contract:

### Why

An agent reading a session history must be able to understand exactly what happened during workflow execution — which nodes ran, what they received as input, and what they produced. The only way to guarantee this is to represent every node execution as a standard tool call, identical in shape to the tool calls the agent itself makes.

### Contract for every node type

1. **Tool definition** — Each node type has a canonical tool definition with a stable name, a description the agent can read, and a formal JSON schema for its inputs and outputs. These definitions live alongside the node registry (`node-registry.ts`) and are exported as first-class tool objects, not just internal labels.

2. **Session visibility** — When a node executes, the runner must write a message with a tool part that follows the Vercel AI SDK lifecycle:
   - `running` — created immediately when the node starts, so the UI reflects live state
   - `completed` — updated with the node's output when it finishes successfully
   - `error` — updated with the error message if the node fails

   No node may complete without emitting a tool call. No tool part may be created in `completed` state atomically — the `running` phase is required so the session reflects in-progress execution.

3. **workflowMeta on every part** — Every tool part must carry `workflowMeta` (`workflowID`, `workflowRunID`, `nodeID`, `nodeType`, `nodeLabel`) so the UI and any agent reading the session can trace the part back to the exact workflow run and node that produced it.

4. **Stable tool names** — Tool names are stable public identifiers, not implementation details:

   | Node type | Tool name |
   |-----------|-----------|
   | `parameters` | `workflow_parameters` |
   | `prompt` | `workflow_prompt` |
   | `structured` | `workflow_structured` |
   | `decide` | `workflow_decide` |
   | `set_workdir` | `workflow_set_workdir` |
   | `for_each` | `workflow_foreach` |
   | `run_workflow` | `workflow_run` |
   | `configure_session` | `workflow_configure_session` |
   | `output` | `workflow_output` |
   | `tool` | the action's own tool name (pass-through) |

### What this enables

- An agent can inspect a session and read workflow execution exactly as it reads its own tool calls — no special-casing needed.
- The UI renders every node as a collapsible tool card with live state, input, and output.
- Error recovery is uniform: any node that fails shows its error state in the session and the workflow stops cleanly.
- Future resumability can replay from the session's tool call history, because the history is complete and structured.

---

## Owns

- Workflow definitions.
- Workflow schema and validation.
- Workflow steps, triggers, and execution rules.
- Workflow run state contracts, including the durable cursor, context, and step journal that let a workflow run resume, replay completed steps, and suspend for external input across process restarts.
- Workflow definitions produced by projecting an existing conversation/run into a reusable workflow.
- Workflow-run linkage to sessions.
- Workflow-run linkage to schedule-run records when started by a schedule.
- Workflow-declared required/default permission metadata and step-level agent, skill, or tool requirements.

## Does Not Own

- Public API routes except optional route adapters.
- Agent execution loop outside workflow coordination.
- Schedule timing, recurrence, or trigger history.
- Permission lifecycle, policy evaluation, or authorization decisions.
- Physical persistence backend choice.

## Depends On

- agent, skills, session, or tools as workflow semantics require.
- permission, when workflow-declared permission metadata must be resolved or validated.
- storage for persisted workflow definitions and run state.

## Used By

- runtime
- server
- schedule
- workflow tool surfaces

## Boundary Rules

- Workflow defines process structure.
- Workflow is the scheduled execution boundary: scheduled work must be modeled as a workflow before schedule can trigger it.
- Workflow definitions may declare permissions required to run the workflow or individual steps.
- Workflow permission declarations are not authorization decisions; permission owns effective allow/deny evaluation.
- Workflow steps may require agents, skills, or tools, but runtime assembles and enforces the effective execution context.
- Workflow runs are captured through sessions or session-linked run records.
- A workflow run is a durable, resumable run: its state shape (cursor, context, step journal) is defined with session and persisted through storage contracts, never as in-memory-only state. Runtime decides when to checkpoint, suspend, resume, and replay.
- A normal conversation is the simplest workflow (a single assistant-turn loop); any conversation may be projected into a reusable workflow definition over the same ledger.
- The agent-perceivable surface — synthetic workflow tool messages (`workflow_parameters`, `workflow_decide`) and step ordering — must be identical whether a run is fresh or resumed.
- A workflow run may be nested inside a parent session, including schedule-created parent sessions and normal agent conversation sessions.
- Runtime coordinates live execution.
- Storage persists definitions and run state through stable contracts.
- Workflow edges are unconditional by default; an edge with no routing configuration always routes to its target node.
- Edges may optionally be configured as routing edges by selecting a structured output field from the source node and a specific expected value. The edge triggers only when that field matches the configured value.
- Routing ownership belongs to the edge, not the source node. Decide, structured, and side-note nodes produce output, but each edge independently owns whether and how it routes on that output.
- Routing configuration is field-to-single-value matching only. It does not include complex expressions, whole-array matching, or status/progress field conventions.

## Canonical Operations

Workflow management tools, SDK routes, runtime flows, schedule triggers, and package integrations must use the package-owned workflow operations for create, read, update, delete, list, validate, and run/dispatch behavior.
