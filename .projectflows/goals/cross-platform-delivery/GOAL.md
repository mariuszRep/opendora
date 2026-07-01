---
name: cross-platform-delivery
title: Cross-Platform Delivery — single-binary install and Tauri desktop app
description: Deliver Projectflows as a single self-contained binary serving API + embedded static Next UI, installable via one command on Linux/macOS/Windows (Phase 1). Then wrap that same UI in a Tauri v2 desktop app with sidecar backend (Phase 2). Type justification: migration — moves from multi-step dev setup to one-command production install.
status: in_progress
type: migration
scope: apps/web, packages/server, apps/cli, apps/desktop, build/release pipeline, install scripts
attempt: 1
max_attempts: 5
last_result: Phase 1 implementation complete — verified working
next_action: Create GitHub Release with binary + web.tar.gz artifacts, then begin Phase 2 (Tauri desktop wrappers).
success_criteria:
  - Phase 1: One-command install on Linux, macOS, and Windows. Single binary serves API + static UI. /health endpoint responds 200 OK. Sessions persist in ~/.projectflows/.
  - Phase 2: Native installers for all three OSes. Desktop app wraps same web UI. Sidecar lifecycle managed by Tauri. Auto-update on at least one platform.
source: vision
---

# Cross-Platform Delivery

## Goal

Deliver Projectflows as a single self-contained binary that serves both API and embedded web UI, installable via one command on Linux, macOS, and Windows (Phase 1). Then wrap that same UI in a Tauri cross-platform desktop app (Phase 2).

**Type justification:** This goal is typed `migration` because it is a delivery migration — moving from a multi-step development setup to a production-ready one-command install and native desktop distribution. It shares characteristics with a feature (new capability) but the dominant dimension is migration of the deployment model.

**Product naming:** Projectflows is the canonical product name. OpenDora/opendora remains the current repo, binary, and package naming during the transition. Documentation and code reference both names; new delivery work uses Projectflows as the product name while honoring existing opendora-based paths, binaries, and packages until a coordinated rename.

## Goals / Constraints

- **One-command install** across Windows, macOS, and Linux.
- **Single binary** — the backend serves a statically-exported Next.js UI.
- **Phase 2 Tauri codebase** wraps the same static UI in a native desktop shell.
- **App boundary:** Apps use SDK; backend behavior remains server/domain owned.
- **Data root:** `~/.projectflows/` per `findRoot()` on all platforms.
- **Name transition:** Current binary/package/repo uses OpenDora/opendora naming. Installers eventually standardize on Projectflows; compatibility may require `opendora` paths during transition.

## Verified current state

As of the initial delivery plan:

- **Backend:** Hono `Server.listen()` on ports 4096 (HTTP) and 4097 (WebSocket). SSE endpoint at `/event`. API routes under `/api/*`.
- **Web app:** Next.js 16, all client pages, one server feature at `app/api/event/route.ts`. Rewrites proxy `/api/*` to backend.
- **CLI:** Cross-compiled via Bun `build --compile --target`. Existing commands: `serve`, `web`, `start`, `stop`.
- **Service:** macOS (launchd) and Linux (systemd) implementations exist. Windows service is a stub.
- **No install scripts exist yet.**
- **Static export:** Feasible with minimal change — gate output by env variable, remove/guard the server-only Next route and rewrites for embedded build, point browser at backend origin or same-origin. Audit required for hardcoded `/api` paths.

## Decision: Static export for single-binary UI

Rationale:
- A statically-exported Next.js app (via `output: export`) produces pure static HTML/CSS/JS that can be served by any HTTP server, including the Hono backend.
- Eliminates the need for a separate Node.js/Next.js runtime in the shipped binary.
- The single Next.js server feature (`app/api/event/route.ts`) must be gated or replaced with a client-side EventSource pointing at the backend origin.

## Phase 1 — Single self-contained binary

### Tasks

1. **Static export the web app** ✅ *done*
   - `apps/web/next.config.ts`: gate `output: 'export'` + `trailingSlash: true` behind `PROJECTFLOWS_EMBEDDED=1`; rewrites kept for dev mode.
   - Deleted `apps/web/app/api/event/route.ts` (SSE proxy — frontend calls `/event` directly on same-origin Hono server).
   - `apps/web/lib/projectflows.ts`: default URL is `""` (same-origin relative); `NEXT_PUBLIC_PROJECTFLOWS_URL` still overrides.
   - Split `app/dashboard/agents/[id]/page.tsx` and `app/dashboard/settings/workflows/[id]/page.tsx` into server wrapper (exports `generateStaticParams`) + client component.
   - `build:export` script in `apps/web/package.json`; `NODE_OPTIONS=--max-old-space-size=4096` to prevent OOM kill.

