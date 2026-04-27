---
name: project-context
description: Load before project intake, onboarding, implementation, review, or context-doc updates to read and maintain VISION.md, MIGRATION.md, AGENTS.md, README.md consistently.
---

# Project Context

Use this skill whenever work involves a project: intake, requirements discussion, project initiation, onboarding an existing project, implementing a feature, reviewing work, or updating context documentation.

## Objective

Keep project work aligned with durable context so future agents understand what the application is meant to be, where migration is happening, and how to operate safely in each folder.

## Context Files

- `VISION.md` - conceptual target for the application: what it should be, how it should behave, important requirements, product shape, and architectural intent when relevant. It is not a completion checklist and must not record done/not-done status.
- `MIGRATION.md` - scoped transition memory for a folder or area being moved, reworked, retired, or replaced. It captures what is migrating, where it is going, why, and constraints or cautions while the migration is active.
- `AGENTS.md` - operational guidance for agents working in a folder: read order, boundaries, local rules, pitfalls, and workflow expectations.
- `README.md` - human-facing setup, onboarding, usage, and practical commands. Keep it aligned with verified behavior.
- `STATE.md` - optional current-state snapshot when useful. Do not let it become a parallel source of truth that drifts from code.
- `ROADMAP.md` - optional proposed future work. Keep it separate from shipped state and conceptual vision.

## Read Order

Before project work, identify the active project root and relevant subfolder, then read context in this order where present:

1. Root `AGENTS.md`
2. Root `VISION.md`
3. Relevant `MIGRATION.md` files for areas being changed or discussed
4. Nearest nested `AGENTS.md`
5. Nearby `VISION.md`, `STATE.md`, `ROADMAP.md`, and `README.md` when relevant to the request
6. Package or app manifests and scripts when setup, onboarding, validation, or delivery is involved

If a required context file is referenced but missing, report that as project-context debt instead of inventing its contents.

## Decision Rules

- If the request changes what the application is meant to be, update or propose an update to `VISION.md`.
- If the request moves, replaces, retires, or reworks an area, create or update the relevant `MIGRATION.md` near that area.
- If the request changes how agents should behave in a folder, update the nearest `AGENTS.md`.
- If the request changes how humans install, run, configure, or use the project, update `README.md`.
- If the request clarifies current behavior only, prefer code and verified docs over new status files.
- If work touches an area with active migration notes, stop and decide whether to implement in the old area, destination area, or migration path.

## Update Rules

- Preserve user intent and language when capturing vision or requirements.
- Keep context concise and durable; avoid timestamped chat summaries unless they are necessary migration memory.
- Separate desired concept, current state, migration plan, and operating guidance.
- Do not mark features complete in `VISION.md`.
- Do not use `MIGRATION.md` as a general roadmap.
- Do not update human-owned vision intent unless the user supplied or approved the intent.
- When making context changes, keep them scoped to the relevant folder and explain why the file changed.

## Review Checklist

Before reporting project work as ready, check:

- Did the work read the relevant context files first?
- Does the request align with `VISION.md`, or does the vision need an approved update?
- Is any touched area under active migration?
- Did implementation happen in the right location for the migration direction?
- Do `AGENTS.md` or `README.md` need updates because behavior, commands, or workflow changed?
- Are current-state claims backed by code or verified files rather than assumptions?

## Output

When this skill affects the task, report briefly:

- which context files were read
- any missing or conflicting context
- which files need updates, if any
- whether the work can proceed, should pause for context clarification, or should be redirected because of migration