---
name: structured-node-html-render-layout
title: Structured Node HTML Render Layout
description: Add display/render configuration to the workflow structured node so users can control how JSON data renders as HTML — array layout (table/cards/list), object layout (card/details), and field-role mappings (title, description, status, image, metadata, actions) — preserving JSON source of truth and outputSchema separation.
status: draft
type: feature
scope: packages/workflow, apps/web, (shared format translator utility — location established by phase 1)
attempt: 0
max_attempts: 5
last_result: none
next_action: Inspect phase 1 (structured-node-format-switching) implementation status to determine integration points before writing code.
success_criteria:
  - Structured node carries optional renderLayout configuration in its definition, separate from outputSchema.
  - Editor UI exposes renderLayout controls for the structured node when editing a workflow.
  - Shared format translator `dataToHtml()` accepts an optional renderLayout parameter and applies layout controls for arrays and objects.
  - HTML Code and HTML View both use the same generated HTML (translator produces one HTML string).
  - Sandboxed iframe is used for HTML View (unchanged from phase 1).
  - JSON/YAML/XML/Markdown outputs are unaffected by renderLayout configuration.
  - Structured nodes without renderLayout produce identical output to phase 1 default/auto rendering.
  - Verification proves an array-of-objects rendered as table and as cards, with title/description field mapping.
source: derived from canonical-json-tool-output-views umbrella goal and user product direction
parent_goal: canonical-json-tool-output-views
depends_on: .projectflows/goals/structured-node-format-switching/GOAL.md
sequenced_after: structured-node-format-switching
predecessor: structured-node-format-switching
---

# Structured Node HTML Render Layout

## Goal

Add a configurable display/render layer to the workflow structured node so that when its JSON output is projected into HTML Code or HTML View, users control how arrays and objects are visually arranged — tables, cards, lists, detail views — with field-role mappings (title, description, status, image, metadata, actions). This is phase 2 after the initial format-switching infrastructure (phase 1: `structured-node-format-switching`). The canonical `outputSchema` and JSON source of truth are not changed; this goal only adds a layout-configuration layer on top.

## Source Requirements

- Structured node editors should offer controls for HTML render layout preferences.
- `outputSchema` remains the canonical data-shape definition. Render-layout configuration is a separate, optional property on the node definition.
- HTML Code and HTML View must produce identical generated HTML for a given data + renderLayout combination.
- Sandboxed iframe remains required for HTML View (no `allow-same-origin`).
- JSON, YAML, XML, Markdown projections are unaffected by renderLayout — they continue to render the canonical data directly.
- Default behavior (no renderLayout configured) must match phase 1 auto-rendering exactly.
- Field-role mappings (titleField, descriptionField, etc.) apply in card/detail layouts and are ignored when arrayAs="table".
- Refer to the AI Markup Translator app as product reference for card/table/list visual patterns, not as source code to copy.

## Problem / Motivation

Phase 1 (`structured-node-format-switching`) delivers a shared translator that projects JSON data into six formats including HTML Code and HTML View. However, the HTML projection is fully automatic — arrays of objects always render as tables, single objects always render as definition lists or cards. Users cannot control this presentation. When a structured node produces an array of user objects, the user may want to see them as visual cards (with avatar, name, status badge) rather than a table row. Or when a structured node returns a single deeply nested object, the user may want a detail-view layout with specific fields promoted to headings and descriptions.

This goal adds that control without changing the underlying JSON data or outputSchema. The renderLayout configuration lives alongside the node definition, separate from the schema, and the shared translator utility uses it to produce richer, user-directed HTML projections.

## Vision Alignment

- `packages/workflow/VISION.md § Phase 2: Render layout customization`: Explicitly describes the structured node renderLayout config, field-role mappings, and constraints.
- `packages/workflow/VISION.md § Structured output and format-switchable views`: Defines the canonical output envelope and the shared translator concept established in phase 1.
- `.projectflows/goals/structured-node-format-switching/GOAL.md`: Phase 1 — shared translator, structured node outputObject, UI format switcher. This goal (phase 2) builds directly on that foundation.
- `.projectflows/goals/canonical-json-tool-output-views/GOAL.md`: Umbrella goal tracking the full canonical-output vision. This goal is a follow-up increment.

