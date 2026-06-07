# VISION.md — apps

> Owner: human. Approved intent only.

## Intent

`apps/` contains OpenDora user-facing applications.

## Owns

- Web UI.
- CLI.
- TUI.
- Application-specific presentation, interaction, navigation, and user experience logic.

## Does Not Own

- Backend business behavior.
- Domain package internals.
- Runtime execution internals.
- Physical persistence.
- Direct storage access.

## Relationships

- Apps use `sdk` as their only OpenDora backend gateway.
- Apps may contain UI-specific state and presentation logic.
- Shared product behavior belongs behind SDK/server/package contracts.

## Boundary Rules

- Web, CLI, and TUI live under `apps/`.
- Apps call SDK methods instead of hand-writing server calls or importing backend packages.
- Apps must not duplicate package-owned domain behavior.
- Apps must not bypass server auth, permission, validation, or runtime coordination.
