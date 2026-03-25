# MIGRATION.md

> **Owner: agent** — updated as migration progresses. Mark steps done/in-progress/blocked as work happens.
> Human sets direction in VISION.md. This file tracks execution only.

---

## Agreed architecture

```
core/                    ← the assembled product: binary + TUI + CLI + HTTP server + DB lifecycle
  src/
    index.ts             ← opendora binary entry, yargs router
    cli/                 ← scriptable commands (serve, run, session, agent, ...)
    tui/                 ← Solid.js interactive TUI (default mode)
    server/              ← Hono HTTP/SSE/WS API (what web connects to)
    storage/             ← DB connection, migrations, adapters (jsonl/sqlite/postgres)

ui/
  web/                   ← browser UI only, talks to core API over HTTP/SSE

packages/                ← pure self-contained libraries, no app logic
  permission/            ← shared policy primitive: Rule, Ruleset, evaluate(), errors (no internal deps)
  provider/              ← LLM provider abstraction, all @ai-sdk/* (no internal deps)
  session/               ← session types, defines ISessionStore interface (← permission)
  tools/                 ← tool implementations, MCP, LSP (← permission)
  agent/                 ← agent loop, streaming, orchestration (← session, provider, tools, permission)
```

**Dependency rules:**
```
packages/permission  ← no internal deps
packages/provider    ← no internal deps
packages/session     ← permission
packages/tools       ← permission
packages/agent       ← session, provider, tools, permission
core/                ← agent + all packages (wires everything)
ui/web               ← core HTTP/SSE via typed client
```

---

## Strategy

`packages/opencode` stays functional throughout. Never broken, deleted only when fully drained.
Move `ui/web` first (independent). Clean packages next (bottom-up). Extract from opencode into packages. Assemble `core/` last.

---

## Status legend

| Symbol | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Done |
| `[!]` | Blocked — see note |

---

## Phase 0 — Baseline

Before touching anything, establish a safety net.

- [ ] Run all current tests, record passing count
- [x] Audit `packages/opencode` — destination map below
- [ ] Audit `packages/util` — list all exports and consumers
- [ ] Audit `packages/sdk` — list all exports and consumers
- [ ] Audit `packages/agent` — overlap with target `packages/agent`
- [ ] Audit `packages/ui` — confirm it becomes `ui/web/` (Next.js app, not the component library)

### `packages/opencode` destination map (245 files)

| Source path | Destination | Notes |
|---|---|---|
| `src/index.ts` | `core/src/index.ts` | Yargs CLI router, 18+ commands |
| `src/cli/bootstrap.ts` | `core/src/cli/` | CLI startup |
| `src/cli/error.ts` | `core/src/cli/` | CLI error formatting |
| `src/cli/logo.ts` | `core/src/cli/` | ASCII art |
| `src/cli/network.ts` | `core/src/cli/` | Network utilities |
| `src/cli/ui.ts` | `core/src/cli/` | CLI print helpers |
| `src/cli/upgrade.ts` | `core/src/cli/` | Self-upgrade logic |
| `src/cli/cmd/*.ts` (18 cmds) | `core/src/cli/cmd/` | All scriptable commands |
| `src/cli/cmd/tui/` (60+ files) | `core/src/tui/` | Complete Solid.js TUI |
| `src/server/server.ts` | `core/src/server/` | Hono HTTP server |
| `src/server/routes/*.ts` (15 files) | `core/src/server/` | All HTTP route handlers |
| `src/server/configure-session-core.ts` | `core/src/server/` | Session middleware |
| `src/server/error.ts` | `core/src/server/` | HTTP error handling |
| `src/server/event.ts` | `core/src/server/` | Server event definitions |
| `src/server/mdns.ts` | `core/src/server/` | mDNS service discovery |
| `src/storage/` (6 files) | `core/src/storage/` | DB connection, migrations, adapters |
| `src/tool/*.ts` (20 files) | `packages/tools/` | All tool implementations |
| `src/mcp/` (4 files) | `packages/tools/` | MCP client + OAuth |
| `src/lsp/` (4 files) | `packages/tools/` | LSP client/server |
| `src/file/` (5 files) | `packages/tools/` | File listing, watch, ripgrep |
| `src/shell/shell.ts` | `packages/tools/` | Shell utilities |
| `src/pty/index.ts` | `packages/tools/` | PTY spawning |
| `src/agent.ts` | `packages/agent/` | Agent CRUD, defaults |
| `src/acp/` (3 files) | `packages/agent/` | ACP protocol |
| `src/skill/` (3 files) | `packages/agent/` | Skill discovery/loading |
| `src/bus/` (3 files) | `packages/agent/` | Event bus pub/sub |
| `src/snapshot/index.ts` | `packages/session/` | Session snapshots |
| `src/share/` (2 files) | `packages/session/` | Share/collaboration state |
| `src/question/index.ts` | `packages/session/` | Permission questions during session |
| `src/permission/` (2 files) | `packages/permission/` | Consolidate here |
| `src/plugin/` (3 files) | `core/src/server/` | Plugin loading |
| `src/config/` (6 files) | `core/src/server/` | Config loading |
| `src/project/` (6 files) | `core/src/server/` | Project metadata |
| `src/worktree/index.ts` | `core/src/server/` | Git worktree management |
| `src/auth/` (2 files) | `core/src/server/` | Auth providers |
| `src/scheduler/index.ts` | `core/src/server/` | Cron/job scheduling |
| `src/control/` (2 files) | `core/src/server/` | Control plane |
| `src/global/index.ts` | `core/src/server/` | Global paths (config, data, cache) |
| `src/env/index.ts` | `core/src/server/` | Env var handling |
| `src/flag/flag.ts` | `core/src/server/` | Feature flags |
| `src/installation/index.ts` | `core/src/server/` | Version/installation metadata |
| `src/command/` (2 files) | `packages/agent/` | Command templating |
| `src/util/` (30 files) | inline per consumer | Dissolve — each destination inlines what it needs |
| `src/id/id.ts` | inline per consumer | ULID generation |
| `src/format/` (2 files) | inline per consumer | Output formatting |

