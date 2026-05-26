---
name: manage-workflow
description: Use this skill for all workflow work — creating, reading, editing, deleting, and running workflows. Guides you through composing workflows with existing node types. Explains when a task cannot be accomplished with current nodes and what would need to change to unlock it.
origin: opendora
tools: [workflow_create, workflow_get, workflow_list, workflow_update, workflow_delete, workflow_run]
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

`workflow_create` and `workflow_update` both accept a `workflow` field containing the complete JSON — exactly the same shape the UI editor produces and the HTTP API accepts.

---

## Part 1: The Node Format

Every workflow is a JSON object with `id`, `name`, `nodes`, and `edges`. All nodes use `type: "workflow"` — the node kind is encoded inside `data`.

### Node shape

```json
{
  "id": "<unique-within-workflow>",
  "type": "workflow",
  "data": {
    "nodeType": "<kind>",
    "node": { "action_id": "<action>", "label": "...", "description": "..." },
    "data": { ... },
    "instructions": "..."
  },
  "position": { "x": 0, "y": 0 }
}
```

### Node kinds

#### Start (entry point)
Every workflow has exactly one start node. Declares the input fields callers must provide.

```json
{
  "id": "start",
  "type": "workflow",
  "data": {
    "nodeType": "start",
    "node": { "label": "Start", "description": "Workflow entry point" },
    "data": {
      "inputs": [
        { "name": "topic", "type": "string", "required": true },
        { "name": "depth", "type": "number", "required": false }
      ],
      "outputs": []
    }
  },
  "position": { "x": 0, "y": 0 }
}
```

Input field types: `string`, `number`, `boolean`, `object`. Reference them later with `$input.fieldName`.

---

#### Agent (`action_id: "agent"`)
Sends a prompt to the session's agent and captures the response.

```json
{
  "id": "research",
  "type": "workflow",
  "data": {
    "nodeType": "tool",
    "node": { "action_id": "agent", "label": "Research", "description": "..." },
    "data": { "inputs": [], "outputs": [] },
    "instructions": "Research the following topic thoroughly: $input.topic"
  },
  "position": { "x": 0, "y": 200 }
}
```

Use `instructions` for the prompt. Reference `$input.field` and `$ctx.key` values.
To capture the response: add `"parameters": { "output": "keyName" }` inside `node`.

---

#### Decide (`action_id: "decide"`)
Asks the agent to choose a named branch. The chosen branch determines which outgoing edge is followed.

```json
{
  "id": "gate",
  "type": "workflow",
  "data": {
    "nodeType": "tool",
    "node": { "action_id": "decide", "label": "Severity Gate", "description": "..." },
    "data": { "inputs": [], "outputs": [] },
    "instructions": "Based on the findings, is this: critical, moderate, or low risk?"
  },
  "position": { "x": 0, "y": 400 }
}
```

Outgoing edges from a `decide` node must each have a `label` matching one of the expected choices. The agent picks one.

---

#### Skill Load (`action_id: "skill_load"`)
Loads a skill into the workflow session, making its tools available to subsequent agent nodes.

```json
{
  "id": "load-skill",
  "type": "workflow",
  "data": {
    "nodeType": "tool",
    "node": {
      "action_id": "skill_load",
      "label": "Load Skill",
      "description": "Load skill \"product-explore\"",
      "parameters": { "name": "product-explore" }
    },
    "data": { "inputs": [], "outputs": [] }
  },
  "position": { "x": 0, "y": 200 }
}
```

Use `skill_discover` to find available skill names before authoring.

---

#### Tool Call (`action_id: "<tool-name>"`)
Runs any named tool directly using static parameters. Set `action_id` to the tool name.

```json
{
  "id": "read-file",
  "type": "workflow",
  "data": {
    "nodeType": "tool",
    "node": {
      "action_id": "read",
      "label": "Read Config",
      "description": "Read the config file",
      "parameters": { "file_path": "$input.config_path", "output": "configContent" }
    },
    "data": { "inputs": [], "outputs": [] }
  },
  "position": { "x": 0, "y": 200 }
}
```

Parameter values may reference `$input.field` or `$ctx.key`. Use `"output": "keyName"` in parameters to store the result in `$ctx`.

---

#### Output (terminator, `action_id: "output"`)
Ends a path through the workflow. Use `instructions` for an optional final message.

```json
{
  "id": "done",
  "type": "workflow",
  "data": {
    "nodeType": "tool",
    "node": { "action_id": "output", "label": "Output", "description": "Workflow complete" },
    "data": { "inputs": [], "outputs": [] },
    "instructions": "Done. Summary: $ctx.summary"
  },
  "position": { "x": 0, "y": 600 }
}
```

Multiple output nodes are allowed (one per branch).

---

## Part 2: Building Workflows

### Rules

1. Exactly one **start** node — always the entry point
2. At least one **output** node — every path must terminate
3. Every node must be reachable from start via edges
4. Edges from **decide** nodes must have a `label` matching one of the expected branch choices
5. No cycles — the schema does not support loops
6. Reference syntax: `$input.fieldName` · `$ctx.keyName`

