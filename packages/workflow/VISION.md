# VISION.md — packages/workflow

> Owner: human. Approved intent only.

## Intent

Workflow owns reusable process definitions and workflow domain behavior. Workflows are the only executable unit that schedules may trigger.

**Workflows are reusable definitions.** There is no separate `workflow_templates` concept or table. Workflows serve as the reusable definition; workflow executions and runs are represented by sessions as runtime containers. Sessions hold the runtime state and entry ledger for a workflow execution; the workflow definition itself is versioned and reusable across multiple session runs.

Workflow canvas/node infrastructure may be reused by Agent Builder for agent definition composition. Agent Builder graph semantics are composition/compilation, not workflow execution, and do not change scheduled workflow execution ownership.

Workflow execution may include an Agent Run node (or Prompt Agent node) that invokes an existing agent definition at runtime. This is distinct from Agent Builder's Agent node/definition graph: in workflow the node executes an agent, in Agent Builder the node defines/compiles an agent definition. Runtime owns the execution loop for both contexts.

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
   | `variable` | `workflow_variable` |

### What this enables

- An agent can inspect a session and read workflow execution exactly as it reads its own tool calls — no special-casing needed.
- The UI renders every node as a collapsible tool card with live state, input, and output.
- Error recovery is uniform: any node that fails shows its error state in the session and the workflow stops cleanly.
- Future resumability can replay from the session's tool call history, because the history is complete and structured.

---

## Structured output and format-switchable views

Every workflow node emits its output as a canonical JSON payload so the UI can switch between multiple format views — JSON, YAML, XML, Markdown, HTML Code, and HTML View — without per-tool special-casing. JSON is always the source of truth; all other views are generated projections from the canonical data.

### Canonical output envelope

Every completed node tool part carries an output object with a stable shape:

```ts
{
  // The node's primary result data — always a JSON-serializable object or array.
  // For structured nodes this is the validated JSON from the model.
  // For variable nodes this is the resolved values object.
  // For output nodes this is the declared return fields.
  // For tool nodes this is a JSON object parsed from the tool's output string.
  // For prompt nodes this is the text response wrapped as { text: "..." }.
  data: unknown,

  // Optional format/display hints the UI uses to select a view mode.
  // Absent hints mean the UI falls back to JSON view.
  render?: {
    // Preferred default view format when the user has not overridden.
    // "json" shows raw JSON; "auto" lets the UI choose best-fit from
    // the available projections (yaml, xml, markdown, html).
    defaultView?: "json" | "yaml" | "xml" | "markdown" | "html" | "auto",

    // Human-readable summary line shown in the collapsed tool header.
    summary?: string,
  }
}
```

> **Note**: Render-layout preferences (arrayAs table/card/list, objectAs card/details, titleField, descriptionField, visible fields/order) are not part of the current envelope. They are handled in Phase 2 — see "Phase 2: Render layout customization" below.

### Current migration state

- Most workflow node types already produce structured data internally (parsed JSON objects for `structured`, `variable`, `foreach`, `output`, `configure_session`).
- The `startNodeToolPart.finish()` method currently stringifies non-string output as pretty JSON, which strips structured metadata from the session part.
- The runner stores parsed objects in workflow context (`ctx`) but the session tool part carries only the stringified form.
- Tool nodes (`tool` pass-through) receive raw `output: string` from the tool executor, which must be parsed back to JSON for canonical form.
- UI renders generic tool output as a JSON code block; only specialized tools have custom view/code toggles.

### Target

Node outputs should transition from `output: string` in session parts to the canonical `data` envelope with optional `render` hints. The `startNodeToolPart.finish()` signature should accept structured output and store it alongside the stringified version, so the UI can read either form.

### Relationship to tools/VISION.md

Tools also emit `output: string` from their `execute()` contract (see `packages/tools/tool.ts`). That contract is the source of the stringification problem for tool nodes. The `packages/tools/VISION.md` target (MCP-compatible `.json` definitions with `inputSchema`/`outputSchema`) does not mandate an output format. This workflow section defines the canonical output envelope that tools and workflow nodes should converge on, while `packages/tools` owns the per-tool output schema definitions that fill the envelope.

### Format views

The UI offers these switchable format views, all projected from the canonical JSON `data`:

| Format | Description |
|--------|-------------|
| JSON | Raw canonical JSON — always the source of truth |
| YAML | YAML projection via js-yaml or similar library |
| XML | XML projection via generic JSON-to-XML conversion |
| Markdown | Markdown projection; arrays of objects with uniform keys render as tables by default |
| HTML Code | Generated HTML source code displayed in a code viewer |
| HTML View | Generated HTML rendered in a sandboxed iframe |

A shared JSON-to-format translator utility produces all projections from the canonical `data` object. The first implementation is one-way (JSON → all views). The translator lives in a shared location (e.g. `packages/workflow/src/format/` or a new shared package) that both the workflow runner and UI can import.

### Phase 2: Render layout customization (structured node HTML render layout)

The structured node may carry an optional `renderLayout` configuration that controls how its JSON output data is visually projected into generated HTML. This is a display-only layer on top of the canonical JSON source of truth; `outputSchema` and the canonical data shape remain unchanged.

