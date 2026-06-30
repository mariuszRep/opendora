# apps/desktop — Projectflows Desktop App

> Tauri v2 native desktop shell for Projectflows.

**Status:** Phase 2 — not yet implemented. This directory contains docs/spec only.

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

## Getting started (when implementation begins)

```bash
# Prerequisites: Rust toolchain, Tauri CLI
cargo install tauri-cli --version "^2"

# Build the web UI static export first
cd apps/web && bun run build:export && cd ../..

# Run desktop app in dev mode
cd apps/desktop && bunx tauri dev

# Build for production
cd apps/desktop && bunx tauri build
```

## Native concerns

- Window chrome, menu bar, system tray, dock icon.
- Auto-update via Tauri updater.
- Deep-link support for `projectflows://` URLs.
- macOS notarization and Windows Authenticode signing.

## See also

- [VISION.md](./VISION.md) — desktop app vision and architecture
- [cross-platform-delivery GOAL](/.projectflows/goals/cross-platform-delivery/GOAL.md) — full delivery plan
