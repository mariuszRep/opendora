# VISION.md — packages/server

> Owner: human. Approved intent only.

## Intent

The server is the API/service boundary that keeps Projectflows reachable and exposes backend behavior to the SDK. For single-binary distribution, the server also serves the embedded statically-exported web UI without shadowing API or event routes.

Server exposes the unified discovery/index API for catalog-managed entities and plugins. Initial route implementations may adapt existing entity and plugin routes, but the durable contract is one coherent discovery surface for agents, skills, tools, workflows, and plugins with install state, source provenance, and catalog metadata.

The server exposes plugin management APIs — plugin install, uninstall, list, update, and resolution — as part of its route surface. These routes wrap core-owned plugin operations. The server does not own plugin lifecycle internals.

## Owns

- HTTP/WebSocket/API routes and streaming surfaces.
- Request validation and response shaping.
- Auth and permission enforcement at the service boundary.
- Coordination of auth, permission, runtime, and domain services.
- API contracts exposed to the SDK.
- Server endpoints that wrap package-owned canonical operations.
- Serving embedded statically-exported web UI for single-binary distribution (Phase 1), via static file middleware or embedded asset serving, without shadowing API or event routes.

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
- Server keeps the Projectflows service/API reachable; runtime keeps executable work alive.
- Server starts, continues, streams, or cancels executable work by calling runtime-owned operations.
- Server coordinates domains; it does not absorb their ownership.
- Server routes must call package-owned canonical operations rather than reimplementing domain behavior.
- When serving embedded static UI, server must not shadow API routes (`/api/*`) or event streams (`/event`). The static file middleware applies only after API/event route matching.
- Embedded static UI serving is for single-binary distribution only. The SDK and external clients continue to use the server via API routes as before.
