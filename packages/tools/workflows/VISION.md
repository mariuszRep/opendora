# VISION.md — packages/tools/workflows

> **Owner: human** — updated only when the vision for this tool group changes.
> Agents read this as the north star for the workflow tools.

---

## Goal

Provide the tool definitions that make workflow node execution visible, structured, and agent-readable. Every workflow node type has a corresponding tool defined here. When the workflow runner executes a node, it emits a tool call using that definition — so the session history is a complete, standard record of what the workflow did.

---

## Node-as-Tool: the core idea

A workflow run is not a black box. Every node execution must appear in the session as a tool call an agent can read. This package owns the tool definitions that make that possible.

The workflow runner (`packages/workflow/src/runner.ts`) calls these tools — or emits tool call parts that mirror their shape — for every node it executes. The session timeline then reads as a sequence of tool calls: an agent can understand what happened in a workflow the same way it understands its own tool use history.

---

## Tool definitions (one per node type)

Each definition specifies:
- **name** — the stable tool name used as the `tool` field in every session tool part for this node
- **description** — what this node does, written so an agent can understand it from the session history
- **inputSchema** — the JSON schema for the node's input (what the runner passes in)
- **outputSchema** — the JSON schema for what the node returns

| Tool name | Node type | What it represents |
|-----------|-----------|-------------------|
| `workflow_parameters` | `parameters` | Validates and injects workflow input parameters |
| `workflow_prompt` | `prompt` | Sends a prompt to the agent and captures the text response |
| `workflow_structured` | `structured` | Prompts the agent for a validated JSON response matching a schema |
| `workflow_decide` | `decide` | Branches execution based on a condition or agent decision |
| `workflow_set_workdir` | `set_workdir` | Sets the active working directory for subsequent nodes |
| `workflow_foreach` | `for_each` | Iterates over a list, running a sub-pipeline for each item |
| `workflow_run` | `run_workflow` | Executes another workflow by ID and waits for its result |
| `workflow_configure_session` | `configure_session` | Patches session parameters (model, agent, paths, title, system prompt) |
| `workflow_output` | `output` | Declares the workflow's return value (terminal node) |
| `workflow_variable` | `variable` | Defines runtime values from static content and dynamic references to previous node outputs |
| `workflow_script` | `script` | Executes a workflow-scoped script file with structured JSON inputs and outputs, supporting Python, Node.js, and optionally shell runtimes |

Tool nodes (`node type: tool`) pass through to the action's own tool definition — they do not add a wrapper.

---

## Session lifecycle contract

Every node execution emits a tool part that follows the Vercel AI SDK tool call lifecycle:

```
running  →  completed
         ↘  error
```

`running` is written before execution starts (live UI feedback). `completed` or `error` is written when the node finishes. No node may skip the `running` phase or create a `completed` part atomically.

See `packages/workflow/VISION.md § Node-as-Tool Standard` for the full contract.

---

## What this package owns

- One tool definition file per node type (TypeScript, exporting name + description + inputSchema + outputSchema)
- An index that re-exports all definitions for use by the runner and any agent that needs to enumerate available workflow node tools
- The `workflow_run` tool implementation (the tool an agent calls to trigger a workflow by ID from a normal session)

## What this package does not own

- The workflow runner — that lives in `packages/workflow/src/runner.ts`
- Node execution logic — owned by the runner
- Session or message persistence — owned by `packages/session`
- The canvas UI or node registry — owned by `packages/workflow`
