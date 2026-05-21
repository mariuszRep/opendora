---
name: manage-session
description: Manage OpenDora sessions end-to-end. Load this when you need to find, inspect, organize, create via delegation, rename, reassign, reparent, archive, close, or reactivate sessions.
origin: opendora
---

# Session Management

Use this skill when session structure or lifecycle needs deliberate management rather than a one-off message reply.

## Objective

Keep sessions discoverable, correctly owned, correctly nested, and in the right lifecycle state without mutating conversation content.

## Tools In Scope

- `session_search` - find sessions by title, id, status, type, owner, directory, or root status.
- `session_get` - inspect a specific session's metadata and conversation history when search results are not enough.
- `session_tree` - understand ancestors, descendants, and delegation hierarchy before reorganizing sessions.
- `session_update` - mutate session metadata: title, agent assignment, parent session, or status.
- `delegate` - create or continue a session only when the user asks to start/continue agent work; do not use it as a substitute for direct session metadata management.
- `question` - ask the human only when a requested mutation is ambiguous, destructive, or could hide important work.

## Workflow

1. Classify the session task:
   - discover or inspect sessions
   - create or continue a delegated session
   - rename or retitle a session
   - reassign the owning agent
   - change parent/child organization
   - archive, close, or reactivate a session
2. Read current state before mutation:
   - Use `session_search` when finding candidate sessions or validating ids.
   - Use `session_get` when message history or detailed context matters.
   - Use `session_tree` before parent changes or when hierarchy matters.
3. Apply the smallest safe change:
   - Use `session_update` for title, agent, parent, or status changes.
   - Update multiple fields in one call only when they belong to the same intended organization change.
   - If the requested value already matches current state, treat the no-op response as success.
4. Verify after mutation:
   - Confirm the returned session fields match the request.
   - Re-check tree/search state when parent, owner, or status changes affect organization.
5. Report the result:
   - State what changed, what stayed unchanged, and any session ids needed for follow-up.

## Rules

- Do not use `session_update` to edit messages; it only changes metadata.
- Validate target sessions before risky updates when the id or intent is uncertain.
- Agent reassignment requires an existing agent id; parent changes require an existing parent session id.
- Ask before closing or archiving sessions when the user has not clearly requested that lifecycle change.
- Prefer direct session tools over delegation for session organization; delegate only to create/continue agent work.
- Keep session titles concise and descriptive of durable purpose, not transient status.