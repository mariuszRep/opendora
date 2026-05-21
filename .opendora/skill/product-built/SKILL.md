---
name: product-built
description: "Use to implement approved plans end-to-end: create branch, apply code changes, commit coherent increments, and prepare a traceable handoff for testing."
origin: opendora
---

# Product Built

Use this skill when `product-plan` is READY and implementation is authorized.

## Objective
- Build the planned scope on an explicit branch.
- Produce traceable commits that map to requirements and plan steps.

## Steps
1. Confirm plan scope, non-goals, and acceptance criteria.
2. Create/select working branch before code changes.
3. Implement changes in focused increments by module/feature slice.
4. Run targeted local checks after each meaningful increment.
5. Commit in coherent units with clear why-focused messages.
6. Produce implementation handoff for `product-test`.

## Git/Commit Rules
- Create a dedicated branch for the work (unless user specifies branch).
- Do not commit unrelated changes.
- Prefer multiple small logical commits over one opaque commit.
- Each commit should map to one plan step or requirement slice.
- Include commit list in handoff output.

## Output Contract
- Branch name used/created
- Scope implemented vs deferred
- Files changed by area
- Commit list (hash + message)
- Checks run during implementation
- Remaining risks
- Next phase: `product-test`
