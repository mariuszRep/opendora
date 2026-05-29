---
name: manage-workflow
description: Use this skill for all workflow work — creating, reading, editing, deleting, and running workflows. Guides you through composing workflows with existing node types. Explains when a task cannot be accomplished with current nodes and what would need to change to unlock it.
origin: opendora
---

# Workflow Operations Skill

Use this skill whenever you need to create, inspect, modify, delete, or run a workflow.

## Quick Reference: Available Tools

| Tool | Purpose |
|------|---------|
| `workflow_list` | See all workflows in this project |
| `workflow_get` | Read a workflow by ID (always do this before updating) |
| `workflow_create` | Create a new workflow — pass the complete workflow JSON |
| `workflow_update` | Replace an existing workflow — pass id + complete workflow JSON |
| `workflow_delete` | Permanently delete a workflow |
| `workflow_run` | Start a workflow in a background session |

`workflow_create` and `workflow_update` both accept a `workflow` field containing the complete JSON — exactly the same shape the UI editor produces.

---

## Authoring Standard — Treat every workflow as a native tool

OpenDora workflows are **native tools**. They are not MCP servers, but every parameter, description, and field shape in OpenDora intentionally follows the **MCP / JSON‑Schema convention** so any native tool — including a published workflow — can be exposed over MCP later without redesign.

When you author a workflow you are authoring a tool. Hold every field to tool‑definition quality:

- **Workflow `name` and `description`** — describe the tool's purpose, when to call it, and what it returns. This is what another agent will see when deciding to invoke it.
- **`Parameters` node entries** (`workflowParameters`) — these are the workflow's `inputSchema`. Each entry must specify:
  - **`name`** — stable, `snake_case`, unique within the workflow.
  - **`type`** — exact JSON Schema type (`string`, `number`, `integer`, `boolean`, `array`, `object`, `null`). No `string` catch‑alls.
  - **`description`** — self‑contained, imperative, includes purpose, expected format, units, and an example. Assume the only context the caller has is this string.
  - **`required`** — explicit. The runner throws on missing required values.
  - **`enum`** — list every legal value when the input is constrained. The runner rejects out‑of‑set values.
- **`Decide` node `cases[].label`** — these are routing tokens the agent must emit. Make labels short, unambiguous, mutually exclusive, and include a brief description on the node so the agent knows when to choose each.
- **Tool node `parameters`** — the tool you call already has its own MCP‑style schema; respect its required fields and types. Do not stuff free‑form strings into typed fields.
- **Node `description`** — describe the *effect* of the step, not its label. Surfaces in the agent's context.

If a description, type, or enum is weak, agents will misuse the workflow the same way they misuse a poorly‑specified MCP tool. There is no second layer that fixes this.

---

## Part 1: The Node Format

Every workflow is a JSON object with `id`, `name`, `nodes`, and `edges`. All nodes use `type: "workflow"`.

There are four node kinds, set in `data.nodeType`: `parameters`, `prompt`, `tool`, `decide`.

### Node shape

```json
{
  "id": "<unique-within-workflow>",
  "type": "workflow",
  "data": {
    "nodeType": "prompt" | "tool",
    "node": { "label": "...", "description": "", "action_id": "...", "parameters": {} },
    "data": { "inputs": [], "outputs": [] },
    "instructions": "...",
    "agentArgs": []
  },
  "position": { "x": 0, "y": 0 }
}
```

---

### Parameters node (`nodeType: "parameters"`)

Declares the workflow's typed inputs. This is the workflow's **`inputSchema`** — apply the Authoring Standard above to every entry. Place it as a root node so it runs first; downstream nodes reference values via `$input.<name>`.

```json
{
  "id": "params",
  "type": "workflow",
  "data": {
    "nodeType": "parameters",
    "node": { "label": "Inputs", "description": "Inputs accepted by this workflow" },
    "data": { "inputs": [], "outputs": [] },
    "workflowParameters": [
      {
        "name": "topic",
        "type": "string",
        "description": "Subject to research. Free-form text, e.g. \"quantum error correction\".",
        "required": true
      },
      {
        "name": "depth",
        "type": "string",
        "description": "How thorough the research should be.",
        "required": false,
        "enum": ["shallow", "standard", "deep"]
      }
    ]
  },
  "position": { "x": 0, "y": 0 }
}
```

