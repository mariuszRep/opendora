---
name: canonical-json-tool-output-views
title: Canonical JSON tool output views
description: Standardize every tool and workflow node output around a canonical JSON payload envelope, enable switchable format views (JSON, YAML, XML, Markdown, HTML Code, HTML View) in the UI, and deliver the structured-node format switcher first. Umbrella goal; see structured-node-format-switching for immediate execution.
status: ready
type: feature
scope: packages/tools, packages/workflow, apps/web
attempt: 0
max_attempts: 5
last_result: none
next_action: The focused goal `.projectflows/goals/structured-node-format-switching/GOAL.md` is the immediate execution target. This umbrella goal tracks the broader investigation and remaining node-type work that can proceed in parallel.
success_criteria:
  - Shared JSON-to-format translator utility exists: produces YAML, XML, Markdown, HTML Code, and HTML View from canonical JSON data.
  - Structured node output path updated: `finish()` stores structured data alongside stringified form in session parts.
  - Generic UI format switcher (JSON/YAML/XML/Markdown/HTML Code/HTML View tabs) works for structured node output.
  - HTML View renders generated HTML in a sandboxed iframe.
  - One-way JSON → all views implemented first; bidirectional editing/sync deferred.
  - Render-layout customization (card/table/list preferences) deferred to later phase.
  - All existing specialized views (question, delegate, todo, session_tree, webfetch, memory_write) preserved and not regressed.
  - Tool output inventory classified (JSON/object/string/file/stream/outlier) documenting which tools can/cannot produce JSON.
  - Outlier rules documented: which tools cannot produce JSON outputs and why.
  - Tests or manual workflow verify the end-to-end flow.
source: mixed
---

# Canonical JSON tool output views

## Goal

Standardize OpenDora's tool and workflow node output around a canonical JSON payload so the UI can switch between multiple format views — JSON, YAML, XML, Markdown, HTML Code, and HTML View — without per-tool special-casing. JSON is the source of truth; all other views are generated projections. This is an umbrella goal covering the shared format translator, structured-node format switcher, tool output investigation, and remaining node-type migration. The focused sub-goal `structured-node-format-switching` handles the first implementation increment.

## Source Requirements

- Every tool/node output should be structurally inspectable with switchable format views.
- Available format views: JSON, YAML, XML, Markdown, HTML Code, HTML View.
- JSON is always the source of truth; all other views are generated projections from canonical JSON data.
- First implementation target: workflow `structured` node format switcher + shared JSON-to-format translator utility.
- HTML View must render generated HTML in a sandboxed iframe.
- One-way JSON → all views implemented first. Bidirectional editing/sync is deferred.
- Render-layout customization (card/table/list preferences) is deferred to a later phase, though Markdown and HTML views may naturally use tables/cards internally based on data shape.
- All current tools should be investigated to classify existing output shapes and outliers (parallel track, does not block format switcher).
- Existing per-tool specialized views (question, delegate, todo, session_tree, webfetch, memory_write) must be preserved.
- MCP compatibility must not be broken — `output: string` stays as the human-readable field.
- This shaping pass made no source-code changes. The GOAL is execution-ready and explicitly permits source-code implementation changes within scope during later execution phases.

## Problem / Motivation

OpenDora currently has an inconsistent output model:

1. `packages/tools/tool.ts` contracts `execute()` to return `output: string`, forcing every tool to manually stringify structured results.
2. Many tools already wrap objects in `JSON.stringify()` — the string is JSON but typed as plain text.
3. The workflow runner (`packages/workflow/src/runner.ts`) stores parsed objects in workflow `ctx` but `startNodeToolPart.finish()` serializes non-string output as pretty JSON, discarding structured metadata from the session tool part.
4. The UI (`apps/web/app/dashboard/message-row.tsx`, `apps/web/components/ai-elements/tool.tsx`) renders generic tool output as a JSON code block. Only six specialized tools have custom view/code toggles.
5. The `metadata` field on tool results is inconsistently used and not schema-declared.

