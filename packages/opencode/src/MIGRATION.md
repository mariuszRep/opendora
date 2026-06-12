# opencode/src Migration Plan

Decompose `@opendora/opencode` into the canonical packages defined by VISION.md.
After migration this package becomes a thin CLI wrapper (`cli/`, `daemon/`, `index.ts`) that imports from properly structured domain packages.

**Three packages defined in VISION.md that need to be created:**
- `packages/storage/` — VISION.md stub only, no package.json yet
- `packages/server/` — VISION.md stub only, no package.json yet
- `packages/runtime/` — VISION.md stub only, no package.json yet

---

## Phase 1 — Promote Pure Utilities to `@opendora/util`

**Simple: folder moves + cleanup + tests. No new packages.**

Files to move from `src/util/` → `packages/util/src/`:

| File | Action |
|------|--------|
| `util/abort.ts` | Move |
| `util/archive.ts` | Move |
| `util/context.ts` | Move |
| `util/defer.ts` | Move |
| `util/eventloop.ts` | Move |
| `util/format.ts` | Move |
| `util/git.ts` | Move |
| `util/locale.ts` | Move |
| `util/queue.ts` | Move |
| `util/signal.ts` | Move |
| `util/timeout.ts` | Move |
| `util/token.ts` | Move |
| `util/wildcard.ts` | Move |
| `util/scrap.ts` | Delete |

Files that **stay** in opencode (TUI/CLI-only):
- `util/color.ts` — ANSI terminal escapes
- `util/keybind.ts` — depends on `@opentui/core`
- `util/rpc.ts` — Web Worker RPC for TUI threads

Files that are already 1-line re-exports (keep as redirects):
`util/filesystem.ts`, `util/fn.ts`, `util/glob.ts`, `util/iife.ts`, `util/lazy.ts`, `util/lock.ts`, `util/log.ts`, `util/process.ts`, `util/proxied.ts`

**Pattern:** After moving, leave a 1-line re-export redirect at the old path (matches the existing `log.ts` / `lock.ts` pattern). Move matching test files from `test/util/` to `packages/util/src/`.

**Exit criteria:** `packages/util/src/` has all 13 new modules; `src/util/` contains only re-exports or TUI-specific files; `bun test` passes in both packages.

---

## Phase 2 — Move Bus Event Types to `@opendora/util`

**Simple: two self-contained files with no `Instance` dependency.**

| File | Action |
|------|--------|
| `bus/bus-event.ts` | Move to `packages/util/src/bus-event.ts` |
| `bus/global.ts` | Move to `packages/util/src/global-bus.ts` |
| `bus/index.ts` (the `Bus` class) | Stays — depends on `Instance.state()`, moves in Phase 5 |

Original paths become 1-line re-export redirects.

**Exit criteria:** `BusEvent` and `GlobalBus` exported from `@opendora/util`; `bus/bus-event.ts` and `bus/global.ts` are re-export redirects.

---

## Phase 3 — Create `@opendora/storage`

**Medium: new package, all physical persistence moves here.**

Files to move from `src/` → `packages/storage/src/`:

| Source | Destination |
|--------|-------------|
| `storage/db.ts` | `storage/src/db.ts` |
| `storage/storage.ts` | `storage/src/json-storage.ts` |
| `storage/json-migration.ts` | `storage/src/json-migration.ts` |
| `storage/schema.ts` | `storage/src/schema.ts` |
| `storage/schema.sql.ts` | `storage/src/schema.sql.ts` |
| `storage/permission.sql.ts` | `storage/src/permission-rule.sql.ts` |
| `project/project.sql.ts` | `storage/src/project.sql.ts` |
| `control/control.sql.ts` | `storage/src/control.sql.ts` |
| `share/share.sql.ts` | `storage/src/share.sql.ts` |
| `migration/` (all SQL) | `packages/storage/migration/` |

SQL table files move because `schema.ts` re-exports them all — they are pure persistence schema with no domain logic. Original paths become re-export redirects.

**New `packages/storage/package.json`:**
```json
{
  "name": "@opendora/storage",
  "version": "1.2.15",
  "private": true,
  "type": "module",
  "exports": { "./*": "./src/*.ts" },
  "dependencies": {
    "@opendora/util": "workspace:*",
    "@opendora/session": "workspace:*",
    "@opendora/schedule": "workspace:*",
    "@opendora/permission": "workspace:*",
    "drizzle-orm": "<inherit>",
    "zod": "catalog:"
  },
  "devDependencies": { "drizzle-kit": "<inherit>", "@types/bun": "catalog:", "typescript": "catalog:" }
}
```

**opencode/package.json:** add `@opendora/storage: workspace:*`, remove `drizzle-orm` and `drizzle-kit`.

