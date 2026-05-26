# VISION.md — packages/server

> Owner: human. Approved intent only.

## Intent

The server is the public backend API boundary for OpenDora.

## Owns

- HTTP/WebSocket/API routes.
- Request validation and response shaping.
- Coordination of auth, permission, runtime, and domain services.
- API contract exposed to the SDK.
- Server endpoints that wrap package-owned canonical operations.

## Does Not Own

- Identity storage rules beyond calling auth.
- Authorization policy beyond calling permission.
- Execution internals owned by runtime.
- Physical persistence owned by storage.

## Depends On

- auth
- permission
- runtime
- domain packages as needed

## Used By

- SDK.

## Boundary Rules

- Server is the only backend surface the SDK talks to.
- Server coordinates domains; it does not absorb their ownership.
- Server routes must call package-owned canonical operations rather than reimplementing domain behavior.