Without standardization, every new tool or node type needs custom UI work to display its output readably, and agents reading session history see only stringified text without structured access.

## Vision Alignment

Relevant product context:

- `VISION.md` (root): "Tools are a primary extension boundary because they may need execution behavior, schemas, permissions, configuration, and bespoke UI interaction/rendering surfaces." (line 90)
- `packages/workflow/VISION.md § Node-as-Tool Standard`: Every workflow node is a first-class tool with stable tool names, JSON schema for inputs/outputs, and standard session lifecycle.
- `packages/workflow/VISION.md § Structured output and format-switchable views`: Defines the canonical output envelope with `data`, format views (JSON/YAML/XML/Markdown/HTML), and the migration path from string-only to structured output. Render-layout customization (table/card/list) is deferred.
- `packages/tools/VISION.md § Tool output standardization`: Defines the additive `outputObject` and optional `render` fields on tool execute() results, preserving `output: string` for MCP compatibility. Layout-preference hints (`as`, `fields`) are removed from the target shape and deferred.
- `packages/tools/workflows/VISION.md`: Each workflow node tool definition owns `inputSchema` and `outputSchema`; tool nodes pass through to the action's own tool definition.

Product/non-goal constraints:

- Do NOT change `output: string` — it must remain for MCP compatibility.
- Do NOT break existing specialized UI views (question, delegate, todo, session_tree, webfetch, memory_write).
- Do NOT require all tools to migrate at once — incremental adoption is expected.
- This shaping pass was spec/docs only and made no source-code changes. The GOAL itself permits source-code implementation changes within scope.
- Do NOT create CONVENTIONS files unless clearly necessary.
- This shaping pass only edited VISION.md and GOAL.md. The GOAL permits source-code edits within scope during implementation.

## Convention Constraints

Relevant technical/project constraints:

- Read root `AGENTS.md` before implementation.
- Read root `MIGRATION.md` before touching tool or workflow runner state.
- Preserve existing patterns:
  - `packages/tools/tool.ts` `Tool.Info` execute() return shape
  - `packages/workflow/src/runner.ts` `startNodeToolPart` lifecycle
  - `apps/web/components/ai-elements/tool.tsx` `ToolOutput` component
  - `apps/web/app/dashboard/chatbot.tsx` `formatToolPayload` function
  - `apps/web/app/dashboard/message-row.tsx` per-tool view toggle pattern
- New `outputObject` and `render` fields on tool results are additive — existing consumers that read only `output` continue to work.
- The workflow runner's `finish()` method should accept structured output and store both the structured form and stringified form in the session part.

Required stack/patterns:

- TypeScript.
- Existing `packages/tools/tool.ts` `Tool.Info` contract.
- Existing `packages/workflow/src/runner.ts` `startNodeToolPart` pattern.
- Existing `apps/web/components/ai-elements/tool.tsx` rendering pattern.
- Existing `apps/web/components/ui/code-view-toggle.tsx` toggle component.

Forbidden patterns:

- Do not remove or change the `output: string` field from tool execute() results.
- Do not break MCP wire-format compatibility.
- Do not add a new tool registry or bypass the existing Node-as-Tool standard.
- Do not make the UI switcher require per-tool code changes for every new tool.
- This GOAL permits implementation changes within scope. The shaping pass that produced this GOAL made no source-code changes.

## Current Output Shape Inventory

### Known classifications from exploration