The runner validates `required` and `enum` and injects a synthetic `workflow_parameters` tool message so the agent sees inputs as if produced by a tool call. Weak descriptions degrade agent behavior; treat them as MCP tool descriptions.

---

### Prompt node (`nodeType: "prompt"`)

Sends a message to the agent and captures the response. Use `instructions` for the prompt text. Reference `$input.field` and `$ctx.key` for substitution.

```json
{
  "id": "research",
  "type": "workflow",
  "data": {
    "nodeType": "prompt",
    "node": { "label": "Research", "description": "" },
    "data": { "inputs": [], "outputs": [] },
    "instructions": "Research this topic thoroughly: $input.topic",
    "agentArgs": []
  },
  "position": { "x": 0, "y": 0 }
}
```

To store the agent's response for later use, add `"output": "keyName"` inside `node.parameters`. The result is then available as `$ctx.keyName`.

---

### Tool node (`nodeType: "tool"`)

Runs any tool directly. Set `action_id` to the tool name. Pass fixed parameters in `node.parameters`. Parameter values may reference `$input.field` or `$ctx.key`.

```json
{
  "id": "read-file",
  "type": "workflow",
  "data": {
    "nodeType": "tool",
    "node": {
      "label": "Read Config",
      "description": "",
      "action_id": "read",
      "parameters": { "file_path": "$input.config_path", "output": "configContent" }
    },
    "data": { "inputs": [], "outputs": [] },
    "agentArgs": []
  },
  "position": { "x": 0, "y": 200 }
}
```

Use `"output": "keyName"` in parameters to store the tool result in `$ctx.keyName`.

---

### Special action_ids for tool nodes

#### `skill_load` — Load a skill

```json
{
  "id": "load-skill",
  "type": "workflow",
  "data": {
    "nodeType": "tool",
    "node": {
      "label": "Load Skill",
      "description": "",
      "action_id": "skill_load",
      "parameters": { "name": "product-explore" }
    },
    "data": { "inputs": [], "outputs": [] },
    "agentArgs": []
  },
  "position": { "x": 0, "y": 0 }
}
```

Any other `action_id` is the name of a registered tool — the runner calls it directly.

---

### Decide node (`nodeType: "decide"`)

Routes execution to one branch based on either an agent decision (`mode: "agent"`) or a deterministic expression (`mode: "deterministic"`). Apply the Authoring Standard to `node.description` and every `cases[].label`.

**Agent mode** — the runner asks the agent to reply with exactly one of the case labels.

```json
{
  "id": "route",
  "type": "workflow",
  "data": {
    "nodeType": "decide",
    "node": {
      "label": "Route by depth",
      "description": "Choose the research path that matches the requested depth.",
      "parameters": {
        "mode": "agent",
        "cases": [
          { "label": "deep_dive" },
          { "label": "summarize" }
        ],
        "default": "summarize"
      }
    },
    "data": { "inputs": [], "outputs": [] }
  },
  "position": { "x": 0, "y": 200 }
}
```

**Deterministic mode** — match a value from `$input` or `$ctx` against per‑case predicates.

```json
"parameters": {
  "mode": "deterministic",
  "input": "$input.depth",
  "cases": [
    { "label": "deep_dive",  "when": { "op": "equals", "value": "deep" } },
    { "label": "summarize",  "when": { "op": "equals", "value": "shallow" } }
  ],
  "default": "summarize"
}
```

Outgoing edges fire by label:
- Edge with no label or `label: "result"` — always fires.
- Edge labeled with a case `label` — fires when that case wins.
- Edge labeled `else` — fires when no case matched and no `default` resolved it.

The decision is auto‑stored under `$ctx.<node_label_snake_case>` (override with `parameters.output`).

---

## Part 2: Building Workflows

### Rules

1. Workflows start from **root nodes** — nodes with no incoming edges.
2. Workflows terminate naturally at any node with no outgoing edges — no special terminator node needed.
3. Every node must be reachable from a root via edges.
4. Edges leaving a `decide` node must have a `label` matching one of its `cases[].label` values (or `result` / `else`).
5. No cycles.
6. Reference syntax: `$input.fieldName` · `$ctx.keyName`

