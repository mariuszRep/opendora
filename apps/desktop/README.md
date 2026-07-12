# apps/desktop — Projectflows Desktop App

> Tauri v2 native desktop shell for Projectflows.

**Status:** Phase 2 scaffold. The Tauri shell, sidecar launch path, and local staging script exist.

## Overview

The desktop app wraps the same statically-exported web UI produced by `apps/web` in a native
Tauri v2 shell, providing platform-native windowing, system tray, deep links, and auto-update.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  apps/desktop (Tauri v2)                        │
│  ┌───────────────────────────────────────────┐  │
│  │  WebView (frontendDist: apps/web/out)    │  │
│  │  Same UI as browser — no fork            │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  Sidecar: compiled backend binary         │  │
│  │  API server + static file serving         │  │
│  │  (recommended approach)                   │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Recommended approach: Sidecar backend

The backend binary is bundled as a Tauri sidecar. On launch, Tauri starts the backend, which
serves both the API and the static UI. The webview points at `localhost:4096`.

## Alternative: Local service

The backend runs as a separately installed system service (per Phase 1 install). The desktop
app connects to the existing `localhost:4096` service. Simpler but requires two install steps.

## Local Tauri Test

From the repo root:

```bash
# Prepare the sidecar binary and bundled resources for this OS.
bun run desktop:stage

# Launch the native Tauri app.
bun run desktop:dev
```

`desktop:dev` stages the sidecar/resources, starts Tauri dev mode, launches the bundled
Projectflows sidecar on port `4097`, waits for it to respond, then navigates the native WebView
to `http://localhost:4097`.

To avoid rebuilding the sidecar while iterating on Rust/Tauri code:

```bash
bun scripts/build-desktop.ts --dev --skip-binary
```

## Production Bundle

```bash
bun run build:desktop
```

This builds the current platform's Projectflows sidecar, copies `web.tar.gz` and `core.tar.gz`
into Tauri resources, then runs `tauri build`. On Windows this produces NSIS/MSI installers;
on Linux/macOS it produces the native bundle formats supported by the local Tauri toolchain.

## Native concerns

- Window chrome, menu bar, system tray, dock icon.
- Auto-update via Tauri updater.
- Deep-link support for `projectflows://` URLs.
- macOS notarization and Windows Authenticode signing.

## See also

- [VISION.md](./VISION.md) — desktop app vision and architecture
- [cross-platform-delivery GOAL](/.projectflows/goals/cross-platform-delivery/GOAL.md) — full delivery plan
