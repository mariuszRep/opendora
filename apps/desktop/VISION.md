# VISION.md — apps/desktop

> Owner: human. Approved intent only.
>
> **Naming note:** Projectflows is the canonical product direction. This document uses
> Projectflows as the product name.
>
> **Direction change:** The desktop shell direction changed from Tauri v2 to Electron.
> See `.projectflows/goals/done/shared-static-export-release-foundation/GOAL.md` (shared
> static-export/release contract) and
> `.projectflows/goals/ready/electron-desktop-wrapper-and-updates/GOAL.md` (Electron
> migration). The existing Tauri v2 implementation under `apps/desktop/src-tauri/` is real
> and functional; it stays in place until the Electron replacement has equivalent verified
> coverage — see "Current implementation (historical)" below. Do not add new Tauri
> features; the approved target is Electron.

## Intent

`apps/desktop` contains the Projectflows native desktop application — an Electron shell
that wraps the same statically-exported web UI produced by `apps/web`.

## Owns

- Electron main/preload/renderer shell and native window configuration.
- Desktop-specific presentation: window chrome, menu bar, system tray, dock icon, and
  platform-native behaviors.
- Local backend process lifecycle (start/stop/restart) from the Electron main process.
- Auto-update integration via `electron-updater` against GitHub Releases.
- Deep-link protocol handling (`projectflows://`).
- Desktop release packaging (installer formats and signing are defined by
  `electron-desktop-wrapper-and-updates`).

## Does Not Own

- Web UI content, routing, or components (owned by `apps/web`).
- Backend behavior, API routes, or domain logic (owned by `packages/server` and domain packages).
- SDK contracts or API definitions (owned by `packages/sdk`).
- Install scripts or system-level daemon/service management (shared with root-level delivery).

## Relationships

```
apps/desktop (Electron shell)
  ─ renderer ─────> apps/web/out (static export)
  ─ main process ─> local backend (packages/server)
  ─ SDK ──────────> packages/sdk
```

The desktop app is a native container. It does not duplicate or replace any application
logic; it provides the native windowing and OS integration layer while the web UI and
backend remain the same as the browser-based experience.

## Boundary Rules

- Desktop app must use the same statically-exported web UI from `apps/web` — no separate UI
  implementation.
- Renderer code is sandboxed/context-isolated and reaches desktop-native capabilities only
  through an explicit preload API — no unrestricted Node/Electron access from the renderer.
- Desktop app follows the same app rules as `apps/web` and `apps/cli`: uses SDK for backend
  communication, does not import backend/domain internals.
- Desktop-specific concerns (native menus, tray, notifications, deep links) live in
  `apps/desktop` and must not leak into shared UI or backend packages.
- Reuse UI components between embedded web and desktop where feasible; do not fork the UI.

## Current implementation (historical — Tauri v2, being migrated)

The sections below describe the Tauri v2 implementation that exists in
`apps/desktop/src-tauri/` today (sidecar backend, tray, first-run extraction — see
`.projectflows/goals/blocked/cross-platform-delivery/GOAL.md` for its verified state). They
record current code, not approved future direction, and are retired once
`electron-desktop-wrapper-and-updates` delivers equivalent, verified Electron coverage.

### Recommended: Sidecar backend

Bundle the compiled binary as a Tauri sidecar. The Tauri runtime:
- Starts the backend process when the desktop app launches.
- Passes necessary environment (port, data root, auth token).
- Stops the process when the window closes.
- Manages lifecycle, restart, and crash recovery.

### Alternative: Local service

User installs the daemon via the Phase 1 one-command install; desktop app connects to the
existing local service at `localhost:4096`. This avoids a bundled sidecar but requires two
install steps or a combined installer.

### Prerequisites (Tauri, historical)

- Phase 1 static export pipeline is producing `apps/web/out/`.
- Phase 1 binary is buildable for the target platforms.
- Tauri v2 CLI and Rust toolchain are available in the build environment.
- Signing certificates are obtained for macOS (Apple Developer ID) and Windows (Authenticode).
- Auto-update infrastructure (server endpoint, signing keys) is prepared.

### Release packaging (Tauri, historical)

| Platform | Format | Signing |
|---|---|---|
| macOS | `.dmg` | Apple Developer ID notarization |
| Windows | `.msi` or `.exe` installer | Authenticode |
| Linux | `.AppImage`, `.deb`, `.rpm` | GPG (optional) |

## See also

- [apps/desktop/README.md](/apps/desktop/README.md) — desktop app quick reference
- [cross-platform-delivery GOAL](/.projectflows/goals/blocked/cross-platform-delivery/GOAL.md) — historical Tauri delivery record
- [shared-static-export-release-foundation GOAL](/.projectflows/goals/done/shared-static-export-release-foundation/GOAL.md)
- [electron-desktop-wrapper-and-updates GOAL](/.projectflows/goals/ready/electron-desktop-wrapper-and-updates/GOAL.md)
- [apps/VISION.md](/apps/VISION.md) — app surface ownership
- [packages/server/VISION.md](/packages/server/VISION.md) — server boundary, embedded UI serving
