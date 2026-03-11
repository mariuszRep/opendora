# AGENTS.md

Local instructions for `packages/sdk/js`.
Read the root file set first, then this package's local file set.

## Rules

- Treat generated code under `src/gen` and `src/v2/gen` as generated artifacts unless the task explicitly requires generator changes.
- Prefer changing the build or generation scripts over hand-editing generated files when regeneration is expected.
- Keep SDK surface changes coordinated with `packages/opencode` because this package depends on runtime-generated API input.

## Editing guidance

- If the OpenAPI source changes, update the generation path rather than patching clients inconsistently.
- Be explicit about whether a change affects v1-style exports, v2 exports, or both.
