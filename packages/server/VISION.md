# VISION.md — packages/server

> Owner: human. Approved intent only.

## Intent

The server is the API/service boundary that keeps OpenDora reachable and exposes backend behavior to the SDK.

## Owns

- HTTP/WebSocket/API routes and streaming surfaces.
- Request validation and response shaping.
- Auth and permission enforcement at the service boundary.
- Coordination of auth, permission, runtime, and domain services.
- API contracts exposed to the SDK.
- Server endpoints that wrap package-owned canonical operations.

## Does Not Own

- Identity storage rules beyond calling auth.
- Authorization policy beyond calling permission.
- Execution internals owned by runtime.
- Domain behavior owned by domain packages.
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
- Server keeps the OpenDora service/API reachable; runtime keeps executable work alive.
- Server starts, continues, streams, or cancels executable work by calling runtime-owned operations.
- Server coordinates domains; it does not absorb their ownership.
- Server routes must call package-owned canonical operations rather than reimplementing domain behavior.
