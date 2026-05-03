---
name: tool-curator
description: DEPRECATED. Use tool-meta-ops instead for tool-metadata updates. This skill is kept for backward compatibility only.
---

# Tool Curator (Deprecated)

**This skill has been replaced by `tool-meta-ops`.**

Load `tool-meta-ops` for all tool-metadata, tool-description, and parameter-description tasks.

## Migration

All functionality has been migrated to:
- **tool-meta-ops** — manages tool top-level descriptions and parameter descriptions

Please update any references to use `tool-meta-ops` instead.

## No-Regression Rule

- Preserve the intent and important detail of the existing description unless the change explicitly requires a rewrite.
- Prefer additive clarification over deletion.
- Never change tool name, parameter types, required fields, or schema structure — this skill governs descriptions only.
- If a description must change in meaning (not just wording), state the old text, the new text, and why the change is correct before writing.

## Variables

- `{{tool_name}}` — exact tool id (e.g. `delegate`, `session_search`)
- `{{problem}}` — what is wrong with the current metadata (mis-selection, unclear parameter, missing trigger, stale wording, etc.)
- `{{evidence}}` — optional: session id or quote showing the misuse

---

## Scope

Allowed:
- Update the top-level tool description (what an agent reads when choosing a tool).
- Update per-parameter descriptions (what an agent reads when filling parameters).

Not allowed via this skill:
- Renaming tools, changing parameter names or types, adding/removing parameters, changing the required list, or any structural schema change.
- Creating or deleting tools.

If the need falls outside the allowed scope, stop and route the request as a tool-development requirement instead.

---

## Objective

Produce tool descriptions that:
- State clearly **when** an agent should pick the tool (trigger condition).
- State clearly **what** the tool returns or changes (outcome).
- Distinguish the tool from neighbouring tools that solve adjacent problems.
- Give each parameter a single-sentence description that names the value, its format, and any constraint.

---

## Steps

1. **Discover** — call `tool_list` (optionally with `query` or `group`) to confirm the tool exists and to scan neighbours that might be confused with it.
2. **Inspect** — call `tool_get` with the exact `name`. Read the full description, every parameter description, and the `agents using this tool` cross-reference. The agent list is the blast radius for any change.
3. **Diagnose** — based on `{{problem}}` and `{{evidence}}`, decide which fields are wrong:
   - top-level description (selection problem),
   - one or more parameter descriptions (filling problem),
   - both.
4. **Compare with neighbours** — if mis-selection is the issue, read the related tools surfaced by `tool_list` and make sure the new wording draws a clear boundary against them.
5. **Draft** — write the new text following the Quality Bar below. Keep the structure of the existing description when possible.
6. **Confirm impact** — re-state which agents use the tool (from step 2) so the human approving the change sees the blast radius.
7. **Apply** — call `tool_update` with `name` plus only the fields that changed: `description` and/or `parameter_descriptions`. Send only parameter keys that genuinely change.
8. **Verify** — call `tool_get` again and confirm the new text is in place and the schema is unchanged.
9. **Report** — summarise what changed, which agents are affected, and what behavior should improve.

---

## Quality Bar

Top-level description:
- First line: a single sentence stating the action and the trigger condition.
- Then: what is returned or what side effect happens.
- Then: when **not** to use the tool, or which sibling tool to prefer instead, when relevant.
- No agent names. No model names. No session-specific context.

Parameter descriptions:
- One sentence each.
- Name the value (`session id`, `glob pattern`, `tool name`, etc.), the expected format, and any constraint (`exact match`, `optional`, `case-sensitive`).
- Avoid restating the type already present in the schema.
- Give one short example only when the format is non-obvious.

---

## Rules

- Always run `tool_get` before `tool_update`. Never edit blind.
- Update one tool per session unless the human explicitly asks for a batch.
- Send only the fields that actually change in `tool_update` — do not resend identical text.
- Treat the cross-referenced agent list as a change-impact statement; mention it in the final report.
- Stop and escalate as a tool-development request if the fix needs schema, behavior, or runtime changes.
- Do not invent capabilities the tool does not implement; descriptions must match observable behavior.