### Position convention

Increment `y` by 200 per row. Branches share the same `y`, spread by `x`.

### Template: Linear workflow

```json
{
  "id": "my-workflow",
  "name": "My Workflow",
  "description": "Does X",
  "version": "1.0.0",
  "nodes": [
    {
      "id": "step1",
      "type": "workflow",
      "data": {
        "nodeType": "prompt",
        "node": { "label": "Research", "description": "" },
        "data": { "inputs": [], "outputs": [] },
        "instructions": "Research this topic: $input.topic",
        "agentArgs": []
      },
      "position": { "x": 0, "y": 0 }
    }
  ],
  "edges": []
}
```

### Template: Decision branch edges

```json
"edges": [
  { "id": "e1", "source": "research", "target": "route" },
  { "id": "e2", "source": "route", "target": "handle-deep",    "label": "deep_dive" },
  { "id": "e3", "source": "route", "target": "handle-summary", "label": "summarize" },
  { "id": "e4", "source": "route", "target": "handle-fallback", "label": "else" }
]
```

`route` is a `decide` node. Edge labels must match its `cases[].label` values exactly (or `result` / `else`). `handle-*` nodes have no outgoing edges — traversal ends there naturally.

---

## Part 3: When You Are Blocked

**Stop immediately if the task requires something none of the current node kinds can do. Do not invent new node kinds.**

When you hit a block, do the following:

1. **Name the missing capability** exactly — be specific about what the workflow would need to do.
2. **State which node type would unlock it** — use the table below.
3. **Ask the user to choose**: either (A) redesign the workflow to stay within current node types, or (B) flag the need for the new node type to be developed before this workflow can be built.

Do not proceed, approximate, or work around the limit without the user's explicit direction.

| Required Capability | Why blocked | What would unlock it |
|---------------------|-------------|---------------------|
| **Loop / iteration** | No loop node; branching can only route forward | A `foreach` or `loop` node kind |
| **Parallel branches** | Edges are sequential; no fork-join | A `parallel` node with a merge node |
| **Wait for external event** | Workflow runs to completion; no suspend/resume | A `wait` or `trigger` node |
| **Sub-workflow call** (blocking) | `workflow_run` fires in background; output not capturable | A `workflow_call` node that blocks until child completes |
| **Workflow inputs declaration** | Use a `parameters` node — it declares the workflow's typed `inputSchema` | Already supported; see Parameters node above |
| **Error handling / retry** | No try/catch construct | A `catch` edge type or `retry` wrapper |
| **Human-in-the-loop approval** | No mechanism to pause mid-workflow | A `checkpoint` node that suspends for human reply |

---

## Part 4: CRUD Procedures

### Creating a workflow

1. `workflow_list` — check existing IDs
2. Design the JSON (nodes + edges) before calling the tool
3. Verify: every `decide` edge has a `label`, every path terminates
4. `workflow_create { workflow: { ...full JSON... } }`
5. On schema error: read the message, fix the offending node/edge, retry

### Updating a workflow

1. `workflow_get { id }` — always read current state first
2. `workflow_update { id, workflow: { ...full replacement JSON... } }`
3. The `workflow.id` field inside the JSON must match the `id` parameter
4. This is a full replacement — all nodes and edges are overwritten

### Deleting a workflow

1. Confirm with the user — this is permanent
2. `workflow_delete { id }`

### Running a workflow

```
workflow_run {
  workflowId: "my-workflow",
  input: { "topic": "quantum computing" },
  agentId: "engineer"
}
```

Returns a `sessionId` immediately. Navigate to that session to follow execution live.

---

## Part 5: Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Schema validation error | A node is missing `type: "workflow"` or `data` is malformed | Check the `data` shape matches the templates above |
| `decide` follows wrong branch | Edge labels don't match what the agent outputs | Edge `label` values must exactly match the words the agent will choose between |
| `$ctx.key` resolves empty | Prior node didn't store output under that key | Ensure the preceding node has `"output": "keyName"` in its `node.parameters` |
| Prompt node does nothing useful | `instructions` doesn't include the context it needs | Add `$input.field` or `$ctx.key` refs to `instructions` |