Product/non-goal constraints:

- Do NOT change `output: string` — it must remain for MCP compatibility.
- Do NOT modify `outputSchema` — it defines the canonical data shape, not display.
- Do NOT break phase-1 format switcher or existing specialized views.
- Do NOT implement bidirectional HTML editing back to JSON.
- Do NOT require renderLayout support for all tools — scoped to workflow structured node only.
- Do NOT build a full design-system/theme builder — only minimal useful controls (layout choices + field mapping).

## Convention Constraints

Relevant technical/project constraints:

- Read root `AGENTS.md` before implementation.
- Read root `MIGRATION.md` before touching tool or workflow runner state.
- Read `.projectflows/goals/structured-node-format-switching/GOAL.md` to understand phase-1 integration points.
- Preserve existing patterns established in phase 1:
  - Shared translator location and function signature pattern.
  - `startNodeToolPart.finish()` outputObject pattern.
  - `FormatSwitcher` component pattern.
  - HTML View sandboxed iframe pattern.
- The `renderLayout` configuration is node-level metadata stored alongside `parameters`, not part of the output envelope or session part.
- The translator's `dataToHtml()` function must accept an optional layout config parameter without changing its return type for callers that do not pass it.
- Field-role mapping values are JSON field-name strings (dot-path or simple key) that the translator uses to extract values from the data object.

Required stack/patterns:

- TypeScript.
- Phase-1 shared translator utility (location established by phase 1).
- Phase-1 FormatSwitcher component.
- Existing `packages/workflow/src/runner.ts` structured node execution pattern.

Forbidden patterns:

- Do not embed renderLayout in outputSchema definitions.
- Do not use `dangerouslySetInnerHTML` — HTML View must use sandboxed iframe.
- Do not change the data flow for JSON/YAML/XML/Markdown projections.
- Do not add MCP-incompatible fields to tool.execute() return — renderLayout is node metadata, not tool output.
- Do not implement bidirectional HTML-to-JSON editing.

## Scope

### Phase 0 — Investigate phase 1 implementation status

1. Inspect phase 1 (`structured-node-format-switching`) implementation — verify what was actually delivered.
2. Confirm shared translator utility location, `dataToHtml()` signature, and whether it already accepts optional layout parameters.
3. Confirm structured node type definition location and patterns in `packages/workflow/src/`.
4. Confirm `FormatSwitcher` component location and how it invokes the translator.
5. Document integration points and any phase-1 gaps that affect this goal.

### Phase 1 — Define node data shape for renderLayout

6. Define TypeScript types for `RenderLayoutConfig`:
   ```ts
   type RenderLayoutConfig = {
     arrayAs?: "auto" | "table" | "cards" | "list";
     objectAs?: "auto" | "card" | "details";
     titleField?: string;
     descriptionField?: string;
     statusField?: string;
     imageField?: string;
     iconField?: string;
     metadataFields?: string[];
     actions?: string[];
     visibleFields?: string[];
     fieldOrder?: string[];
   };
   ```
7. Add `renderLayout?: RenderLayoutConfig` to the structured node definition type in `packages/workflow/src/` — as an optional field on node parameters, separate from `outputSchema`.
8. Ensure backward compatibility: nodes without `renderLayout` are valid and produce default behavior.
9. Update workflow schema/validation to accept the new optional field without breaking existing workflow definitions.

### Phase 2 — Extend shared translator to honor renderLayout

