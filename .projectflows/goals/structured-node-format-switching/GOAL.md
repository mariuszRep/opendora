---
name: structured-node-format-switching
title: Structured Node Format Switching
description: Deliver a shared JSON-to-format translator utility and format-switching UI (JSON/YAML/XML/Markdown/HTML Code/HTML View with sandboxed iframe) for the workflow structured node. First implementation increment of the canonical-json-tool-output-views umbrella goal.
status: ready
type: feature
scope: packages/workflow, apps/web, (shared format utility — location TBD by implementer)
attempt: 0
max_attempts: 5
last_result: none
next_action: Inspect existing workflow structured node implementation, runner finish() serialization, and UI ToolOutput/ToolHeader rendering to determine integration points before writing code.
success_criteria:
  - Shared JSON-to-format translator exists: converts canonical JSON data to YAML, XML, Markdown, HTML Code, and HTML View.
  - Workflow structured node `finish()` stores structured output object alongside stringified form in session parts.
  - Generic UI format switcher renders tab-style selector: JSON | YAML | XML | Markdown | HTML Code | HTML View.
  - HTML View renders generated HTML in a sandboxed iframe (sandbox="allow-scripts" without allow-same-origin).
  - Format switcher works for structured node output in the message/tool-output UI.
  - One-way JSON → all views; bidirectional parsing/sync out of scope.
  - All existing specialized views (question, delegate, todo, session_tree, webfetch, memory_write) preserved and not regressed.
  - Tests or manual verification prove the end-to-end flow with a structured node.
source: derived from canonical-json-tool-output-views umbrella goal
parent_goal: canonical-json-tool-output-views
umbrella: .projectflows/goals/canonical-json-tool-output-views/GOAL.md
---

# Structured Node Format Switching

## Goal

Deliver a shared JSON-to-format translator utility and a tab-based format switcher (JSON, YAML, XML, Markdown, HTML Code, HTML View) for the workflow structured node. This is the first implementation increment of the broader `canonical-json-tool-output-views` umbrella goal. After this goal, users can inspect any structured node output in their preferred format, and the foundation exists for adding format views to other node types and tools.

## Source Requirements

- Structured node output should be inspectable in multiple formats: JSON, YAML, XML, Markdown, HTML Code, HTML View.
- JSON is always the source of truth; all other views are generated projections from canonical JSON data.
- HTML View must render generated HTML in a sandboxed iframe (no same-origin access).
- One-way JSON → all views implemented first. Bidirectional editing/sync is deferred.
- Render-layout customization (card/table/list preferences) is deferred. Markdown and HTML views may naturally use tables/cards internally based on data shape.
- Existing specialized views (question, delegate, todo, session_tree, webfetch, memory_write) must be preserved.
- MCP compatibility must not be broken — `output: string` stays as the human-readable field.

## Problem / Motivation

OpenDora currently renders generic tool and node output as a JSON code block with no format-switching capability. Users must manually copy JSON to external tools if they prefer YAML, XML, Markdown, or HTML. The workflow structured node produces validated JSON objects, but the UI offers no way to view this data in alternative formats. A shared translator utility and format switcher solve this generically — both for the structured node now and for other node types and tools in future increments.

## Vision Alignment

- `packages/workflow/VISION.md § Structured output and format-switchable views`: Defines the canonical output envelope, format views (JSON/YAML/XML/Markdown/HTML), and the shared translator concept.
- `packages/tools/VISION.md § Tool output standardization`: Defines the additive `outputObject` and `render` fields on tool execute() results, preserving `output: string` for MCP compatibility.
- `packages/workflow/VISION.md § Node-as-Tool Standard`: Every workflow node is a first-class tool — the structured node emits `workflow_structured` as a standard tool call with structured output.
- `.projectflows/goals/canonical-json-tool-output-views/GOAL.md`: Umbrella goal covering the broader vision; this goal is the first implementation increment.

Product/non-goal constraints:

- Do NOT change `output: string` — it must remain for MCP compatibility.
- Do NOT break existing specialized UI views (question, delegate, todo, session_tree, webfetch, memory_write).
- Do NOT require all tools or node types to migrate at once — this goal scopes to structured node only.
- Do NOT implement bidirectional parsing/sync — one-way only.
- Do NOT implement render-layout customization (arrayAs, objectAs, titleField, etc.).
- Reference architecture from prior AI Markup Translator app is available but must not be copied blindly — adapt patterns to OpenDora's architecture.

## Convention Constraints

