# SCOPE.md

## What this package is

`packages/util` is a shared utility package for low-level helpers reused across the monorepo.

## What this package owns

- generic utility modules exported from `src/`

## What this package does not own

- CLI behavior
- API contracts
- UI components
- package-specific business rules

## Boundaries

- Keep abstractions here generic enough to be shared by multiple packages.