| Source | Output shape | Notes |
|--------|-------------|-------|
| Tool execute() contract (tool.ts) | `output: string` | All tools must stringify |
| Internal tools producing JSON strings | session_search, session_tree, session_get, session_analyze, session_update | Manually `JSON.stringify()` into output |
| Internal tools producing text strings | bash, delegate, reply, question, skill_load, etc. | Natural text output |
| Workflow runner `finish()` | `typeof output === "string" ? output : JSON.stringify(output, null, 2)` | Non-string objects get serialized |
| Workflow `structured` node | Parsed JSON object → stringified in finish(), stored as object in ctx | Dual-path: object in ctx, string in session |
| Workflow `variable` node | Resolved `Record<string, unknown>` → same dual-path | Same pattern as structured |
| Workflow `output` node | Resolved fields → same dual-path | Same pattern |
| Workflow `foreach` node | `iterResults` array → stringified in finish() | Array loses structure |
| Workflow `configure_session` node | String summary + applied object → both in finish() | Mixed |
| Workflow `tool` pass-through | Raw `output: string` from tool executor | No structure preserved |
| Workflow `prompt` node | Raw text string | String, no structure expected |
| Workflow `parameters` node | Human-readable lines.join("\\n") | Structured metadata lost |
| UI `ToolOutput` | Object → JSON.stringify, String → CodeBlock(json) | No structure-aware rendering |
| UI `formatToolPayload` | String passthrough, else JSON.stringify | Same fallback |

### Outlier candidates
- `bash`: stdout/stderr text; not naturally JSON. May never need outputObject.
- `webfetch`: HTML/text content; already has specialized render view.
- `question`: interactive; already has specialized view.
- `delegate`, `reply`: communication tools; return text summaries.
- Filesystem tools (read, write, etc.): return file content paths or text.
- Stream outputs (tool calls with streaming state).

### Investigation required
Implementation must verify this classification by reading every tool's `execute()` return site across `packages/tools/**/*.ts` and update the inventory.

## Scope

The focused goal `structured-node-format-switching` implements the immediate first increment. This umbrella goal tracks the broader scope across all phases.

### Phase 1 — Shared JSON-to-format translator utility *(see structured-node-format-switching)*

1. Create a shared utility (in `packages/workflow/src/format/` or a new shared package) that takes canonical JSON `data` and produces YAML, XML, Markdown, HTML Code, and HTML View projections.
2. Export TypeScript functions: `jsonToYaml(data)`, `jsonToXml(data)`, `jsonToMarkdown(data)`, `jsonToHtml(data)`, `translateAll(data)`.
3. The utility is importable by both the workflow runner (server-side) and the UI (client-side).
4. One-way only: JSON → formats. No parse/inverse functions yet.

### Phase 2 — Structured node output path *(see structured-node-format-switching)*

5. Update `startNodeToolPart.finish()` to accept and store structured output alongside stringified form.
6. Update the session part state type to carry optional structured `outputObject` and `render` fields.
7. Update `workflow_structured` node to pass the parsed object as structured output to `finish()`.
8. Verify that existing session part consumers (UI, agents reading history) continue to work with the stringified fallback.

### Phase 3 — UI format switcher *(see structured-node-format-switching)*

9. Add tab-style format selector: JSON | YAML | XML | Markdown | HTML Code | HTML View.
10. Wire each tab to the corresponding projection from the shared translator utility.
11. HTML View renders the generated HTML in a sandboxed iframe.
12. Preserve all existing specialized views — their custom rendering takes priority over the generic format switcher.
13. Default view is JSON; user selection persists per-session or per-tool-part.

### Phase 4 — Variable and output node format views *(follow-up)*

14. Update `workflow_variable` and `workflow_output` nodes to populate `outputObject` in `finish()` (if not already done in Phase 2).
15. Verify their format switcher works identically to the structured node.

### Phase 5 — Investigation and tool output inventory *(parallel track, does not block Phases 1-4)*

16. Read and document every tool's `execute()` return shape across all `packages/tools/` groups.
17. Classify each tool: JSON/object (structured), string (human-readable), file/stream/outlier.
18. Identify which tools already produce JSON strings and could trivially populate `outputObject`.
19. Map the workflow runner's `finish()` call sites and confirm the dual-path (ctx vs. session part).
20. Map the UI rendering path from session part → `formatToolPayload` → `ToolOutput`.
21. Document outlier rules: which tools cannot produce JSON and why.
22. Update the inventory table in this GOAL with final findings.

### Phase 6 — Canonical envelope finalization *(after investigation feedback)*

23. Finalize the `data` + `render` envelope shape in VISION docs if investigation reveals adjustments.
24. Update `packages/tools/tool.ts` `Tool.Info` execute() return type to include optional `outputObject` and `render` fields.
25. Ensure cross-VISION-doc consistency between workflow and tools packages.