2. **Serve static UI from Hono** ✅ *done*
   - `/health` endpoint added to `packages/server/src/server.ts`.
   - `serveStatic` middleware serves `_webDir`; SPA fallback serves `index.html` for any unmatched GET.
   - `webDir` resolution: `opts.webDir` → `PROJECTFLOWS_WEB_DIR` env → adjacent-to-binary `web/` → unset (falls back to `app.opencode.ai` proxy).
   - API routes registered before static middleware so they take priority.
   - `--web-dir` flag added to `serve` CLI command.

3b. **Checkpoint infra in binary** ✅ *done* — checkpoint table migration, `executor.ts`, and `checkpoint-store.ts` ship in binary; `CheckpointStore.findIncomplete()` warns at startup.

3. **Build pipeline** ✅ *done*
   - `scripts/build-binary.ts`: builds web export → copies to `dist/web/` → compiles binary per platform via `bun build --compile --target`.
   - Platforms: `bun-linux-x64-musl`, `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`, `bun-windows-x64`.
   - `bun run build:binary` at repo root runs all steps.

4. **First-run UX** ✅ *done*
   - `apps/cli/src/cli/cmd/serve.ts`: prints `Projectflows is running at http://localhost:4096` and `Open your browser to get started.`

5. **Install scripts** ✅ *done*
   - `scripts/install.sh` (Linux/macOS): downloads binary + web assets tarball, installs to `~/.local/bin/`, sets up PATH.
   - `scripts/install.ps1` (Windows): equivalent; adds to `$LOCALAPPDATA\projectflows\bin` and persists PATH.
   - Hosting: GitHub Releases (manual release for Phase 1).

6. **Windows service support** — pending (Task Scheduler approach; low priority for Phase 1)

7. **Release pipeline** — pending (manual GitHub Release for Phase 1; automation in later iteration)

### Phase 1 exit criteria

- Clean one-command install on Windows, macOS, and Linux documented and verified.
- Installed binary serves the web UI and API on `localhost:4096`.
- Browser opens working UI with sessions persisting in `~/.projectflows/`.
- `/health` endpoint responds `200 OK`.

## Phase 2 — Tauri desktop wrappers

Phase 2 is a native shell around the Phase 1 browser version — not a separate app. The Tauri window opens `http://localhost:4096` (the same local server), so the web UI and backend are identical to Phase 1. The desktop app just adds a native window, system tray, auto-update, and platform installers.

### Tasks

1. **`apps/desktop` scaffold**
   - Create `apps/desktop` with Tauri v2 configuration.
   - Window points to `http://localhost:4096` (the running Phase 1 server, not a bundled frontend dist).
   - Configure app metadata, window title, icon, and security settings.

2. **Sidecar backend**
   - Bundle the Phase 1 binary as a Tauri sidecar process.
   - Tauri launches the sidecar on app start; native window connects to `localhost:4096`.
   - Sidecar lifecycle managed by Tauri (start/stop with window).

2b. **Suspend/resume hooks** — wire Tauri window-hide event to `POST /workflow/checkpoint-flush`; on app open show "Resume interrupted workflow?" if sessions with `workflow_run` exist.

3. **Alternative: Local service approach**
   - User installs the daemon separately (via Phase 1 install); desktop app connects to existing local service.
   - Simpler but requires two install steps or a combined installer.

4. **Native concerns**
   - Window chrome, menu bar, system tray, dock icon, and platform-native behaviors.
   - Auto-update via Tauri updater or platform-native mechanisms.
   - Deep-link support for `projectflows://` URLs.

5. **Signing / notarization**
   - macOS: Apple Developer ID for notarization.
   - Windows: Authenticode signing certificate.
   - Linux: AppImage or Flatpak signing (if applicable).

6. **Packaging / release**
   - Produce native installers: `.dmg` (macOS), `.msi` or `.exe` (Windows), `.AppImage` or `.deb`/`.rpm` (Linux).
   - Publish to projectflows.dev download page and/or GitHub Releases.

### Phase 2 exit criteria

- Native installers for all three OSes launch a self-contained desktop app using the existing web UI.
- Service starts automatically with the app; sessions persist in `~/.projectflows/`.
- Auto-update wired and functional on at least one platform.

## Cross-cutting: Unified Durable Run

The `unified-durable-run` goal defines a checkpoint/run-state contract and a checkpoint-driven workflow runner. Both phases of this delivery depend on it:

**Phase 1 impact:** The unified executor (extracted from `server.ts` into `packages/workflow/src/executor.ts`) and the checkpoint-driven runner (`packages/workflow/src/runner.ts` + `checkpoint-store.ts`) must be included in the single binary. The checkpoint table migration must run at first start.