### Position convention

Increment `y` by 200 per row. Branches share the same `y`, spread by `x`. Keeps the visual editor readable.

### Template: Linear workflow

```json
{
  "id": "my-workflow",
  "name": "My Workflow",
  "description": "Does X",
  "version": "1.0.0",
  "nodes": [
    {
      "id": "start",
      "type": "workflow",
      "data": {
        "nodeType": "start",
        "node": { "label": "Start", "description": "Entry point" },
        "data": { "inputs": [{ "name": "topic", "type": "string", "required": true }], "outputs": [] }
      },
      "position": { "x": 0, "y": 0 }
    },
    {
      "id": "research",
      "type": "workflow",
      "data": {
        "nodeType": "tool",
        "node": { "action_id": "agent", "label": "Research", "description": "Research the topic" },
        "data": { "inputs": [], "outputs": [] },
        "instructions": "Research this topic thoroughly: $input.topic"
      },
      "position": { "x": 0, "y": 200 }
    },
    {
      "id": "done",
      "type": "workflow",
      "data": {
        "nodeType": "tool",
        "node": { "action_id": "output", "label": "Output", "description": "Complete" },
        "data": { "inputs": [], "outputs": [] }
      },
      "position": { "x": 0, "y": 400 }
    }
  ],
  "edges": [
    { "id": "e1", "source": "start", "target": "research" },
    { "id": "e2", "source": "research", "target": "done" }
  ]
}
```

### Template: Decision branch edges

```json
"edges": [
  { "id": "e1", "source": "start", "target": "gate" },
  { "id": "e2", "source": "gate", "target": "handle-critical", "label": "critical" },
  { "id": "e3", "source": "gate", "target": "handle-low",      "label": "low" },
  { "id": "e4", "source": "handle-critical", "target": "done-urgent" },
  { "id": "e5", "source": "handle-low",      "target": "done-quiet" }
]
```

---

## Part 3: When You Are Blocked

**Stop here if the task requires something none of the current node kinds can do.**

Do not invent new node kinds. Do not approximate a blocked capability with a workaround that changes the semantic meaning. Clearly state the block and explain what would unlock it.

### Common blocks and what unlocks them

| Required Capability | Why blocked | What would unlock it |
|---------------------|-------------|---------------------|
| **Loop / iteration** | No loop node; `decide` can only branch forward | A `foreach` or `loop` node kind in the schema + runner |
| **Parallel branches** | Edges are sequential; no fork-join | A `parallel` node with a corresponding merge node |
| **Wait for external event** | Workflow runs to completion; no suspend/resume | A `wait` or `trigger` node that pauses session and resumes on signal |
| **Sub-workflow call** (blocking) | `workflow_run` fires in background; output not capturable | A `workflow_call` node that blocks until child completes and captures its output |
| **Typed / structured output** | Agent and output nodes emit free text | An `output` schema field or a `structured_call` node |
| **Error handling / retry** | No try/catch construct | A `catch` edge type or `retry` wrapper |
| **Human-in-the-loop approval** | No mechanism to pause and surface a question mid-workflow | A `checkpoint` node that suspends and waits for a human reply |
| **Condition without LLM** | `decide` always costs an LLM call | A `condition` node with a static expression evaluator |

### How to report a block

> **Blocked: [capability name]**
>
> This workflow requires [what the user needs]. No current node kind supports this because [reason].
>
> **To unblock:** A `[node-kind]` node would be needed — it would [what it does and what changes are required in schema + runner].
>
> **Workaround (if any):** [Partial approach using existing nodes — be explicit about what it cannot do.]

Never silently fall back to an approximation that doesn't meet the user's intent.

---

## Part 4: CRUD Procedures

### Creating a workflow

1. `workflow_list` — check existing IDs
2. Design the JSON (nodes + edges) before calling the tool
3. Verify: every path reaches an output, every decide edge has a label
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
  input: { topic: "quantum computing" },
  agentId: "engineer"
}
```

Returns a `sessionId` immediately. Navigate to that session to follow execution live. `agentId` is optional — defaults to the calling agent.

---

## Part 5: Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Schema validation error on create/update | A node is missing `type: "workflow"` or `data` is malformed | All nodes must have `type: "workflow"`; check the `data` shape matches the templates above |
| `decide` follows wrong branch | Edge labels don't match what the agent outputs | Edge `label` values must exactly match the words the agent will choose between |
| `$ctx.key` resolves empty | Prior node didn't store output under that key | Ensure the preceding node has `"output": "keyName"` in its `node.parameters` |
| Agent node does nothing useful | Prompt doesn't include the context it needs | Add `$input.field` or `$ctx.key` refs to `instructions` |
| Workflow starts but tool nodes do nothing | Tool executor not wired (known platform gap) | `agent` and `decide` nodes work; `tool_call` nodes require tool executor integration which is in progress |