### Phase 7 — Remaining node types

26. Update `workflow_foreach`, `workflow_configure_session`, `workflow_parameters`, `workflow_prompt`, `workflow_decide` nodes to populate the canonical envelope.
27. Update tool pass-through (`workflow_tool` node) to attempt JSON parse of the tool's `output` string and populate `outputObject` on success.

### Phase 8 — Verification

28. Run typecheck on affected packages.
29. Run existing workflow tests to confirm no regressions.
30. Manual or scripted verification: run a workflow with structured/variable/output nodes and inspect session history for `outputObject` presence.
31. Manual verification: format switcher tabs appear and switch correctly for structured/variable/output nodes.
32. Manual verification: specialized views unchanged for question, delegate, todo, session_tree, webfetch, memory_write.

## Out of Scope

- Converting every tool to produce structured JSON — incremental only.
- Removing or changing the `output: string` field — stays for MCP compatibility.
- Changing the MCP wire format or tool.json schema — only additive changes to execute() return.
- Bidirectional parsing/sync from YAML/XML/Markdown/HTML back to JSON.
- Render-layout customization (arrayAs table/card/list, objectAs card/details, titleField, descriptionField, visible fields/order) — tracked as follow-up goal `.projectflows/goals/structured-node-html-render-layout/GOAL.md`.
- Editing `AGENTS.md`, `CONVENTIONS.md`, or other agent/persona files.
- Implementing workflow runtime behavior changes beyond output serialization.
- Changing permission, auth, storage, or session persistence contracts.

## Acceptance Criteria

### A1 — Shared JSON-to-format translator exists
- The utility produces YAML, XML, Markdown, HTML Code, and HTML View from canonical JSON `data`.
- All projections are deterministic and lossless with respect to the source JSON structure.
- The utility is importable from both server-side (workflow runner) and client-side (UI) contexts.

### A2 — Structured node outputs structured data + format views
- `startNodeToolPart.finish()` accepts structured output and stores it in the session part.
- `workflow_structured` node output appears as structured data in session history.
- UI shows tab-style format selector: JSON | YAML | XML | Markdown | HTML Code | HTML View.
- HTML View renders generated HTML in a sandboxed iframe.
- Backward compatible: existing consumers that read only the stringified `output` field continue to work.

### A3 — One-way format projection established
- JSON → YAML, XML, Markdown, HTML Code, HTML View works.
- No parse/inverse functions are required (deferred).
- Markdown and HTML may use tables/cards internally based on data shape, but no user-configurable layout hints.

### A4 — Existing specialized views preserved
- question, delegate, todo, session_tree, webfetch, memory_write tools keep their current rendering.
- Their custom views take priority over the generic format switcher.
- No regression in any existing tool rendering.

### A5 — Tool output inventory classified
- Every tool in `packages/tools/**/*.ts` has its output shape classified.
- The classification table in this GOAL is updated with final findings.
- Outlier rules are documented: which tools cannot produce JSON and why.

### A6 — Canonical envelope defined and typed
- `packages/tools/tool.ts` `Tool.Info` execute() return type has optional `outputObject` and `render` fields.
- `packages/workflow/VISION.md` and `packages/tools/VISION.md` agree on the envelope shape.
- The envelope is type-safe: `outputObject` is `unknown`, `render` is a typed object.
- `render.as` and `render.fields` layout hints are removed from both VISION docs; layout customization is deferred.

### A7 — Verification evidence
- Typecheck passes for all affected packages.
- Existing tests pass.
- A manual or scripted workflow proves:
   1. structured node output includes `outputObject` in session part
   2. UI shows format switcher tabs for the structured node output
   3. HTML View renders in a sandboxed iframe
   4. All format tabs produce correct output matching the source JSON
   5. variable/output nodes show the same format switcher
   6. Specialized views (question, delegate, etc.) remain unchanged
   7. Tools without `outputObject` (e.g. bash) do not show format switcher

