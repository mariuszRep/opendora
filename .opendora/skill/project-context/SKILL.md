---
name: project-context
description: Load before project intake, onboarding, implementation, review, or context-doc updates to read and maintain mandatory project context while treating MIGRATION.md as scoped legacy-area migration memory.
origin: opendora
---

# Project Context

Use this skill whenever work involves a project: intake, requirements discussion, project initiation, onboarding an existing project, implementing a feature, reviewing work, or updating context documentation.

## Objective

Keep project work aligned with durable context so future agents understand what the application is meant to be, how to operate safely in each folder, and whether any legacy area is under an active migration.

## Context Files

- `VISION.md` - mandatory project intent for the application or folder: what it should be, how it should behave, important requirements, product shape, and architectural intent when relevant. It is not a completion checklist and must not record done/not-done status.
- `AGENTS.md` - mandatory operational guidance for agents working in a folder: read order, boundaries, local rules, pitfalls, and workflow expectations.
- `README.md` - mandatory human-facing setup, onboarding, usage, and practical commands. Keep it aligned with verified behavior.
- `MIGRATION.md` - optional, scoped transition memory for a legacy source folder or area being moved, reworked, retired, or replaced. It belongs with the code being migrated from, not in the target destination just because code is moving there.

## Migration Placement Rule

Use `MIGRATION.md` only when there is an active rework, relocation, retirement, or replacement of existing code.

- Put `MIGRATION.md` in or near the legacy/source folder that contains the code being migrated away from.
- Do not create `MIGRATION.md` in the destination folder solely because it is receiving migrated code.
- The destination folder should normally carry its target intent in `VISION.md` and operating guidance in `AGENTS.md` / `README.md`.
- Once the migration is complete and the legacy/source folder can be removed, the related `MIGRATION.md` should be deleted with that legacy area.
- Do not use `MIGRATION.md` as a permanent roadmap, status file, or destination design document.

## Read Order

Before project work, identify the active project root and relevant subfolder, then read context in this order where present:

1. Root `AGENTS.md`
2. Root `VISION.md`
3. Root `README.md`
4. Nearest nested `AGENTS.md`
5. Nearest nested `VISION.md` and `README.md`
6. Relevant `MIGRATION.md` only when the work touches or depends on a legacy/source area under migration
7. Package or app manifests and scripts when setup, onboarding, validation, or delivery is involved

If a mandatory context file is missing from an active project root or folder, report that as project-context debt instead of inventing its contents. Missing optional migration files are not debt unless the current work needs them.

## Decision Rules

- If the request changes what the application or folder is meant to be, update or propose an update to `VISION.md`.
- If the request moves, replaces, retires, or reworks an existing area, create or update `MIGRATION.md` in the legacy/source area being migrated away from.
- If the request changes how agents should behave in a folder, update the nearest `AGENTS.md`.
- If the request changes how humans install, run, configure, or use the project, update `README.md`.
- If work touches an area with active migration notes, stop and decide whether to implement in the old area, destination area, or migration path.

## Update Rules

- Preserve user intent and language when capturing vision or requirements.
- Keep context concise and durable; avoid timestamped chat summaries unless they are necessary migration memory.
- Separate desired concept, migration plan, and operating guidance into the correct files.
- Do not mark features complete in `VISION.md`.
- Do not use `MIGRATION.md` as a general roadmap.
- Do not create or maintain `STATE.md` or `ROADMAP.md`; those are legacy context patterns.
- Do not update human-owned vision intent unless the user supplied or approved the intent.
- When making context changes, keep them scoped to the relevant folder and explain why the file changed.

## Review Checklist

Before reporting project work as ready, check:

- Did the work read mandatory project context first: `AGENTS.md`, `VISION.md`, and `README.md` where present?
- Is `MIGRATION.md` relevant because the touched code is legacy/source code being migrated away from?
- Does the request align with `VISION.md`, or does the vision need an approved update?
- Did implementation happen in the right location for the migration direction?
- Do `AGENTS.md` or `README.md` need updates because behavior, commands, or workflow changed?
- Are current-state claims backed by code or verified files rather than assumptions?

## Output

When this skill affects the task, report briefly:

- which mandatory context files were read
- whether migration context was applicable and where it lives
- any missing or conflicting context
- which files need updates, if any
- whether the work can proceed, should pause for context clarification, or should be redirected because of migration