10. Update `dataToHtml()` (or create `dataToHtml(data, renderLayout?)`) in the shared translator utility to accept an optional `RenderLayoutConfig`.
11. When `renderLayout` is absent or `arrayAs: "auto"` / `objectAs: "auto"`, behavior must match current phase-1 default (table for arrays of objects, cards for objects, etc.).
12. Implement `arrayAs: "table"` — existing phase-1 default table layout (styled `<table>` with `<thead>`/`<tbody>`).
13. Implement `arrayAs: "cards"` — each array element renders as a visual card (`<div class="card">`) with field-role mappings:
    - `titleField` value → card heading (`<h3>`)
    - `descriptionField` value → card body (`<p>`)
    - `statusField` value → status badge (`<span class="badge">`)
    - `imageField` / `iconField` value → `<img>` or icon element
    - `metadataFields` → additional fields rendered as key-value rows
    - `actions` → action links/buttons rendered at card bottom
    - Other fields rendered according to `visibleFields`/`fieldOrder`
14. Implement `arrayAs: "list"` — each array element renders as a compact list item with title and summary.
15. Implement `objectAs: "card"` — single object displayed as a card (same field-role pattern as array cards).
16. Implement `objectAs: "details"` — single object displayed as a detail view with prominent title, description, metadata sections, and field-role mappings.
17. When no field-role mappings are provided but `arrayAs: "cards"` or `objectAs: "card"` is selected, generate reasonable defaults (first string field as title, second as description, remaining as metadata).
18. Ensure `visibleFields` and `fieldOrder` work across all layout modes. When `visibleFields` is set, only those fields render. When `fieldOrder` is set, display in declared order.
19. Generated HTML must include inline styles for card/list/detail visual modes (light/dark mode aware via `prefers-color-scheme`, same pattern as phase 1).

### Phase 3 — Structured node editor controls for renderLayout

20. Add editor UI in `apps/web/` (likely in the workflow editor canvas or structured-node configuration panel) for renderLayout controls:
    - Array layout selector: auto / table / cards / list
    - Object layout selector: auto / card / details
    - Field-role mapping inputs: title, description, status, image, icon, metadata fields (multi-select or tag input), actions
    - `visibleFields` multi-select or tag input (derived from outputSchema fields)
    - `fieldOrder` drag-to-reorder list (derived from outputSchema fields)
21. Controls should be collapsible/category-grouped so the panel is not overwhelming.
22. When no `outputSchema` fields are known (freeform schema), provide text inputs for field names instead of derived selectors.
23. The editor must serialize the configuration into the structured node definition as `renderLayout` in the workflow JSON.
24. Ensure the editor layout controls do not regress when `outputSchema` is absent or freeform (the structured node allows arbitrary JSON output).

### Phase 4 — Unify HTML Code and HTML View

25. Confirm that HTML Code and HTML View both invoke the same `dataToHtml()` call with the same renderLayout config.
26. HTML Code tab displays the generated HTML source string (syntax-highlighted in a `<pre><code>` block).
27. HTML View tab renders the identical HTML string in a sandboxed iframe.
28. Verify that switching between HTML Code and HTML View tabs shows the same underlying HTML (code tab shows source, view tab renders it).
29. Ensure backward compatibility with phase 1: the FormatSwitcher component's tab selection and rendering flow are preserved.

### Phase 5 — Verification

30. Run typecheck on affected packages (`packages/workflow`, `apps/web`).
31. Run existing phase-1 unit tests for the shared translator to confirm no regressions.
32. Write new unit tests for `dataToHtml()` with `renderLayout`: table layout, cards layout, list layout, card-with-field-mappings, detail view, default/auto fallback, missing fields, nested data.
33. Test backward compatibility: existing workflows without `renderLayout` produce identical output.
34. Manual or scripted verification:
    a. Open a workflow with a structured node that produces an array of objects (e.g., users with id, name, email, role, avatar).
    b. Configure renderLayout: `arrayAs: "table"`. Run the workflow. Verify HTML Code and HTML View show table layout.
    c. Switch renderLayout to `arrayAs: "cards"` with `titleField: "name"`, `descriptionField: "email"`, `statusField: "role"`. Run. Verify cards with headings, descriptions, status badges.
    d. Switch renderLayout to `arrayAs: "list"`. Run. Verify compact list layout.
    e. Test with a single object output: `objectAs: "card"` with field mappings. Verify card layout.
    f. Test `objectAs: "details"`. Verify detail view with sections.
    g. Verify JSON/YAML/XML/Markdown tabs are unaffected by renderLayout changes.
    h. Verify the sandboxed iframe is used for HTML View.
    i. Verify structured node without renderLayout matches phase-1 default output.