### A8 — Umbrella goal tracks remaining work
- The focused sub-goal `structured-node-format-switching` can be executed independently.
- Remaining phases (tool output inventory, remaining node types, envelope finalization) are tracked in this umbrella goal.
- No further product owner approval is needed for Phases 1-4 (format translator + structured node + UI).

## Judgment Rubric

Mark done only if:

- The shared JSON-to-format translator is implemented and produces correct YAML/XML/Markdown/HTML projections.
- Workflow structured node emits structured output that reaches the UI.
- The UI format switcher shows JSON | YAML | XML | Markdown | HTML Code | HTML View tabs.
- HTML View renders in a sandboxed iframe.
- All existing specialized views remain intact.
- Verification shows at least one end-to-end flow with switchable format views.

Continue if:

- Translator works but HTML View iframe sandboxing is incomplete.
- Structured node works but variable/output nodes are not yet updated.
- Inventory is partial (some tools not yet read).
- Envelope is defined but not yet typed in the tool contract.
- UI switcher exists but only for a subset of formats.
- Only one node type (structured) has the format switcher.

Block and ask if:

- Adding `outputObject` to the tool contract breaks existing tool implementations in unexpected ways.
- The session part storage schema cannot accommodate structured data without a migration.
- The UI framework cannot support the format switcher without significant refactoring.
- MCP compatibility requirements conflict with the proposed envelope.

## Implementation Guidance

### Shared JSON-to-format translator
Create a utility (location TBD by implementer — candidate: `packages/workflow/src/format/translator.ts` or a new `packages/format/` package) with functions:

```ts
function dataToJson(data: unknown): string              // JSON.stringify with formatting
function dataToYaml(data: unknown): string               // js-yaml or similar
function dataToXml(data: unknown): string                // generic JSON-to-XML conversion
function dataToMarkdown(data: unknown): string           // arrays of objects → tables
function dataToHtml(data: unknown): string               // styled semantic HTML
```

The `translateAll(data)` convenience function returns an object map:
```ts
{ json: string, yaml: string, xml: string, markdown: string, html: string }
```

Reference architecture: the user's prior AI Markup Translator app used `js-yaml` for YAML, `DOMParser` with cleaned tags for XML, markdown-table rendering for arrays of objects, and styled semantic HTML generation. This code is reference, not source to copy.

### Tool contract change (minimal)
In `packages/tools/tool.ts`, extend the return type:

```ts
execute(args, ctx): Promise<{
  title: string
  metadata: M
  output: string  // unchanged — MCP-compatible
  outputObject?: unknown  // ADD — structured result
  render?: {     // ADD — format/display hints (no layout hints — those are deferred)
    defaultView?: "json" | "auto"
    summary?: string
  }
  attachments?: unknown[]
}>
```

### Runner finish() change
In `packages/workflow/src/runner.ts`, update `startNodeToolPart.finish()` to accept and store:

```ts
async finish(output: unknown, metadata?: Record<string, unknown>, outputObject?: unknown, render?: { defaultView?: string, summary?: string }) {
  // Store stringified output as before
  // Store outputObject and render separately in the session part state
}
```

### Session part state
The session part state object already has `input`, `output`, `metadata` fields. Add optional `outputObject` and `render` fields that the UI reads when present, falling back to `output` for backward compatibility.

### UI format switcher
Create a component like `FormatSwitcher` that:
- Reads `outputObject` from the session part state
- Generates all format projections via the shared translator utility
- Renders tab-style selector: JSON | YAML | XML | Markdown | HTML Code | HTML View
- HTML View renders the HTML string in a sandboxed `<iframe sandbox="allow-scripts">`
- Is wrapped by `ToolOutput` when `outputObject` exists, replacing the current `JSON.stringify` fallback
- Default view is JSON; format tabs are generated from the same `data` object each time

### Preserving specialized views
The `message-row.tsx` dispatch chain (isDelegateTool → isTodoTool → ... → fallback) should check specialized tools FIRST, then fall through to the generic format switcher. This means existing specialized views keep priority.