**Import updates (~16 files):** All `@/storage/db` → `@opendora/storage/db`. Affected: `schedule.ts`, `index.ts`, `project/project.ts`, `worktree/index.ts`, `share/share-next.ts`, `control/index.ts`, `permission/next.ts`, `server/server.ts`, `server/routes/*.ts`.

Move `test/storage/json-migration.test.ts` → `packages/storage/`.

**Exit criteria:** `packages/storage/` has package.json + all migrations; opencode imports `Database`/`Storage` from `@opendora/storage`; `bun drizzle-kit generate` runs from storage package.

---

## Phase 4 — Create `@opendora/server`

**Medium-hard: new package, all HTTP routes move here.**

Files to move from `src/server/` → `packages/server/src/`:

| Source | Destination |
|--------|-------------|
| `server/server.ts` | `server/src/server.ts` |
| `server/routes/` (all 19 files) | `server/src/routes/` |
| `server/configure-session-core.ts` | `server/src/configure-session-core.ts` |
| `server/error.ts` | `server/src/error.ts` |
| `server/event.ts` | `server/src/event.ts` |
| `server/mdns.ts` | `server/src/mdns.ts` |

`server.ts` imports ~40 opencode-internal modules. Remaining opencode imports resolve via `@opendora/opencode/...` (its `./*` export) as an **interim state** until those domains also migrate in later phases.

**New `packages/server/package.json`** depends on: `@opendora/storage`, `@opendora/util`, `@opendora/session`, `@opendora/tools`, `@opendora/schedule`, `@opendora/workflow`, `@opendora/agent`, `@opendora/permission`, `@opendora/auth`, `@opendora/opencode` (interim), `hono`, `hono-openapi`, `bonjour-service`.

**opencode/package.json:** add `@opendora/server: workspace:*`, remove `hono`, `hono-openapi`, `bonjour-service`.

**opencode CLI:** `src/cli/cmd/serve.ts` calls `Server.listen()` imported from `@opendora/server`.

Move `test/server/` → `packages/server/test/`.

**Exit criteria:** `packages/server/` has package.json; `Server.listen()` callable from opencode CLI; all server tests pass; opencode no longer bundles Hono directly.

---

## Phase 5 — Create `@opendora/runtime` (Instance + Execution Context)

**Hard: new package, the central `Instance.state()` context moves here.**

`Instance.state()` is imported by ~15 subsystems — this is the biggest coordination step.

Files to move → `packages/runtime/src/`:

| Source | Destination |
|--------|-------------|
| `project/instance.ts` | `runtime/src/instance.ts` |
| `project/state.ts` | `runtime/src/state.ts` |
| `project/project.ts` | `runtime/src/project.ts` |
| `project/vcs.ts` | `runtime/src/vcs.ts` |
| `project/bootstrap.ts` | `runtime/src/bootstrap.ts` |
| `bus/index.ts` (Bus class) | `runtime/src/bus.ts` |
| `scheduler/index.ts` | `runtime/src/scheduler.ts` |
| `snapshot/index.ts` | `runtime/src/snapshot.ts` |
| `env/index.ts` | `runtime/src/env.ts` |
| `worktree/index.ts` | `runtime/src/worktree.ts` |

All `@/project/instance`, `@/bus`, `@/scheduler`, `@/snapshot`, `@/env`, `@/worktree` imports across opencode update to `@opendora/runtime/...`.

Move tests: `test/project/`, `test/scheduler.test.ts`, `test/snapshot/` → `packages/runtime/test/`.

**Exit criteria:** `Instance`, `Project`, `State`, `Bus`, `Scheduler`, `Snapshot`, `Env`, `Worktree` exported from `@opendora/runtime`; all moved tests pass.

---

## Phase 6 — Domain Module Consolidation

**Hard: move modules into their canonical packages. Modules with remaining opencode-internal deps use interim `@opendora/opencode/...` imports until Phase 7 clears those deps.**

> **Shipped (branch `migration/phase-6-domain-modules`):** lsp, mcp, ide, pty, auth, control, question, format.
> **Blocked by opencode↔runtime cycle:** skill, file (watcher/time), permission/next, share/share-next — originals stay in opencode; copies exist in target packages but are not yet wired as re-export stubs.

