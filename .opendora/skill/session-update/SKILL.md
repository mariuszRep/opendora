---
name: session-update
description: Add or update usage guidance for the session_update tool in skill instructions
---

# Session Update Skill

Use this skill when you need to add usage guidance for the session_update tool to a skill that uses it, or when the existing guidance needs improvement.

## Variables

- `{{target_skill}}` — the skill name that needs session_update guidance added or updated
- `{{existing_content}}` — any existing guidance text (if improving an existing skill)

---

## About session_update Tool

The `session_update` tool modifies existing session metadata.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `session_id` | Yes | ID of the session to update |
| `title` | No | New title for the session |
| `agent_id` | No | New agent ID to assign |
| `parent_session_id` | No | New parent session ID |
| `status` | No | New status: `active`, `archived`, or `closed` |

### Behavior

- At least one of title, agent_id, parent_session_id, or status must be provided.
- Title-only updates use `session_rename` permission.
- Agent, parent, or status changes use `session_update` permission and are flagged as risky.
- If the requested value matches the current value, no mutation occurs (returns `unchanged: true`).
- Agent assignments validate that the agent exists.
- Parent session assignment does NOT validate the parent exists.

### Returns

The tool returns a JSON object with:
- `session` — the updated session fields
- `changes` — object with old/new values for each changed field
- `metadata.unchanged` — true if no actual changes were made

---

## Steps

1. **Identify target** — Determine which skill needs the session_update guidance added or updated.
2. **Check existing** — Read the target skill's SKILL.md to see if session_update guidance already exists.
3. **Add guidance** — If missing, add a section following the pattern below.
4. **Update guidance** — If existing guidance is outdated or incorrect, revise to match current behavior.
5. **Verify** — Confirm the guidance accurately reflects the tool parameters and behavior above.

---

## Guidance Template

When adding session_update guidance to any skill, use this template:

```markdown
### session_update Tool Usage

The `session_update` tool modifies session metadata. Use it when you need to:
- Rename a session (title)
- Reassign the agent (agent_id)
- Change the parent session (parent_session_id)
- Change session status (status)

Parameters:
- `session_id` (required): ID of the session to update
- `title` (optional): New session title
- `agent_id` (optional): New agent ID to assign
- `parent_session_id` (optional): New parent session ID
- `status` (optional): One of `active`, `archived`, `closed`

Notes:
- At least one update field must be provided.
- Title-only changes require `session_rename` permission.
- Agent, parent, or status changes require `session_update` permission (risky operation).
- No mutation occurs if the requested value equals the current value.
- Agent assignments validate the agent exists; parent session assignments do not.
```

---

## Rules

- Only add or update guidance within existing skills — do not create new skills unless explicitly requested.
- Preserve existing skill workflow and structure; session_update guidance should not dominate the skill.
- If the target skill already has session_update guidance, compare it against current behavior and correct inaccuracies.
- Do not change tool metadata (descriptions, schemas) through this skill — use tool-curator for that.