### Reference architecture notes
The user's prior AI Markup Translator app demonstrated:
- `stripMarkdownWrappers` — cleaning code fences from LLM output
- `jsonToYaml`/`yamlToJson` — using js-yaml
- `jsonToXml`/`xmlToJson` — using cleaned tags and DOMParser
- `jsonToMarkdown`/`markdownToJson` — rendering arrays of objects as markdown tables
- `jsonToHtml`/`htmlToJson` — generating styled semantic HTML/dashboard/table/card layouts
- `translateAll(sourceContent, fromFormat)` — orchestrating source → JSON → all views

This is reference architecture, not source code to copy blindly. The OpenDora implementation should adopt the patterns but use OpenDora's own utility approach and dependencies.

## Risks / Unknowns

- **Session part schema migration**: The session part state is persisted. Adding `outputObject` and `render` fields may need a migration or schema evolution strategy. Check `packages/session` and `packages/storage` for part schema definitions.
- **MCP output contract**: MCP tools/list currently only requires `inputSchema`. Some MCP hosts may not tolerate unknown fields in `outputSchema`. However, MCP's `tools/call` result format is defined by the server, not the client — so adding fields to the execute() return is safe as long as the existing `output: string` is preserved.
- **Streaming output**: Tools with streaming state (input-streaming, partial output) may not have a final structured result at completion time. The envelope must handle the case where `outputObject` is absent or partial.
- **File/attachment outputs**: Tools that produce file attachments (read, webfetch) may have outputObject describing the file metadata rather than the content. The render hints need to distinguish inline data from file references.
- **UI bundle size**: Adding format translator libraries (js-yaml, DOMParser, markdown-table) increases bundle size. Evaluate whether to lazy-load or keep in main bundle.
- **HTML View sandboxing**: Rendering generated HTML in an iframe requires careful sandbox attribute configuration. Generated HTML may contain inline scripts; `allow-scripts` may be needed but `allow-same-origin` must NOT be set to prevent XSS.
- **Dependency choices**: The XML and Markdown projection approaches need implementer judgment — whether to pull libraries or hand-roll simple converters for the common case.
- **Reactivity**: The existing view/code toggle state is managed per-tool via React state in message-row.tsx. The format switcher tabs must follow the same pattern without duplicating state for every tool.
- **Existing tool compliance**: Some tools return JSON.stringify in output but have meaningful structured data that could be outputObject. Others return human-readable prose. The investigation phase must classify each one.
- **Consistency between VISION docs**: Both `packages/workflow/VISION.md` and `packages/tools/VISION.md` now define overlapping concepts. Implementation should keep them in sync and cross-reference each other.
- **Translator utility location**: Not yet decided whether the shared translator lives in `packages/workflow/src/format/`, a new `packages/format/`, or elsewhere. Implementation must resolve this based on import patterns and bundler constraints.

## Verification Expectations

Minimum expected verification:

- `bun run typecheck` (or equivalent) passes for `packages/tools`, `packages/workflow`, `apps/web`.
- Existing unit tests for workflow runner and tools pass.
- The shared translator utility produces correct YAML/XML/Markdown/HTML from sample JSON data.
- A workflow with structured → variable → output nodes is created and run.
- Session history for that workflow is inspected: each node's tool part includes `outputObject` (or equivalent structured data) in addition to string `output`.
- UI shows the format switcher tabs for structured node output when `outputObject` is present.
- Each format tab (JSON/YAML/XML/Markdown/HTML Code) displays the correct projected content.
- HTML View renders the generated HTML in a sandboxed iframe without same-origin access.
- UI does not regress for question, delegate, todo, session_tree, webfetch, memory_write tools.

## Attempts

No attempts yet.

## Do Not Repeat

None yet.

## Verification Log

No verification yet.

## Final Outcome

Pending.

## Ready For Execution

- Status: yes (see structured-node-format-switching for immediate execution)
- Reason: Product intent is confirmed, VISION docs are updated, the focused sub-goal `structured-node-format-switching` is ready for immediate execution, and the umbrella scope tracks remaining phases. Known gaps are documented as risks.
