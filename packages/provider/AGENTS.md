# AGENTS.md - @opendora/provider

Rules for agents working in `packages/provider`.

## Scope

- This package owns provider catalog loading, provider authentication, model resolution, SDK construction, provider-specific model transforms, and provider fallback state.
- Runtime packages should ask this package for resolved provider/model data instead of interpreting provider IDs, model IDs, fallback groups, auth, or SDK details themselves.
- UI and CLI code may list and store model references, but provider-specific behavior belongs here.

## Editing Guidance

- Keep provider-specific conditionals inside this package unless the caller is only displaying provider data.
- Do not move session orchestration, tool execution, permissions, or agent storage into this package.
- If a model-selection policy changes that has migration implications, create or update a GOAL.md in `.projectflows/goals/` rather than maintaining a standalone migration document.
- Preserve existing provider behavior unless the task explicitly changes it.
