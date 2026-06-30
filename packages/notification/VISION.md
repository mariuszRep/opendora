# VISION.md — packages/notification

> Owner: human. Approved intent only.

## Intent

Notification owns durable, object-driven notification records for system events surfaced to users across Projectflows surfaces. It is a modular, persistent domain package that produces cross-linked records from system errors, tool errors, provider issues, tool access/permission requests, workflow/run blockers, memory/status events, and similar system events.

## Owns

- Notification object model and lifecycle: create, read, update (resolve), list, dismiss.
- A single canonical publish/create function that accepts a restricted but extensible notification object schema.
- Cross-linked notification context: permission request location, session, message, tool call, provider/settings, and workflow/run.
- Action-required tracking and resolved/dismissed lifecycle states.
- Notification history surfaced through SDK and server routes.

## Does Not Own

- Authorization or permission lifecycle.
- Domain execution logic for agents, tools, workflows, sessions, providers, schedules, or skills.
- Physical persistence backend choice.
- User identity or auth.

## Depends On

- storage for persisted notification records.
- server for route exposure.
- sdk for typed client methods.

## Used By

- server
- runtime
- apps (web UI, CLI)
- permission (for permission-request notification retention)
- any package that produces user-facing system events

## Boundary Rules

- Notification exposes one canonical publish/create function; all notification-producing surfaces must use this single entry point instead of writing notification records directly.
- Notifications are cross-linked to their origin: each record carries references to the session, message, tool call, provider, permission request, or workflow/run that produced it.
- Permission owns authorization decisions and permission lifecycle. Notification retains permission-request records as user-facing notification history after the user replies, marked as resolved/rejected/allowed and removed from the action-required count.
- Notifications persist through storage contracts only; notification never chooses or directly accesses a physical backend.
- Notification records are modular: the object schema is restricted by type but extensible for additional event categories.

## Canonical Operations

Notification tools, SDK routes, server endpoints, runtime flows, and package integrations must use the package-owned notification operations for publish, list, read, resolve, dismiss, and history queries.
