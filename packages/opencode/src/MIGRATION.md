# opencode/src Migration Plan

Decompose `@opendora/opencode` into the canonical packages defined by VISION.md.
After migration this package becomes a thin CLI wrapper (`cli/`, `daemon/`, `index.ts`) that imports from properly structured domain packages.

---

## Status: Phase 8 — Final deletion of `packages/opencode`

**All Phases 1–7 are complete.** Every domain module has been moved to its canonical `@opendora/*` package; all files remaining in `packages/opencode/src/` (outside `cli/`, `daemon/`, `util/color|keybind|rpc`, `index.ts`, `sql.d.ts`, `preload-bindings-fix.ts`) are 1-line re-export redirects.

**`apps/cli` already exists** (`packages/opencode` is no longer its source). `apps/cli/src/` uses direct `@opendora/*` imports throughout. Zero external packages depend on `@opendora/opencode`.

---

## ✅ Phase 1 — Promote Pure Utilities to `@opendora/util`

All 13 files moved. `src/util/` files are re-export redirects or TUI-specific originals.

---

## ✅ Phase 2 — Move Bus Event Types to `@opendora/util`

`BusEvent` and `GlobalBus` exported from `@opendora/util`. `bus/bus-event.ts` and `bus/global.ts` are re-export redirects.

---

## ✅ Phase 3 — Create `@opendora/storage`

All storage, schema, and SQL files moved. `packages/storage/` has package.json + all migrations. opencode imports are redirects.

---

## ✅ Phase 4 — Create `@opendora/server`

All server files (server.ts + all 19 routes + configure-session-core, error, event, mdns) moved to `packages/server/`. All `src/server/` files are re-export redirects.

---

## ✅ Phase 5 — Create `@opendora/runtime`

`Instance`, `Project`, `State`, `Bus`, `Scheduler`, `Snapshot`, `Env`, `Worktree` all exported from `@opendora/runtime`. All `src/project/`, `src/bus/`, `src/scheduler/`, `src/snapshot/`, `src/worktree/` files are re-export redirects.

---

## ✅ Phase 6 — Domain Module Consolidation

| Source | Destination | Status |
|--------|-------------|--------|
| `lsp/` (4 files) | `@opendora/server/lsp/` | ✅ |
| `mcp/` (4 files) | `@opendora/server/mcp/` | ✅ |
| `ide/index.ts` | `@opendora/server/ide` | ✅ |
| `pty/index.ts` | `@opendora/server/pty` | ✅ |
| `auth/` (2 files) | `@opendora/auth` | ✅ |
| `control/index.ts` | `@opendora/storage` | ✅ |
| `question/index.ts` | `@opendora/runtime` | ✅ |
| `format/` (2 files) | `@opendora/runtime` | ✅ |
| `skill/` (3 files) | `@opendora/skills` | ✅ |
| `file/watcher.ts`, `file/time.ts` | `@opendora/tools` | ✅ |
| `permission/next.ts` | `@opendora/permission` | ✅ |
| `share/share-next.ts` | `@opendora/session` | ✅ |

All items complete. All original `src/` paths are re-export redirects.

---

## ✅ Phase 7 — Final CLI Cleanup

| Source | Final Destination | Status |
|--------|-------------------|--------|
| `agent.ts` | `@opendora/runtime/agent` | ✅ redirect |
| `schedule.ts` | `@opendora/schedule/service` | ✅ redirect |
| `acp/` (4 files) | `@opendora/server/acp/*` | ✅ redirects |
| `command/index.ts` | `@opendora/server/command` | ✅ redirect |
| `config/` (all 6 files) | `@opendora/config/*` | ✅ redirects (including tui-schema, tui) |
| `tool/` (9 files) | `@opendora/tools/*` | ✅ redirects |
| `session/` (8 files) | `@opendora/session/*` | ✅ redirects |
| `permission/index.ts` | — dead code; replaced by `PermissionNext` in `@opendora/permission/next` | ✅ delete |
| `plugin/` (3 files) | Stays in opencode → `apps/cli` | — in apps/cli |
| `daemon/` (12 files) | Stays in opencode → `apps/cli` | — in apps/cli |
| `cli/` | Already in `apps/cli/src/cli/` with updated imports | — in apps/cli |

**`permission/index.ts` note:** The 210-line `Permission.ask/respond` namespace is **not imported** by any file in `apps/cli` or any `@opendora/*` package. Runtime permission handling is fully handled by `PermissionNext` in `@opendora/permission/next`. Delete the file; no redirect needed.

---

## 🔴 Phase 8 — Delete `packages/opencode`

`apps/cli` is the new canonical CLI package (`@opendora/cli`). It is already:
- In the workspace (`apps/*` glob in root `package.json`)
- Using direct `@opendora/*` imports (no `@/` aliases, no `@opendora/opencode` dep)
- Wired in turbo (`@opendora/cli#test` exists in `turbo.json`)

Zero external packages or source files import from `@opendora/opencode`.

### Deletion checklist

1. **Delete `packages/opencode/src/permission/index.ts`** — dead code, no callers outside opencode itself
2. **Remove `"packages/opencode"` from `workspaces.packages`** in root `package.json`
3. **Delete `packages/opencode/`** directory from the repo
4. **Run `bun install`** — updates `bun.lock` to remove `@opendora/opencode` entries
5. **Run `bun turbo typecheck`** — verify zero errors across workspace
6. **Run `bun turbo build`** — verify `@opendora/cli` builds and all other packages build
7. **Smoke-test CLI** — `./apps/cli/bin/opencode --version` or equivalent

### What lives in `apps/cli` permanently

| Path | Reason |
|------|--------|
| `src/cli/` | CLI commands and TUI |
| `src/daemon/` | systemd/launchd deployment |
| `src/plugin/` | CLI entry-point plugin loading |
| `src/util/color.ts` | ANSI terminal escapes — TUI-only, no @opendora/util equivalent |
| `src/util/keybind.ts` | Depends on `@opentui/core` — TUI-only |
| `src/util/rpc.ts` | Web Worker RPC for TUI threads — TUI-only |
| `src/index.ts` | CLI entry point |
| `src/sql.d.ts` | Bun SQL type declaration |
| `src/preload-bindings-fix.ts` | Runtime binding fix |

---

## Verification (Phase 8)

1. `bun turbo typecheck` passes across all packages (no @opendora/opencode in dependency graph)
2. `bun turbo build` succeeds
3. `bun test` passes in `apps/cli` and all other packages
4. CLI binary works: `./apps/cli/bin/opencode serve`
5. HTTP server starts and responds to health check
6. Agent session creation works end-to-end via CLI
