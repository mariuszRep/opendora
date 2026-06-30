# AGENTS.md

Repository-wide instructions for agents working in `projectflows`.

## Read order

Before changing code or documentation in any scope, look for and read the context files that exist for that scope:

1. This root `AGENTS.md`
2. Root `VISION.md`, if present — target intent, human-owned where intent changes
3. Root `README.md`, if present — human-facing setup and usage
4. Root `INSTALL.md`, if present — install/upgrade/uninstall specification
5. The nearest nested `AGENTS.md`, `VISION.md`, and `README.md`, if present, for the package, app, agent, or skill you are editing
6. Relevant `.projectflows/goals/<slug>/GOAL.md` files, if the work aligns with an active goal

Nested files inherit parent context by default. Treat nested files as stricter or more specific.

## Read order for planned/migration work

When working on planned or migration work, read the relevant GOAL.md first:

- **Unified Durable Run** (checkpoint-driven runner, suspend/resume, unified executor): `.projectflows/goals/unified-durable-run/GOAL.md`
- **Cross-platform delivery** (single-binary install, Tauri desktop): `.projectflows/goals/cross-platform-delivery/GOAL.md`
- **Session graph ledger** (entries + universal edges): `.projectflows/goals/session-graph-ledger-and-chat-rail/GOAL.md`
- Other active goals: browse `.projectflows/goals/<slug>/GOAL.md`

## Repository rules

- Keep changes scoped to the package or app you are working in.
- Do not silently contradict a parent scope document. Update the parent document too if repository-wide truth changes.
- Preserve existing behavior unless the task explicitly changes it.
- Do not present planned work as implemented. Planned work belongs in GOAL.md; code is the source of truth for current implementation state.
- Mark uncertain claims as `needs verification` or `unknown`.
- Prefer existing scripts, build steps, and generators over ad hoc replacements.
- Do not reintroduce in-memory-only run state as a source of truth. Durable run state (cursor, context, step journal, suspend/resume tokens) flows through `storage` contracts; `runtime` owns resume/replay; `session` records.
- Do not maintain STATE.md or ROADMAP.md status documents — code is the source of truth.

## Application & Package map

See the nearest `VISION.md` where present for target intent.

**Target applications:**
- `apps/web` — web frontend
- `apps/cli` — CLI binary with integrated terminal UI (TUI) mode/subcommand
- `apps/desktop` — Tauri v2 desktop shell (Phase 2, until implementation begins)
- `server/` — Hono API server + typed client export

**Target packages (self-contained, no cross-pollination):**
- `packages/session` — session types, storage adapters
- `packages/provider` — LLM provider abstraction
- `packages/tools` — tool implementations, MCP
- `packages/agent` — agent loop, streaming, orchestration
- `packages/permission` — permission types and enforcement

## Documentation maintenance

- `VISION.md` is optional but authoritative where present. It captures desired intent, not status. Update it only when the user supplies or approves intent changes.
- Planned work, migration plans, and delivery specs belong in `.projectflows/goals/<slug>/GOAL.md` files, not in standalone docs.
- If you add or tighten workflow constraints for agents, update the relevant `AGENTS.md`.
- Code is the source of truth for current implementation state — do not maintain parallel `STATE.md` or `ROADMAP.md` status documents.

## Folder documentation

Each meaningful folder or subtree may contain local context files that describe or reference its own structure. Always look for and read them when working inside that folder; absence is not automatically debt.

- **`AGENTS.md`** — operating rules for agents working in that folder or subtree.
- **`VISION.md`** — optional desired target state for that folder or subtree; human-owned where intent changes.
- **`README.md`** — human-facing quickstart and setup instructions.
- **`INSTALL.md`** — detailed install/upgrade/uninstall specification for all platforms.
- **`.projectflows/goals/<slug>/GOAL.md`** — executable goal specifications for planned work, migrations, and delivery.

Nested documentation inherits parent context by default. Treat nested files as stricter or more specific than their parents.