---

## Phase 1 — Move ui/web

Independent of everything else. No package changes.

- [x] Move `packages/ui` → `ui/web/`
- [x] Update root `package.json` workspaces to include `ui/*`
- [x] Verify `ui/web/` runs as-is (no logic changes)

---

## Phase 2 — Clean packages (bottom-up, opencode untouched)

Verify and enforce boundaries on existing packages. No new functionality — just clean up what's there.

- [ ] `packages/permission` — verify self-contained, inline any util imports, confirm exports match vision
- [ ] `packages/provider` — verify no internal deps, inline any util imports, own its types
- [ ] `packages/session` — verify depends on permission only, inline util, define ISessionStore interface
- [ ] `packages/tools` — verify depends on permission only, inline util, define IToolStore interface
- [ ] `packages/agent` — verify depends on session/provider/tools/permission only, inline util

---

## Phase 3 — Extract from opencode into packages

Pull code out of `packages/opencode` into its correct home. opencode imports from new locations — still runs throughout.

- [ ] Extract `src/permission/` → `packages/permission/` (consolidate with existing)
- [ ] Extract `src/tool/*.ts`, `src/mcp/`, `src/lsp/`, `src/file/`, `src/shell/`, `src/pty/` → `packages/tools/`
- [ ] Extract `src/agent.ts`, `src/acp/`, `src/skill/`, `src/bus/`, `src/command/` → `packages/agent/`
- [ ] Extract `src/snapshot/`, `src/share/`, `src/question/` → `packages/session/`
- [ ] Update opencode imports to point at new package locations
- [ ] Verify opencode still runs after each extraction

---

## Phase 4 — Assemble core/

All packages clean and drained. Now assemble the binary.

- [ ] Create `core/` with `package.json`, `tsconfig.json`, `bunfig.toml`
- [ ] Move `src/cli/` from opencode → `core/src/cli/`
- [ ] Move `src/cli/cmd/tui/` → `core/src/tui/`
- [ ] Move `src/server/` → `core/src/server/`
- [ ] Move `src/storage/` → `core/src/storage/`
- [ ] Wire all packages into core at startup
- [ ] Export typed client from `core/src/server/client` (absorbs `packages/sdk/js`)
- [ ] Point `ui/web/` at `core/src/server/client` instead of `@opendora/sdk`
- [ ] Update root `package.json` workspaces
- [ ] Verify `opendora`, `opendora serve`, `opendora attach` all work from `core/`
- [ ] Verify `ui/web/` works end-to-end against running core

---

## Phase 5 — Delete legacy

opencode is now empty. Clean up.

- [ ] Confirm `packages/opencode` is fully drained
- [ ] Delete `packages/opencode`
- [ ] Drain and delete `packages/util`
- [ ] Drain and delete `packages/sdk/js` (replaced by `core/src/server/client`)
- [ ] Update `AGENTS.md` package map to final state

---

## Decisions log

| Date | Decision | Reason |
|---|---|---|
| 2026-03-25 | opencode stays functional throughout | No big-bang rewrite risk; strangler fig approach |
| 2026-03-25 | `ui/web/` moved first | Independent, no deps, quick win |
| 2026-03-25 | Packages cleaned before opencode extracted | Clean foundation before extracting into it |
| 2026-03-25 | `util` dissolved into each package | Shared util is the primary cause of cross-pollination |
| 2026-03-25 | `sdk` merged into `core/src/server/client` | Same source of truth, same versioning |
| 2026-03-25 | `core/` is the assembled product | TUI + CLI are modes of one binary; server + DB lifecycle belong here |
| 2026-03-25 | No `packages/storage` | Adapters only used by core; live in `core/src/storage/` |
| 2026-03-25 | `permission` stays a shared package | Rule/Ruleset types are shared across session, tools, agent — can't be owned by any one of them |
| 2026-03-25 | `apps/` renamed to `ui/` | Only browser UI lives there; name reflects purpose |

---

## Blockers

> None yet.
