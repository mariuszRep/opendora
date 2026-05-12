# AGENTS.md

Repository-wide instructions for agents working in `opendora`.

## Read order

Before changing code in any scope, read:

1. This root `AGENTS.md`
2. [`VISION.md`](/home/mariu/projects/opendora/VISION.md) — target architecture, human-owned, never edit during migration
3. [`MIGRATION.md`](/home/mariu/projects/opendora/MIGRATION.md) — current migration progress, update as work happens
4. The nearest nested `AGENTS.md` for the package or app you are editing

Nested files inherit parent context by default. Treat nested files as stricter or more specific.

## Repository rules

- Keep changes scoped to the package or app you are working in.
- Do not silently contradict a parent scope document. Update the parent document too if repository-wide truth changes.
- Preserve existing behavior unless the task explicitly changes it.
- Do not present planned work as implemented. Put shipped facts in `STATE.md` and proposed work in `ROADMAP.md`.
- Mark uncertain claims as `needs verification` or `unknown`.
- Prefer existing scripts, build steps, and generators over ad hoc replacements.

## Application & Package map

See `VISION.md` for the target architecture. During migration, the actual structure is in flux — consult `MIGRATION.md` for current state.

**Target applications:**
- `apps/web` — web frontend
- `apps/cli` — CLI binary
- `apps/tui` — terminal UI
- `server/` — Hono API server + typed client export

**Target packages (self-contained, no cross-pollination):**
- `packages/session` — session types, storage adapters
- `packages/provider` — LLM provider abstraction
- `packages/tools` — tool implementations, MCP
- `packages/agent` — agent loop, streaming, orchestration
- `packages/permission` — permission types and enforcement

## Documentation maintenance

- `VISION.md` is human-owned. Never modify it during migration or implementation work.
- `MIGRATION.md` is agent-owned. Update it as steps complete, start, or get blocked.
- If you add or tighten workflow constraints for agents, update the relevant `AGENTS.md`.
- Code is the source of truth for current state — do not maintain parallel state documents.

## Folder documentation

Each meaningful folder or subtree should contain local context files that describe or reference its own structure:

- **`AGENTS.md`** — operating rules for agents working in that folder or subtree.
- **`VISION.md`** — desired target state for that folder or subtree; human-owned where intent changes.
- **`MIGRATION.md`** — required once a migration, refactor, replacement, retirement, or structural change is decided. Include the planning and discussion phase before any code changes begin.

Nested documentation inherits parent context by default. Treat nested files as stricter or more specific than their parents.