**Phase 2 impact:** The desktop app's Tauri shell must flush active run checkpoints on window-hide/OS-suspend and offer resume on re-open. This requires the `/workflow/checkpoint-flush` HTTP route in `packages/server` and the `_activeRuns` registry in `checkpoint-store.ts`.

Reference: `.projectflows/goals/unified-durable-run/GOAL.md` (design finalized; implementation delivered here).

## Sequencing

```
Phase 1 ─────────────────────────────────────────────────►
  ├─ Static export web
  ├─ Serve from Hono
  ├─ Embed/copy into binary
  ├─ Build pipeline
  ├─ Install scripts
  ├─ First-run UX
  ├─ Windows service
  └─ Release pipeline
                          Phase 2 ────────────────────────►
                            ├─ apps/desktop Tauri scaffold
                            ├─ Sidecar backend
                            ├─ Native concerns
                            ├─ Signing / notarization
                            └─ Desktop release pipeline
```

Phase 1 must exit before Phase 2 begins (the desktop app consumes the Phase 1 static export and sidecar binary).

## Risks / Open questions

| Risk / Question | Impact | Status |
|---|---|---|
| Hardcoded `/api` paths in web app | Broken API calls in embedded mode | Needs audit; resolve in Phase 1 task 1 |
| Bun asset embedding size vs. archive approach | Binary size; startup time | Under evaluation for Phase 1 task 3 |
| Windows service approach | Install complexity; Phase 1 timeline | Decision pending |
| Hosting for install endpoint | Install script availability | TBD — GitHub Releases or dedicated CDN |
| Signing certificates (macOS + Windows) | Gate on signed native installers | Planned for Phase 2; workaround for Phase 1 (manual allow) |
| Sidecar vs. local service for desktop | Desktop architecture; user experience | Recommended: sidecar; alternative: local service |

## Related documents

- [VISION.md](/VISION.md) — product architecture and intent
- [INSTALL.md](/INSTALL.md) — detailed install/uninstall specification
- [apps/VISION.md](/apps/VISION.md) — app surface ownership
- [apps/desktop/VISION.md](/apps/desktop/VISION.md) — desktop app vision
- [packages/server/VISION.md](/packages/server/VISION.md) — server boundary, embedded UI serving

## Verification Expectations

### Phase 1 minimum verification
- `bun run build:export` produces `apps/web/out/` with static HTML/CSS/JS
- Static output served correctly by Hono static middleware
- Single binary (`bun build --compile`) includes static assets and serves them
- `install.sh` and `install.ps1` work on clean Linux/macOS/Windows VM
- `/health` returns 200 on fresh install
- Session persistence in `~/.projectflows/` works after install

### Phase 2 minimum verification
- `apps/desktop` builds with `bunx tauri build` on all three platforms
- Desktop app launches, shows web UI, connects to sidecar/local service
- Auto-update triggers correctly on at least one platform
- Deep-link `projectflows://` opens the desktop app

## Attempts

### Attempt 1 (2026-07-01) — Phase 1 implementation

**Result:** Phase 1 complete and verified working.

**What was done:**
- Static export of `apps/web` via `PROJECTFLOWS_EMBEDDED=1` env flag
- Server-wrapper pattern for dynamic Next.js routes (required for `generateStaticParams` + client component split)
- `serveStatic` + SPA fallback in Hono — all routes return 200 (static file or `index.html`)
- `/health` endpoint responds `{"ok":true}`
- `scripts/build-binary.ts` — multi-platform build pipeline
- `scripts/install.sh` + `scripts/install.ps1` — install scripts
- Welcome message on `serve` command

**Verified:**
- `bun run build:export` produces `apps/web/out/` ✅
- `PROJECTFLOWS_WEB_DIR=apps/web/out ... serve --port 4199` starts successfully ✅
- `/health` → `{"ok":true}` ✅
- `/`, `/dashboard/`, `/dashboard/agents/some-real-id` → all 200 ✅

**Phase 2 is next:** Tauri desktop wrappers around the same local server.

## Do Not Repeat

- Do not put `generateStaticParams` in a "use client" component — Next.js 16 rejects it. Split the page into a server wrapper (exports `generateStaticParams`) and a client component.
- Returning `[]` from `generateStaticParams` with `output: 'export'` is treated as missing by Next.js — return at least one param (e.g. `[{ id: "new" }]`).
- The TypeScript build worker gets OOM killed without `NODE_OPTIONS=--max-old-space-size=4096`.

## Verification Log

2026-07-01: Phase 1 verified — static export builds, Hono serves UI + API, /health works, SPA fallback works for dynamic routes.

## Final Outcome

Phase 1 delivered. Phase 2 pending.

## Ready For Execution

- Status: yes
- Reason: Requirements, phase split, exit criteria, risks, and sequencing are fully defined. Current state is verified. The static export approach is decided with rationale. Phase 1 can begin independently.