Configuration targets the two generated HTML formats (HTML Code and HTML View):

- `arrayAs: "table" | "cards" | "list"` — how arrays of objects display in generated HTML
- `objectAs: "card" | "details"` — how individual objects display
- Field-role mappings for card/detail layouts:
  - `titleField` — which field supplies the heading/title
  - `descriptionField` — which field supplies the body/description text
  - `statusField` — which field supplies a status badge or indicator
  - `imageField` / `iconField` — which field supplies an image URL or icon
  - `metadataFields` — which additional fields render as a metadata row/column
  - `actions` — which fields supply action links or buttons
- `visibleFields`, `fieldOrder` — which fields to show and in what display order

Key constraints:
- **JSON remains the source of truth.** `renderLayout` controls only how generated HTML projects the data for visual consumption.
- **`outputSchema` is not modified.** The canonical data shape and its validation contract are preserved.
- **HTML Code and HTML View both use the same generated HTML** from the shared translator utility established in phase 1.
- **Sandboxed iframe** (`allow-scripts` without `allow-same-origin`) remains required for HTML View.
- **Backward compatibility.** Structured nodes without `renderLayout` config use the default/auto rendering determined by the shared translator from phase 1.
- **Format isolation.** JSON, YAML, XML, and Markdown projections are unaffected unless explicitly documented.

This work is tracked in `.projectflows/goals/structured-node-html-render-layout/GOAL.md`. It is sequenced after the initial `structured-node-format-switching` goal (phase 1) because it depends on the shared translator utility and format-switching UI foundation established there.

### Deferred: Bidirectional editing

Parsing YAML/XML/Markdown/HTML back into JSON for editing is deferred. The first implementation is read-only format switching from the canonical JSON source. When bidirectional sync is added, the shared translator utility will gain parse functions for each format.

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

## Variable Node

The `variable` node type (`workflow_variable`) is a first-class Node-as-Tool for defining and shaping runtime data values within a workflow.

### Purpose

Workflow authors need a way to assemble deterministic data values — strings, arrays, objects, sets/lists of objects — from static content and dynamic references to previous node outputs, without forcing every data-shaping step through prompt/structured/tool nodes. The variable node fills this gap as a reusable data-shaping node.

### Variable/value shapes

A variable node may define one or more named values. Supported shapes include:
- **Strings** — plain text values
- **Arrays** — ordered lists of values (strings, numbers, or nested objects)
- **Objects** — structured key/value maps
- **Sets/lists of objects** — ordered collections of structured records

Not limited to a single scalar variable. A single variable node may define and produce multiple named values of mixed shapes.

### Reference/template resolution

Values may include reference/template expressions that resolve against outputs from previous nodes. This allows static structures to include dynamic fragments from earlier nodes.

Example: a variable node builds a search terms array:
```
[
  "AI news ${dateFromOtherNode}",
  "general AI events ${dateFromOtherNode}",
  "new model releases ${dateFromOtherNode}"
]
```
where `${dateFromOtherNode}` references a date/time value produced by an earlier node.

### Pass-through values

Other or upstream nodes may pass values into the variable node, overriding or supplementing the statically defined values at runtime.

### Update semantics

During a workflow run each variable entry supports two update modes:
- **Replace/override** — the entry value is replaced by the resolved value on every execution.
- **Append/collect** — for array entries, the resolved items are concatenated onto the existing array stored under the same key in the workflow context (from a previous execution of this node, e.g. across loop iterations). Falls back to replace if the existing value is not an array.

`updateMode` is configured per entry, not globally, so a single Variable node can replace a string while appending to an array in the same execution.

### Canonical storage shape

Variable node configuration is stored in `node.parameters.variables` as an ordered array of `VariableEntry` objects. Each entry describes one named output value:

```ts
type VariableEntry = {
  name: string                          // output key — referenced downstream as $nodeKey.name
  type: "string" | "number" | "boolean" | "array"
  value: string                         // for string / number / boolean — may contain $ref expressions
  items: string[]                       // for array — each element may contain $ref expressions
  updateMode: "replace" | "append"      // per-entry, defaults to "replace"
}
```

The runner resolves each entry at execution time:
- **string** — `resolveRef(entry.value)` coerced to `String`
- **number** — `resolveRef(entry.value)` coerced to `Number`
- **boolean** — `resolveRef(entry.value)` coerced to truthy boolean
- **array** — `entry.items.map(item => resolveRef(item))` preserving resolved types per element

The assembled output object `{ [entry.name]: resolvedValue, … }` is stored under `ctx[nodeKey]` and emitted as the `workflow_variable` tool part output.

### Per-node documentation scope

If workflow nodes do not yet have per-node scoped VISION docs, implementation planning should decide whether each node type should be isolated as its own documented entity/package/module within the workflow package and then treat the variable node consistently with whatever standard is chosen.

## Canonical Operations

Workflow management tools, SDK routes, runtime flows, schedule triggers, and package integrations must use the package-owned workflow operations for create, read, update, delete, list, validate, and run/dispatch behavior.
