# VISION.md — packages/sdk

> Owner: human. Approved intent only.

## Intent

The SDK is the typed client boundary used by apps and external consumers to communicate with the Projectflows server.

## Owns

- API client construction and configuration.
- Typed request/response methods over server endpoints backed by package-owned canonical operations, including notification typed methods (publish, list, read, resolve, dismiss, history).
- Transport concerns such as base URL, auth headers, streaming helpers, and normalized API errors.

## Does Not Own

- Backend business rules.
- Runtime orchestration.
- Storage access.
- Direct domain package imports.

## Depends On

- Server API contracts.

## Used By

- Web app.
- Electron app.
- CLI.
- Future external integrations.

## Boundary Rules

- Apps call the SDK instead of hand-writing server calls.
- SDK talks to server APIs only.
- SDK methods are app-facing wrappers over canonical package operations exposed through the server.
