# VISION.md — apps/desktop

> Owner: human. Approved intent only.
>
> **Naming note:** Projectflows is the canonical product direction; OpenDora/opendora remains
> the current repo, binary, and package naming during transition. This document uses
> Projectflows as the product name.

## Intent

`apps/desktop` contains the Projectflows native desktop application — a Tauri v2 cross-platform
shell that wraps the same statically-exported web UI produced by `apps/web`.

## Owns

- Tauri v2 shell and native window configuration.
- Desktop-specific presentation: window chrome, menu bar, system tray, dock icon, and
  platform-native behaviors.
- Sidecar lifecycle management for the backend binary (recommended approach).
- Auto-update integration via Tauri updater or platform-native mechanisms.
- Deep-link protocol handling (`projectflows://`).
- Desktop release packaging: `.dmg` (macOS), `.msi`/`.exe` (Windows), `.AppImage`/`.deb`/`.rpm`
  (Linux).

## Does Not Own

- Web UI content, routing, or components (owned by `apps/web`).
- Backend behavior, API routes, or domain logic (owned by `packages/server` and domain packages).
- SDK contracts or API definitions (owned by `packages/sdk`).
- Install scripts or system-level daemon/service management (shared with root-level delivery).

## Relationships

```
apps/desktop (Tauri shell)
  ─ frontendDist ─> apps/web/out (static export)
  ─ sidecar ──────> compiled binary (packages/server)
  ─ SDK ──────────> packages/sdk
```

The desktop app is a native container. It does not duplicate or replace any application logic;
it provides the native windowing and OS integration layer while the web UI and backend remain
the same as the browser-based experience.

## Boundary Rules

- Desktop app must use the same statically-exported web UI from `apps/web` — no separate UI
  implementation.
- The backend runs as a Tauri sidecar process (recommended) or connects to an existing local
  service (alternative).
- Desktop app follows the same app rules as `apps/web` and `apps/cli`: uses SDK for backend
  communication, does not import backend/domain internals.
- Desktop-specific concerns (native menus, tray, notifications, deep links) live in
  `apps/desktop` and must not leak into shared UI or backend packages.
- Reuse UI components between embedded web and desktop where feasible; do not fork the UI.

## Architecture notes

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

## Prerequisites

Before implementation, ensure:
- Phase 1 static export pipeline is producing `apps/web/out/`.
- Phase 1 binary is buildable for the target platforms.
- Tauri v2 CLI and Rust toolchain are available in the build environment.
- Signing certificates are obtained for macOS (Apple Developer ID) and Windows (Authenticode).
- Auto-update infrastructure (server endpoint, signing keys) is prepared.

## Release packaging

| Platform | Format | Signing |
|---|---|---|
| macOS | `.dmg` | Apple Developer ID notarization |
| Windows | `.msi` or `.exe` installer | Authenticode |
| Linux | `.AppImage`, `.deb`, `.rpm` | GPG (optional) |

## See also

- [apps/desktop/README.md](/apps/desktop/README.md) — desktop app quick reference
- [cross-platform-delivery GOAL](/.projectflows/goals/cross-platform-delivery/GOAL.md) — full delivery plan
- [apps/VISION.md](/apps/VISION.md) — app surface ownership
- [packages/server/VISION.md](/packages/server/VISION.md) — server boundary, embedded UI serving
