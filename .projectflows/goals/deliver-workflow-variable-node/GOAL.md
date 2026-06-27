---
name: deliver-workflow-variable-node
title: Deliver Workflow Variable Node
description: Implement a first-class workflow `variable` node that deterministically defines, resolves, overrides, and updates runtime values during workflow execution.
status: ready
type: feature
scope: packages/workflow, packages/tools/workflows, workflow UI surfaces, workflow authoring docs/skills
attempt: 0
max_attempts: 5
last_result: none
next_action: Inspect existing workflow node implementations and design the `variable` node consistently with the Node-as-Tool standard before editing code.
success_criteria:
  - `variable` is registered as a workflow node type with stable tool name `workflow_variable`.
  - Variable nodes can define one or more named values using strings, arrays, objects, and lists/sets of objects.
  - Variable values resolve references/templates to outputs from earlier workflow nodes, including nested object/array values.
  - Runtime inputs from upstream nodes can override or supplement variable node defaults.
  - Variable nodes support replace/override and append/collect update semantics.
  - Variable node execution emits standard session-visible tool lifecycle parts with workflow metadata.
  - Workflow creation/update/list/get/run surfaces accept and preserve variable node definitions.
  - UI authoring surfaces expose the variable node consistently with existing node patterns.
  - Tests or verification workflows prove the AI-search-terms-with-date example works.
source: mixed
---

# Deliver Workflow Variable Node

## Goal

Deliver a first-class workflow `variable` node that allows workflow authors to create deterministic runtime data without requiring prompt, structured, or external tool nodes. The node must follow OpenDora's Node-as-Tool standard and behave like other workflow nodes across schema, registry, runner, tool metadata, UI authoring, persistence, and session history.

## Source Requirements

User wants a workflow node that can:

- act as a variable/data-shaping node inside a workflow
- define one or more values, not just one scalar variable
- support strings, arrays, objects, and lists/sets of objects
- include static values mixed with references to outputs from other nodes
- allow other nodes to pass values into it
- allow runtime updates during a workflow run
- support replace/override behavior
- support append/collect behavior for arrays/lists
- be implemented using the existing node standards
- include a concrete example for building search terms:
  - `AI news ${dateFromOtherNode}`
  - `general AI events ${dateFromOtherNode}`
  - `new model releases ${dateFromOtherNode}`

## Problem / Motivation

Workflow authors currently need deterministic data assembly inside workflows. Simple value construction should not require an LLM prompt, a structured-output prompt, or a custom external tool. A variable node gives workflows a reusable primitive for assembling and updating runtime data, especially when later nodes need lists, objects, or parameter payloads derived from earlier node outputs.

## Vision Alignment

Relevant product context:

- `packages/workflow/VISION.md` defines every workflow node as a first-class tool.
- `variable` / `workflow_variable` is now recorded as approved workflow intent.
- Every node execution must be visible in session history as a standard tool call.
- Tool parts must include `workflowMeta`.
- Workflow runtime behavior must preserve durable, resumable run semantics.
- `packages/tools/workflows/VISION.md` expects one tool definition per node type.

Product/non-goal constraints:

- Do not treat variable node execution as hidden runner internals.
- Do not bypass the Node-as-Tool standard.
- Do not make this an LLM-dependent node; it should be deterministic data shaping.
- Do not introduce package-boundary violations.

## Convention Constraints

Relevant technical/project constraints:

- Read root `AGENTS.md`.
- Read `packages/workflow/AGENTS.md`.
- Read root `MIGRATION.md` and `packages/workflow/MIGRATION.md` before touching workflow runner state.
- Preserve node type parity across:
  - `packages/workflow/src/node-types.ts`
  - `packages/workflow/src/node-registry.ts`
  - `packages/workflow/src/runner.ts`
  - workflow CRUD/storage/schema surfaces
  - workflow UI node/editor surfaces
  - workflow tool definitions/catalog surfaces
- If runtime semantics described by workflow authoring skills/docs change, update those docs in the same change.

Required stack/patterns:

- TypeScript.
- Existing workspace/package architecture.
- Existing JSON-schema/MCP-shaped node/tool metadata style.
- Existing workflow reference/template resolver behavior where available.
- Existing session tool part lifecycle:
  - `running`
  - `completed`
  - `error`

Forbidden patterns:

- Do not add in-memory-only run state as the source of truth.
- Do not invent a second node registry.
- Do not create ad-hoc node config fields that cannot be expressed cleanly in JSON-schema-style metadata.
- Do not skip session tool-part emission.
- Do not hardcode the example as special-case behavior.
- Do not implement this only in UI without runner support, or only in runner without authoring support.

Verification commands:

- Determine exact project commands during implementation.
- Likely minimum:
  - package/typecheck command for affected packages
  - targeted workflow tests if present
  - manual or scripted workflow run using the example variable node

## Scope

Execution should inspect and update the relevant workflow implementation surfaces, likely including:

- workflow node type definitions
- node registry and constraints
- runner execution branch for `variable`
- reference/template resolution behavior for nested arrays/objects
- context/output storage semantics for variable node results
- tool definition/catalog metadata for `workflow_variable`
- workflow create/update/get/list/run validation or schema preservation
- web workflow editor/node palette/drawer fields if needed
- agent-facing workflow authoring documentation/skill if present
- tests and verification fixtures

The delivered node should support at least:

```json
{
  "values": {
    "searchTerms": [
      "AI news ${dateFromOtherNode}",
      "general AI events ${dateFromOtherNode}",
      "new model releases ${dateFromOtherNode}"
    ]
  },
  "updates": {
    "mode": "replace"
  }
}
```

and append/collect behavior for list-like values.

## Out of Scope

- Full durable-run migration.
- New storage backend work.
- New general expression language beyond references/templates needed for variable values.
- Complex conditional routing changes.
- Replacing existing Parameters, Structured, Prompt, Tool, or Output nodes.
- Building unrelated workflow nodes.
- Changing workflow scheduling semantics.
- Changing permission semantics.

## Acceptance Criteria

1. Node identity:
   - `variable` exists as a canonical node type.
   - Stable tool name is `workflow_variable`.
   - It appears in node/tool catalog metadata consistently.

2. Node-as-Tool compliance:
   - Execution emits a `workflow_variable` tool part.
   - Tool part starts as `running`.
   - Tool part finishes as `completed` or `error`.
   - Tool part includes `workflowMeta` with workflow ID, run ID, node ID, node type, and node label.

3. Value shapes:
   - A node can define multiple named values.
   - Values may be strings, arrays, objects, and lists/sets of objects.
   - Nested arrays/objects are preserved after resolution.

4. References/templates:
   - Values can reference previous node outputs.
   - References work inside nested strings, arrays, and objects.
   - Missing/invalid references fail clearly or follow existing resolver behavior consistently.

5. Runtime updates:
   - Upstream/runtime values can override or supplement static values.
   - Replace/override mode replaces configured values.
   - Append/collect mode appends to arrays/lists.
   - Non-list append attempts are validated or produce clear errors.

6. Workflow context/output:
   - Variable node output is available to later nodes by node key/store mechanism consistent with existing nodes.
   - Later tool/prompt/structured/output nodes can consume the variable node's produced values.

7. UI/authoring:
   - Workflow editor can create/edit/save variable nodes.
   - Variable node fields are understandable and preserve data shape.
   - Node palette/drawer behavior matches existing node standards.

8. Docs:
   - Workflow authoring docs/skill are updated if present.
   - Product vision remains aligned and is not contradicted.

9. Verification:
   - A workflow can produce a date/time from one node.
   - A variable node can build:
     - `AI news <date>`
     - `general AI events <date>`
     - `new model releases <date>`
   - A later node can consume that list.

## Judgment Rubric

Mark done only if:

- the node works through real workflow execution, not only schema/UI registration
- the implementation follows existing node patterns instead of creating a separate special path
- session history is agent-readable through `workflow_variable`
- nested value resolution is covered
- append/collect semantics are explicitly implemented and verified
- implementation does not regress existing workflow node behavior
- implementation respects current migration warnings around durable run state

Continue if:

- implementation exists but UI cannot author/save it
- UI exists but runner cannot execute it
- references only work at top level, not nested values
- append mode is ambiguous or untested
- session tool output is missing or non-standard

Block and ask if:

- existing workflow state model prevents safe runtime updates without broader durable-run migration
- there are conflicting existing conventions for how node values should be represented
- user decision is needed on UI shape or expression syntax beyond existing references/templates

## Implementation Guidance

Use existing nodes as implementation standards:

- `parameters` for schema-like value definitions and validation style
- `structured` for JSON object handling and output availability
- `set_workdir` / `configure_session` for deterministic state mutation patterns
- `output` for resolved object output behavior
- existing reference/template resolver functions for resolving values

Suggested conceptual config shape, adjustable to existing code style:

```ts
{
  values: Record<string, unknown>,
  updateMode?: "replace" | "append",
  inputMapping?: Record<string, unknown>
}
```

Expected output shape should be predictable, likely:

```json
{
  "values": {
    "searchTerms": [
      "AI news 2026-06-23",
      "general AI events 2026-06-23",
      "new model releases 2026-06-23"
    ]
  }
}
```

If existing workflow context stores node output directly by node key, preserve that pattern.

When designing append/collect:

- append mode should append list values to existing list values
- replace mode should replace the named value
- object merge behavior should be explicit; if not implemented, treat object values as replace-only unless existing conventions support deep merge

## Risks / Unknowns

- Existing resolver may only resolve strings; implementation may need recursive resolution for arrays/objects.
- Existing workflow UI may not have a generic JSON/object editor suitable for variable values.
- Existing node docs/skills may live outside the found paths; execution should search before finalizing.
- Durable-run migration warns against new in-memory-only state; variable node should use existing workflow context behavior without expanding state scope unsafely.
- Exact storage/schema validation surface needs implementation discovery.

## Verification Expectations

Minimum expected verification:

- Typecheck affected packages.
- Add or update unit tests for recursive reference/template resolution.
- Add or update workflow runner tests for:
  - single string variable
  - multiple named values
  - nested object/array resolution
  - replace/override
  - append/collect
  - missing reference behavior
- Manually or programmatically run a workflow proving:
  1. earlier node outputs a date/time
  2. variable node builds AI search terms using that date/time
  3. later node receives the resulting list
- Inspect session history and confirm `workflow_variable` tool part lifecycle and metadata.

## Attempts

No attempts yet.

## Do Not Repeat

None yet.

## Verification Log

No verification yet.

## Final Outcome

Pending.

## Ready For Execution

- Status: yes
- Reason: Product intent is confirmed, Vision is updated, scope is bounded to delivering the variable workflow node, and acceptance criteria define implementation and verification expectations.
