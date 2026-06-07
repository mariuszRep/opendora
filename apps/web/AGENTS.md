# AGENTS.md

Local instructions for `apps/web`.
Read the root file set first, then this package's local file set.

## Rules

- Keep this package focused on the Next.js web app.
- Preserve the existing app structure and dependency choices unless the task requires a broader UI refactor.
- Treat API coupling with `packages/sdk` as an integration boundary, not a place to duplicate business logic.

## Editing guidance

- Prefer changes that keep browser-facing logic inside this package rather than pushing UI-specific concerns into shared packages.
- If a UI change depends on undocumented server behavior, mark that assumption as `needs verification`.
