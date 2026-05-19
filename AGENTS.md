# AGENTS.md

Repository-wide instructions for agents working in `opendora`.

## Read order

Before changing code or documentation in any scope, look for and read the context files that exist for that scope:

1. This root `AGENTS.md`
2. Root `VISION.md`, if present — target intent, human-owned where intent changes
3. Root `README.md`, if present — human-facing setup and usage
4. Relevant `MIGRATION.md`, if present and the work touches an area being moved, retired, replaced, or reworked
5. The nearest nested `AGENTS.md`, `VISION.md`, and `README.md`, if present, for the package, app, agent, or skill you are editing

Nested files inherit parent context by default. Treat nested files as stricter or more specific.

## Repository rules

- Keep changes scoped to the package or app you are working in.
- Do not silently contradict a parent scope document. Update the parent document too if repository-wide truth changes.
- Preserve existing behavior unless the task explicitly changes it.
- Do not present planned work as implemented. Put shipped facts in `STATE.md` and proposed work in `ROADMAP.md`.
- Mark uncertain claims as `needs verification` or `unknown`.
- Prefer existing scripts, build steps, and generators over ad hoc replacements.

## Application & Package map

See the nearest `VISION.md` where present for target intent. During migration, the actual structure may be in flux — consult the relevant `MIGRATION.md` where present.

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

- `VISION.md` is optional but authoritative where present. It captures desired intent, not status. Update it only when the user supplies or approves intent changes.
- `MIGRATION.md` is agent-owned transition memory. Update it as migration steps complete, start, or get blocked.
- If you add or tighten workflow constraints for agents, update the relevant `AGENTS.md`.
- Code is the source of truth for current implementation state — do not maintain parallel `STATE.md` or `ROADMAP.md` status documents.

## Folder documentation

Each meaningful folder or subtree may contain local context files that describe or reference its own structure. Always look for and read them when working inside that folder; absence is not automatically debt.

- **`AGENTS.md`** — operating rules for agents working in that folder or subtree.
- **`VISION.md`** — optional desired target state for that folder or subtree; human-owned where intent changes.
- **`MIGRATION.md`** — required once a migration, refactor, replacement, retirement, or structural change is decided. Include the planning and discussion phase before any code changes begin.

Nested documentation inherits parent context by default. Treat nested files as stricter or more specific than their parents.