Relevant technical/project constraints:

- Read root `AGENTS.md` before implementation.
- Read `.projectflows/goals/unified-durable-run/GOAL.md` before touching tool or workflow runner state.
- Preserve existing patterns:
  - `packages/tools/tool.ts` `Tool.Info` execute() return shape
  - `packages/workflow/src/runner.ts` `startNodeToolPart` lifecycle
  - `apps/web/components/ai-elements/tool.tsx` `ToolOutput` component
  - `apps/web/app/dashboard/chatbot.tsx` `formatToolPayload` function
  - `apps/web/app/dashboard/message-row.tsx` per-tool view toggle pattern
- New `outputObject` and `render` fields on tool results are additive — existing consumers that read only `output` continue to work.
- The workflow runner's `finish()` method should accept structured output and store both the structured form and stringified form in the session part.
- The shared translator utility must be importable from both server-side (workflow runner) and client-side (UI).

Required stack/patterns:

- TypeScript.
- Existing `packages/tools/tool.ts` `Tool.Info` contract.
- Existing `packages/workflow/src/runner.ts` `startNodeToolPart` pattern.
- Existing `apps/web/components/ai-elements/tool.tsx` rendering pattern.
- Existing `apps/web/components/ui/code-view-toggle.tsx` toggle component (or create new format tab component).
- js-yaml for YAML projection (check existing dependencies).
- No external XML library required — simple recursive JSON-to-XML conversion is sufficient.
- Markdown table generation via string building or lightweight utility.
- HTML generation via string building with semantic elements and inline styles.

Forbidden patterns:

- Do not remove or change the `output: string` field from tool execute() results.
- Do not break MCP wire-format compatibility.
- Do not add a new tool registry or bypass the existing Node-as-Tool standard.
- Do not require per-tool code changes for the format switcher to work — it reads `outputObject` generically.
- Do not use `dangerouslySetInnerHTML` for HTML View — must use sandboxed iframe.
- Do not implement XML or HTML parsing back to JSON — that is deferred bidirectional work.

## Scope

### Phase 1 — Shared JSON-to-format translator

1. Create the translator utility (location TBD: `packages/workflow/src/format/translator.ts` or new `packages/format/` or existing shared package).
2. Implement `dataToJson(data: unknown): string` — JSON.stringify with formatting.
3. Implement `dataToYaml(data: unknown): string` — using js-yaml `dump()`.
4. Implement `dataToXml(data: unknown): string` — recursive JSON-to-XML conversion. Use cleaned tag names (strip non-alphanumeric, lowercase). Handle arrays, objects, primitives.
5. Implement `dataToMarkdown(data: unknown): string` — render arrays of objects as markdown tables (header row derived from object keys). Render single objects as key-value lists. Render primitives as plain text.
6. Implement `dataToHtml(data: unknown): string` — generate semantic HTML with inline styles. Arrays of objects become styled tables. Objects become definition lists or cards. Include responsive viewport-friendly styling.
7. Implement `translateAll(data: unknown): Record<string, string>` — convenience function returning `{ json, yaml, xml, markdown, html }`.
8. Unit tests for each projection function with representative data shapes (object, array of objects, nested, primitive, null, empty).

### Phase 2 — Structured node output path

9. Read existing `startNodeToolPart.finish()` in `packages/workflow/src/runner.ts`. Understand current signature and serialization.
10. Update `finish()` to accept optional `outputObject` and `render` parameters alongside the existing `output`.
11. Store `outputObject` in the session part state (alongside stringified `output`).
12. Update `workflow_structured` node to pass its parsed JSON object as `outputObject` to `finish()`.
13. Verify backward compatibility: existing consumers reading `output` continue to work unchanged.

### Phase 3 — UI format switcher

14. Read existing `ToolOutput` component and understand how it renders tool part state.
15. Create a `FormatSwitcher` component that:
    - Reads `outputObject` from the tool part state.
    - Generates all format projections via the shared translator utility (can call `translateAll` eagerly or lazy-generate per tab).
    - Renders horizontal tabs: JSON | YAML | XML | Markdown | HTML Code | HTML View.
    - Displays the projected content for the selected tab.
    - For HTML View: renders HTML in `<iframe sandbox="allow-scripts">` (NO `allow-same-origin`). Sets `srcdoc` attribute.