| Source | Destination | Status |
|--------|-------------|--------|
| `lsp/` (4 files) | `@opendora/server/lsp/` | ✅ Shipped — stub redirects in place |
| `mcp/` (4 files) | `@opendora/server/mcp/` | ✅ Shipped — stub redirects in place |
| `ide/index.ts` | `@opendora/server/ide` | ✅ Shipped — stub redirect in place |
| `pty/index.ts` | `@opendora/server/pty` | ✅ Shipped — stub redirect in place |
| `auth/` (2 files) | `@opendora/auth` | ✅ Shipped — stub redirect in place |
| `control/index.ts` | `@opendora/storage` | ✅ Shipped — stub redirect in place |
| `question/index.ts` | `@opendora/runtime` | ✅ Shipped — stub redirect in place |
| `format/` (2 files) | `@opendora/runtime` (not util — needs Instance/Bus/Config) | ✅ Shipped — stub redirects in place |
| `skill/` (3 files) | `@opendora/skills` | 🔶 Copies in skills/; opencode originals retained (runtime↔opencode cycle) |
| `file/` (watcher, time) | `@opendora/tools` | 🔶 Blocked — tools cannot take opencode/runtime deps without new cycles |
| `permission/next.ts` | `@opendora/server` (bridge code) | 🔶 Blocked — callers all in opencode; cycles if moved to permission pkg |
| `share/share-next.ts` | `@opendora/session` | 🔶 Blocked — session cannot take opencode/runtime deps without new cycles |

**Cycle note:** `@opendora/runtime` ↔ `@opendora/opencode` is a pre-existing cycle from Phase 5 that breaks `bun turbo typecheck`. Resolving it (Phase 7) unblocks the remaining rows above.

**Exit criteria (full):** `src/` contains only: `cli/`, `daemon/`, `plugin/`, `command/`, `config/`, `acp/`, `tool/`, `bun/`, `agent.ts`, `schedule.ts`, `index.ts`.

---

## Phase 7 — Final CLI Cleanup

**Complex: last business logic leaves opencode; tool/ alignment with VISION.md.**

| Source | Final Destination |
|--------|-------------------|
| `agent.ts` (top-level) | `@opendora/runtime` |
| `schedule.ts` (top-level) | `@opendora/runtime` |
| `acp/` (4 files) | `@opendora/server` |
| `command/` (3 files) | `@opendora/server` |
| `config/config.ts` | `@opendora/runtime` |
| `tool/` (41 files) | `@opendora/tools` — each tool audited to call canonical package ops |
| `plugin/` (3 files) | Stays in opencode (CLI entry-point concern) |
| `daemon/` (12 files) | Stays in opencode (systemd/launchd is CLI deployment) |
| `config/tui-schema.ts`, keybindings | Stays in opencode (TUI-specific) |

**Final state of `src/`:** `cli/`, `daemon/`, `plugin/`, `config/tui-*.ts`, `index.ts`, `preload-bindings-fix.ts`, `sql.d.ts`.

**opencode/package.json final deps:** `@opendora/runtime`, `@opendora/server`, `@opendora/storage`, `@opendora/tools`, `@opendora/util`, `@opendora/sdk` — no longer the inverse.

---

## Phase 8 — Create `apps/cli` and `apps/tui`; Delete `packages/opencode`

**After Phase 7, `opencode/src/` contains only:** `cli/`, `daemon/`, `plugin/`, `config/tui-*.ts`, `index.ts`, `preload-bindings-fix.ts`, `sql.d.ts`

| Source | Destination |
|--------|-------------|
| `src/index.ts` | `apps/cli/src/index.ts` |
| `src/cli/` (minus `cmd/tui/`) | `apps/cli/src/cli/` |
| `src/cli/cmd/tui/` | `apps/tui/src/` |
| `src/daemon/` | `apps/cli/src/daemon/` |
| `src/plugin/` | `apps/cli/src/plugin/` |

`apps/cli` depends on: `@opendora/sdk` (or `@opendora/server` directly), `@opendora/runtime`, `@opendora/util`

`apps/tui` depends on: `@opendora/sdk`, `@opentui/core`

**Delete `packages/opencode`** and remove from workspace root `package.json`.

**Exit criteria:** `opencode` binary built from `apps/cli`; TUI launches from `apps/tui`; `packages/opencode` removed from monorepo. `turbo build` succeeds. All tests pass.

---

## Cross-Cutting Rules

**Dependency order is strict:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
- Phase 3 needs `context`/`lazy` from Phase 1
- Phase 4 needs `@opendora/storage` from Phase 3
- Phase 5 needs `@opendora/storage` from Phase 3
- Phase 6 needs `Instance` from Phase 5
- Phase 8 needs opencode fully hollowed out from Phases 6/7

**Re-export redirect pattern:** When moving a file, leave a 1-line re-export at the old path. The existing `src/util/log.ts` is the model.

**`@/` path alias:** `tsconfig.json` maps `@/ → ./src/`. Never add new `@/...` imports — always use workspace package imports. Remove `paths` entries as directories empty out.

**Working state invariant:** `bun run build` and all tests pass before starting the next phase.

## Verification

For each phase:
1. `bun run typecheck` passes in both destination package and opencode
2. `bun test` passes in both packages
3. `turbo build` produces no errors across the workspace
4. opencode CLI still works: `bun run src/index.ts serve`
5. Phase 3+: `bun drizzle-kit generate` runs from `packages/storage/`
6. Phase 4+: HTTP server starts and responds to health check
7. Phase 5+: Agent session creation works end-to-end via CLI
