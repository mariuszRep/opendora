---
name: delivery-implementation
description: Load when Product Engineer has an implementation spec and must make safe, minimal code changes while preserving user work and existing repository conventions.
origin: opendora
---

# Delivery Implementation

Use this skill only after intake/context and, for non-trivial work, synthesis.

## Objective

- Apply the implementation spec with minimal, conventional, verifiable changes.
- Preserve user work and repository patterns.
- Prepare the change for review-gate verification.

## Inputs

- Implementation spec
- Relevant project context and constraints
- Current dirty-worktree awareness
- Verification plan

## Steps

1. Re-read the exact files to be changed if they were not read recently.
2. Check for nearby conventions, imports, tests, and generated-file markers.
3. Apply the smallest correct edit.
4. Avoid unrelated cleanup, formatting churn, or dependency changes unless required.
5. If unexpected user changes appear in touched files, stop and ask how to proceed.
6. Run targeted fast checks where available before handing to final verification.
7. Return an implementation summary and changed-file list.

## Editing Rules

- Default to ASCII unless the file already uses non-ASCII or the task requires it.
- Add comments only for non-obvious logic.
- Prefer patch-style edits for single-file/manual changes.
- Do not edit generated artifacts manually unless the project convention requires it.
- Do not commit, push, deploy, alter secrets, or run destructive commands unless explicitly requested.
- Never revert or overwrite unrelated dirty worktree changes.

## Output Contract

```text
## Implementation Result

Status: COMPLETE | BLOCKED | PARTIAL
Files Changed:
- `path`: what changed
Spec Deviations: ...
Local Checks Run: ...
Ready For Verification: true | false
Blockers: ...
```

## Rules

- Do not perform broad research in this phase. If a new design question appears, return to synthesis.
- Do not skip verification because the change looks correct.
- Keep final proof for `review-gate`.