35. Confirm no regressions in existing specialized views (question, delegate, todo, session_tree, webfetch, memory_write).

## Out of Scope

- Bidirectional HTML editing back to JSON (deferred, no timeline).
- Changing `outputSchema` or the canonical data shape — renderLayout is purely a display/hint layer.
- Making tools other than the workflow structured node support renderLayout (future phase, not planned).
- Full design-system/theme builder (color palettes, typography, spacing, brand customization) — this goal delivers minimal useful layout controls.
- Bidirectional editing/sync of any format.
- Changing the sandboxed iframe security model (remains `allow-scripts` without `allow-same-origin`).
- Render-layout controls for JSON/YAML/XML/Markdown views — these are structural/code representations, not visual projections.
- Translating renderLayout to other output formats (only HTML Code and HTML View are affected).
- Changes to `output: string`, MCP compatibility, or tool.execute() contract.

## Acceptance Criteria

### A1 — renderLayout config exists on structured node definition
- TypeScript types define `RenderLayoutConfig` with all documented fields (arrayAs, objectAs, field-role mappings, visibleFields, fieldOrder).
- Optional `renderLayout` field exists on the structured node parameters type, separate from `outputSchema`.
- Workflows without `renderLayout` are valid and produce identical output to phase 1 default behavior.

### A2 — Shared translator honors renderLayout
- `dataToHtml()` accepts optional `RenderLayoutConfig` parameter.
- `arrayAs: "table"` produces styled HTML table (same as phase-1 default).
- `arrayAs: "cards"` produces card-per-element HTML with field-role mappings applied.
- `arrayAs: "list"` produces compact list HTML.
- `objectAs: "card"` and `objectAs: "details"` produce appropriate single-object layouts.
- Field-role mappings (titleField, descriptionField, statusField, etc.) correctly extract named fields.
- `visibleFields` and `fieldOrder` filter and reorder displayed fields.
- Without renderLayout or with `"auto"` values, output matches phase-1 default.

### A3 — Editor controls for renderLayout
- Workflow structured node editor panel includes renderLayout controls.
- Controls include layout selectors, field-role inputs, and visibleFields/fieldOrder editors.
- Config serializes into the workflow definition as `renderLayout`.
- Controls degrade gracefully when outputSchema is freeform/absent.

### A4 — HTML Code and HTML View use the same HTML
- Both tabs invoke the same `dataToHtml()` with the same renderLayout.
- HTML Code shows generated source; HTML View renders identical HTML in sandboxed iframe.
- Switching tabs confirms content consistency.

### A5 — Other format views unaffected
- JSON, YAML, XML, Markdown projections do not use or respond to renderLayout.
- Their output is identical with or without renderLayout configuration.

### A6 — Backward compatibility
- Existing workflows without renderLayout produce identical output to pre-phase-2 behavior.
- Existing phase-1 format switcher and specialized views are preserved.
- No regressions in the sandboxed iframe security model.

### A7 — Verification evidence
- Typecheck passes for `packages/workflow` and `apps/web`.
- Translator unit tests pass for all layout modes with representative data shapes.
- Manual or scripted proof of end-to-end flow with at least:
  - Array-of-objects rendered as cards with title/description field mapping.
  - Array-of-objects rendered as table.
  - Single object rendered as card with field mapping.
  - No-renderLayout fallback producing identical output to phase 1.
  - JSON/YAML/XML/Markdown tabs unaffected.

## Judgment Rubric

Mark done only if:

- The structured node definition carries optional `renderLayout` separate from `outputSchema`.
- The shared translator `dataToHtml()` applies renderLayout controls for arrays and objects.
- Editor UI exposes renderLayout controls in the structured node configuration panel.
- HTML Code and HTML View use identical HTML produced by the same translator call.
- Verification shows array-of-objects rendered as cards with title/description field mapping.
- All JSON/YAML/XML/Markdown projections remain unchanged.
- No-renderLayout workflows produce identical output to phase 1 defaults.

Continue if:

- Translator works but a specific layout mode has minor styling issues (e.g., card spacing).
- Editor UI layout controls exist but have UX rough edges (e.g., no drag-to-reorder for fieldOrder).
- Field-role mapping works but edge cases (missing fields, deep dot-path keys) have minor bugs.
- Only the structured node is covered (other node types deferred).
- `visibleFields`/`fieldOrder` work for table and cards but not every edge case.

Block and ask if:

- The structured node definition cannot accommodate an additional `renderLayout` field without a breaking schema change.
- The shared translator cannot accept an optional layout parameter without breaking phase-1 callers.
- The editor UI framework cannot support the layout controls without significant refactoring.
- Phase 1 (`structured-node-format-switching`) is not yet implemented or its translator location/signature is not yet settled.
- Adding field-role mapping requires changes to `outputSchema` or the canonical data shape.

## Implementation Guidance

### Data shape location

Add `RenderLayoutConfig` type and `renderLayout` field to the structured node definition type. Currently structured node parameters likely live in `packages/workflow/src/` — search for existing structured node type definitions.

```ts
// In structured node type definition file
type RenderLayoutConfig = {
  arrayAs?: "auto" | "table" | "cards" | "list";
  objectAs?: "auto" | "card" | "details";
  titleField?: string;
  descriptionField?: string;
  statusField?: string;
  imageField?: string;
  iconField?: string;
  metadataFields?: string[];
  actions?: string[];
  visibleFields?: string[];
  fieldOrder?: string[];
};

// Extended structured node parameters
type StructuredNodeParams = {
  outputSchema?: Record<string, unknown>;
  renderLayout?: RenderLayoutConfig; // new, optional
  // ... existing fields
};
```

### Translator changes

In the shared translator (location established by phase 1 — likely `packages/workflow/src/format/translator.ts` or `packages/format/`):

```ts
function dataToHtml(data: unknown, renderLayout?: RenderLayoutConfig): string {
  if (!renderLayout || renderLayout.arrayAs === "auto" || renderLayout.arrayAs === undefined) {
    return defaultHtmlProjection(data); // phase-1 behavior
  }
  // Route based on renderLayout configuration
  if (Array.isArray(data)) {
    switch (renderLayout.arrayAs) {
      case "table": return arrayToTableHtml(data, renderLayout);
      case "cards": return arrayToCardsHtml(data, renderLayout);
      case "list":  return arrayToListHtml(data, renderLayout);
      default:      return defaultHtmlProjection(data);
    }
  }
  if (typeof data === "object" && data !== null) {
    switch (renderLayout.objectAs) {
      case "card":    return objectToCardHtml(data, renderLayout);
      case "details": return objectToDetailsHtml(data, renderLayout);
      default:        return defaultHtmlProjection(data);
    }
  }
  return defaultHtmlProjection(data);
}

// Helper: extract a field value from an object by dot-path or simple key
function resolveField(obj: Record<string, unknown>, fieldPath: string): unknown {
  return fieldPath.split(".").reduce((acc, key) => 
    acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined, obj);
}
```

### Card HTML structure (arrayAs: "cards")

```html
<div class="cards-container">
  <div class="card">
    <div class="card-image"><img src="{imageField}" alt="" /></div>
    <div class="card-header">
      <h3>{titleField}</h3>
      <span class="badge">{statusField}</span>
    </div>
    <div class="card-body"><p>{descriptionField}</p></div>
    <div class="card-metadata">
      {metadataFields.map(f => `<div><strong>${f}:</strong> ${value}</div>`)}
    </div>
    <div class="card-actions">
      {actions.map(a => `<a href="${value}">${a}</a>`)}
    </div>
  </div>
</div>
```

