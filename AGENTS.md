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
- **Never run `bun typecheck` (or any bare `turbo` command) at the repo root — it hangs forever.** The core packages (`util`, `permission`, `config`, `runtime`, `session`, `server`, `plugin`, `tools`, `skills`, `storage`, `schedule`, `workflow`, `auth`, `provider`) have a longstanding circular-dependency tangle — 37+ cycles spanning 14 packages, confirmed at the code-import level (e.g. `packages/util/src/wildcard.ts` imports from `@projectflows/permission`, which imports back from `util`; `session`'s tests import `@projectflows/server`, which depends on `session`). Turbo 2.5.6 hangs indefinitely trying to resolve/report on that cycle graph — reproduced even with `turbo ls` (pure workspace discovery, no task involved), `--dry-run`, `--no-daemon`, and with a freshly regenerated `bun.lock`; ruled out as a network/telemetry/daemon issue. Typecheck per package instead: `cd packages/<pkg> && bun run typecheck` (see `.github/workflows/ci.yml`'s `Typecheck` step for the loop this repo's own CI uses). Untangling the cycles is real, scoped work — not something to attempt as a side effect of an unrelated task.

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

## Directory relationships

There are three directories that make up the Projectflows development ecosystem. All three must be understood together:

| Directory | Role |
|---|---|
| `~/projects/opendora/` | Source repo — packages, apps, build scripts |
| `~/projects/projectflows-website/` | First-party registry — agent/skill/tool definitions, plugin manifests, capability packs |
| `~/.projectflows/` | Global runtime root — installed agents, skills, tools, lockfile |

**Critical rules for agents working in this repo:**

1. **`~/.projectflows/` is the only runtime capability source.** The server loads agents from `~/.projectflows/agents/`, skills from `~/.projectflows/skills/`, tools from `~/.projectflows/tools/`. Project-local `.projectflows/` directories in the source repo are NOT scanned for capabilities.

2. **`projectflows-website/registry/` is the catalog source.** This is where capability definitions live before being packaged and installed. The env var `PROJECTFLOWS_REGISTRY_PATH` points to it. It is never imported directly at runtime.

3. **`bun dev:setup` bridges the two.** Running `bun dev:setup` (or `bun scripts/package-core.ts --install`) reads from `projectflows-website/registry/` and installs capabilities into `~/.projectflows/`. This is the dev equivalent of `install.sh` for production binaries.

4. **Never create agents, skills, workflows, tools, or plugins inside `<project>/.projectflows/`.** All runtime capabilities go exclusively to `~/.projectflows/`:
   - Agents → `~/.projectflows/agents/<id>/`
   - Skills → `~/.projectflows/skill/<name>/`
   - Workflows → `~/.projectflows/workflows/<name>/`
   - Tools → `~/.projectflows/tools/<name>/`
   - Plugins → `~/.projectflows/plugins/<name>/`

   The project repo's `.projectflows/` is for **development goals only** (`goals/<slug>/GOAL.md`). Any agent, skill, tool, workflow, or plugin directory found under `<project>/.projectflows/` is a misplaced artifact — do not read, modify, or create more of them.

5. **`PROJECTFLOWS_PROJECT_ROOT` is session context only.** This env var tells the server what the current "project" directory is for file operations and config lookup. It does NOT affect where capabilities are loaded from.

## Folder documentation

Each meaningful folder or subtree may contain local context files that describe or reference its own structure. Always look for and read them when working inside that folder; absence is not automatically debt.

- **`AGENTS.md`** — operating rules for agents working in that folder or subtree.
- **`VISION.md`** — optional desired target state for that folder or subtree; human-owned where intent changes.
- **`README.md`** — human-facing quickstart and setup instructions.
- **`INSTALL.md`** — detailed install/upgrade/uninstall specification for all platforms.
- **`.projectflows/goals/<slug>/GOAL.md`** — executable goal specifications for planned work, migrations, and delivery.

Nested documentation inherits parent context by default. Treat nested files as stricter or more specific than their parents.
