# SCOPE.md

## What this package is

`packages/sdk/js` is the TypeScript SDK package for consuming OpenDora APIs.

## What this package owns

- exported SDK entry points
- SDK build and publish scripts
- generated client code committed in this package

## What this package does not own

- the server implementation
- web UI concerns
- non-SDK runtime orchestration

## Boundaries

- Runtime API behavior is owned upstream by `packages/opencode`.
- This package translates API definitions into consumable TypeScript client/server interfaces.