### Table HTML structure (arrayAs: "table")

Same as phase-1 default table, but when `visibleFields`/`fieldOrder` are set, the table columns are filtered/ordered accordingly.

### Field-role defaults

When `arrayAs: "cards"` is selected but no field-role mappings are provided:
- First string field → title
- Second string field → description
- All remaining fields → metadata

### Editor UI pattern

The editor controls should follow the existing workflow editor patterns in `apps/web/`. The structured node's configuration panel likely already exists for `outputSchema` editing. Add a collapsible "Render Layout" section with:

1. "Array display" dropdown: auto / table / cards / list
2. "Object display" dropdown: auto / card / details (shown when relevant)
3. "Field mapping" sub-section (collapsible, shown when cards or details selected):
   - Title field: text input or field selector
   - Description field: text input or field selector
   - Status field: text input or field selector
   - Image field: text input or field selector
   - Icon field: text input or field selector
   - Metadata fields: multi-tag input
   - Actions: multi-tag input
4. "Field visibility" sub-section (collapsible):
   - Visible fields: multi-tag input or field selectors
   - Field order: ordered list with reorder controls

The field selectors should derive available fields from `outputSchema` when present, falling back to freeform text inputs.

## Risks / Unknowns

- **Phase 1 implementation status**: This goal cannot start until phase 1 (`structured-node-format-switching`) is implemented. The translator location, `dataToHtml()` signature, structured node type location, and FormatSwitcher integration points are all established by phase 1.
- **outputSchema access in editor**: The editor needs access to `outputSchema` fields to derive field selectors. If `outputSchema` is absent/freeform, text inputs are needed as fallback.
- **Dot-path field resolution**: Field-role mappings may need to support nested field paths (e.g., `user.profile.name`). The initial implementation can start with simple top-level keys and add dot-path support as needed.
- **Card/list styling**: Generated HTML with inline styles needs to look reasonable in both light and dark modes. Reference the phase-1 style approach for consistency.
- **Translator signature stability**: If phase 1 defined `dataToHtml(data: unknown): string`, adding an optional parameter maintains backward compatibility. If phase 1 used a different signature, adjust accordingly.
- **Editor bundle size**: Adding field-role mapping controls should not significantly increase bundle size. Use existing UI primitives from `apps/web/components/ui/`.

## Verification Expectations

Minimum expected verification:

- `bun run typecheck` passes for `packages/workflow`, `apps/web`.
- Existing translator unit tests pass (no regression from phase 1).
- New translator unit tests pass for renderLayout modes:
  - arrayAs: "table" with visibleFields/fieldOrder
  - arrayAs: "cards" with titleField, descriptionField, statusField
  - arrayAs: "list"
  - objectAs: "card" with field mappings
  - objectAs: "details"
  - No renderLayout → identical to phase-1 default
- Manual verification with a workflow structured node:
  1. Array of objects renders as cards with title/description/status fields mapped
  2. Same array renders as table
  3. Same array renders as list
  4. Single object renders as card with field mappings
  5. HTML Code shows generated HTML source; HTML View renders identical HTML in sandboxed iframe
  6. JSON/YAML/XML/Markdown tabs show identical output regardless of renderLayout
  7. Structured node without renderLayout matches phase-1 default output
- Existing specialized views (question, delegate, todo, session_tree, webfetch, memory_write) are not regressed.

## Attempts

No attempts yet.

## Do Not Repeat

None yet.

## Verification Log

No verification yet.

## Final Outcome

Pending.

## Ready For Execution

- Status: no — depends on phase 1 (`structured-node-format-switching`) implementation
- Reason: This goal directly depends on the shared translator utility, structured node outputObject pattern, and FormatSwitcher UI established in phase 1. It cannot be executed until `.projectflows/goals/structured-node-format-switching/GOAL.md` is complete.
