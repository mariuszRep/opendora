# AGENTS.md

Local instructions for `apps/web`.
Read the root file set first, then this package's local file set.

## Rules

- Keep this package focused on the Next.js web app.
- Preserve the existing app structure and dependency choices unless the task requires a broader UI refactor.
- Treat API coupling with `packages/sdk` as an integration boundary, not a place to duplicate business logic.
- Never restore `apps/web/app/api/event/route.ts` — it breaks `output: "export"` and has regressed 4 times as collateral damage from unrelated refactors. SSE goes through `next.config.ts` rewrites in dev and directly to the backend origin in the static export. Before any commit touching many files under `apps/web/`, grep for this path.

## Editing guidance

- Prefer changes that keep browser-facing logic inside this package rather than pushing UI-specific concerns into shared packages.
- If a UI change depends on undocumented server behavior, mark that assumption as `needs verification`.
