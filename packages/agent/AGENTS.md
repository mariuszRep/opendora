# AGENTS.md

Local instructions for `packages/agent`.
Read the root file set first, then this package's local file set.

## Rules

- Keep this package focused on file-based agent definitions, template metadata, and package-local storage helpers.
- Do not move runtime orchestration concerns from `packages/opencode` into this package unless the package contract is intentionally changing.
- Preserve compatibility for seeded template agents unless a migration path is explicit.

## Editing guidance

- Template changes in `src/templates/` are user-visible behavior changes.
- Storage format changes should be treated as compatibility-sensitive because agents are stored on disk.
- If a change affects how `opencode` reads or seeds agents, verify the integration point in `packages/opencode`.