16. Integrate `FormatSwitcher` into `ToolOutput`: when `outputObject` is present, show FormatSwitcher instead of the current JSON code block.
17. Ensure existing specialized views (question, delegate, todo, etc.) are checked FIRST in the dispatch chain before falling through to FormatSwitcher.
18. Add the view-toggle capability to `ToolHeader` generically when `outputObject` is present (currently `hasView` is per-tool opt-in).
19. Default view tab selection: JSON. User selection should persist for the session or tool part (simple React state).

### Phase 4 — Verification

20. Run typecheck on affected packages (`packages/workflow`, `apps/web`, and any new package).
21. Run existing workflow runner and tool tests to confirm no regressions.
22. Run unit tests for the translator utility.
23. Manual or scripted verification:
    a. Create a workflow with a structured node that produces sample JSON data.
    b. Run the workflow.
    c. Inspect session history: structured node tool part includes `outputObject`.
    d. UI shows format switcher tabs for the structured node output.
    e. Switch to YAML tab — verify correct YAML projection.
    f. Switch to XML tab — verify correct XML projection.
    g. Switch to Markdown tab — verify correct markdown projection.
    h. Switch to HTML Code tab — verify generated HTML source is displayed.
    i. Switch to HTML View tab — verify HTML renders in sandboxed iframe.
    j. Verify existing specialized views (question, delegate, todo, etc.) render unchanged.
    k. Verify tools without `outputObject` (e.g. bash) do not show format switcher.

## Out of Scope

- Bidirectional parsing/sync from YAML/XML/Markdown/HTML back to JSON.
- Render-layout customization (arrayAs table/card/list, objectAs card/details, titleField, descriptionField, visible fields/order).
- Format switcher for tool types other than the workflow structured node (variable/output/foreach nodes covered in umbrella follow-up).
- Tool output investigation/inventory (tracked in umbrella goal Phase 5).
- Canonical envelope typing in `packages/tools/tool.ts` (tracked in umbrella goal Phase 6).
- Editing `AGENTS.md`, `CONVENTIONS.md`, or other agent/persona files.
- Changing permission, auth, storage, or session persistence contracts.

## Acceptance Criteria

### A1 — Shared translator exists and produces correct output
- `dataToYaml`, `dataToXml`, `dataToMarkdown`, `dataToHtml`, `translateAll` are implemented.
- Each function produces valid output for JSON objects, arrays, primitives, nested structures, null, and empty values.
- Unit tests confirm each projection is correct.

### A2 — Structured node emits outputObject
- `startNodeToolPart.finish()` accepts and stores `outputObject` in the session part.
- `workflow_structured` node passes its parsed JSON object as `outputObject`.
- Backward compatible: existing `output: string` field is still populated and readable.

### A3 — UI format switcher present for structured node
- `ToolOutput` shows tabs JSON | YAML | XML | Markdown | HTML Code | HTML View when `outputObject` is present.
- Each tab displays the correct projected content.
- HTML View renders in `<iframe sandbox="allow-scripts">` using `srcdoc`.
- Tools without `outputObject` do not show the format switcher.

### A4 — Existing specialized views preserved
- question, delegate, todo, session_tree, webfetch, memory_write tools keep their current rendering.
- Their custom views take priority over the generic format switcher.
- No regression in any existing tool rendering.

### A5 — Verification evidence
- Typecheck passes for all affected packages.
- Translator unit tests pass.
- Existing workflow/tool tests pass.
- Manual or scripted proof of end-to-end flow (see Scope Phase 4 step 23).

## Judgment Rubric

Mark done only if:

- The shared translator is implemented and produces correct YAML/XML/Markdown/HTML projections.
- Workflow structured node emits `outputObject` that reaches the UI.
- The UI format switcher shows all six format tabs for structured node output.
- HTML View renders in a sandboxed iframe without same-origin.
- All existing specialized views remain intact.
- Verification shows at least one end-to-end flow with switchable format views.

Continue if:

- Translator works but a specific projection has edge-case bugs (e.g. null handling, deeply nested).
- Structured node works but the format switcher tabs have minor styling issues.
- HTML View iframe sandboxing is functional but could be tightened.
- Only the structured node is covered (variable/output nodes deferred to umbrella).

Block and ask if:

- The translator cannot be located where both server and UI can import it.
- `finish()` signature change breaks existing call sites that cannot be updated.
- The session part schema cannot accommodate `outputObject` without a migration.
- The UI framework cannot support tab-style format switching without significant refactoring.
- js-yaml or other library choice has licensing or bundle-size conflicts.

## Implementation Guidance

### Translator utility

Create `packages/workflow/src/format/translator.ts` (or equivalent). Key implementation notes:

```ts
import { dump } from "js-yaml";

export function dataToYaml(data: unknown): string {
  return dump(data, { indent: 2, lineWidth: -1, noRefs: true });
}

export function dataToXml(data: unknown, rootName = "root"): string {
  // Recursive conversion:
  // - objects → <key>value</key>
  // - arrays → <item>value</item> wrapped in <array>parent</array> or repeated keys
  // - primitives → text content
  // - Clean tag names: lowercase, replace non-alphanumeric with hyphen
}

export function dataToMarkdown(data: unknown): string {
  // Array of uniform objects → markdown table
  // Single object → key-value list
  // Primitive → plain text
  // Nested → recursive with indentation or JSON inline
}

export function dataToHtml(data: unknown): string {
  // Semantic HTML5 with inline styles
  // Arrays of objects → <table> with <thead>/<tbody>
  // Objects → <dl> or <div class="card">
  // Include light/dark mode aware styling via prefers-color-scheme
  // Responsive, viewport-friendly
}

export function translateAll(data: unknown): Record<string, string> {
  return {
    json: dataToJson(data),
    yaml: dataToYaml(data),
    xml: dataToXml(data),
    markdown: dataToMarkdown(data),
    html: dataToHtml(data),
  };
}
```

### Runner finish() change

In `packages/workflow/src/runner.ts`:

```ts
async finish(
  output: unknown,
  metadata?: Record<string, unknown>,
  outputObject?: unknown,
  render?: { defaultView?: string; summary?: string }
) {
  // Current behavior preserved for output string
  // Store outputObject and render alongside existing fields
  this.state = {
    ...this.state,
    output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
    metadata,
    outputObject,
    render,
  };
}
```

### UI FormatSwitcher component

```tsx
function FormatSwitcher({ data }: { data: unknown }) {
  const formats = useMemo(() => translateAll(data), [data]);
  const [activeTab, setActiveTab] = useState("json");
  // Tabs: JSON | YAML | XML | Markdown | HTML Code | HTML View
  // For HTML View: <iframe sandbox="allow-scripts" srcdoc={formats.html} />
  // For others: <pre><code>{formats[activeTab]}</code></pre>
}
```

### HTML View sandboxing

```tsx
<iframe
  sandbox="allow-scripts"
  srcdoc={formats.html}
  title="HTML View"
  style={{ width: "100%", border: "none" }}
/>
```

Key security constraint: `allow-scripts` is permitted so generated HTML with interactive elements works, but `allow-same-origin` must NOT be set to prevent XSS access to the parent page's DOM and cookies.

### Preserving specialized views

The dispatch order in `message-row.tsx`:
1. Check specialized tools (question, delegate, todo, session_tree, webfetch, memory_write) — render custom component.
2. Fall through to generic FormatSwitcher (when `outputObject` is present).
3. Final fallback: JSON code block (when no `outputObject`).

## Risks / Unknowns

- **Translator location**: Not yet decided whether the shared translator lives in `packages/workflow/src/format/`, a new `packages/format/`, or elsewhere. Implementation must resolve based on import patterns and bundler constraints.
- **js-yaml ESM/CJS compatibility**: Verify that js-yaml works with the project's bundler (likely Bun/webpack).
- **XML projection design**: No standard JSON-to-XML mapping exists. The implementation must define a reasonable convention (tag names, array handling, attributes vs elements).
- **HTML View styling**: Generated HTML needs to look reasonable in both light and dark modes. Inline styles only (no external CSS).
- **Session part schema**: Adding `outputObject` to session part state may require schema evolution in `packages/session` or `packages/storage`.
- **Bundle size**: Adding js-yaml increases bundle size. Evaluate tree-shaking and code-splitting options.

## Verification Expectations

Minimum expected verification:

- `bun run typecheck` passes for `packages/workflow`, `apps/web`.
- Existing unit tests for workflow runner and tools pass.
- Translator unit tests pass for all format projections with representative data shapes.
- A workflow with a structured node is created and run manually or via script.
- Session part for the structured node includes `outputObject`.
- UI shows format switcher tabs for the structured node output.
- Each format tab displays correct content.
- HTML View renders in sandboxed iframe.
- Specialized views unchanged.

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
- Reason: Product intent is confirmed, VISION docs are updated with format views and deferred items, the umbrella goal tracks broader work, scope is bounded to shared translator + structured node + UI format switcher, acceptance criteria are concrete, implementation guidance covers key technical decisions, and risks are documented.
