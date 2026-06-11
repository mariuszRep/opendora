# VISION.md — packages

> Owner: human. This document records approved package-boundary intent only.
> It is not a migration plan, roadmap, checklist, or implementation status.

## Intent

`packages/` contains the backend and client package boundaries for OpenDora.
Each package owns one product/domain boundary and communicates through explicit public interfaces, not internal file imports.

## Target flow

```text
apps
  -> sdk
    -> server
      -> auth
      -> permission
      -> runtime
        -> agent
        -> skills
        -> provider
        -> tools
        -> workflow
        -> schedule
        -> session

agent      -> storage
auth       -> storage
permission -> storage
provider   -> storage
skills     -> storage
tools      -> storage
workflow   -> storage
schedule   -> storage
session    -> storage
```

## Boundary rules

- Apps use the SDK; apps do not depend on backend internals.
- SDK talks to the server API only; SDK owns no backend business behavior and does not read storage directly.
- Server is the API/service boundary: it keeps OpenDora reachable, validates requests, applies auth/permission, exposes SDK-facing routes/streams, and coordinates package-owned operations.
- Auth identifies the caller.
- Permission decides what the caller may do across domains.
- Runtime is the execution engine: it keeps executable work alive and orchestrates agent runs, skills, providers, tools, workflows, schedules, sessions, streaming, cancellation, retries, and run lifecycle.
- Session is the universal execution ledger and run-capture format for agent runs, workflow runs, schedule-triggered runs, and other executable work. A run is one durable, resumable, event-sourced execution; a conversation is the simplest workflow and any conversation may be transformed into a reusable workflow.
- Domain packages own their domain behavior and expose canonical operations for their entities.
- Storage is the only persistence boundary. Packages that need durable data use storage contracts instead of choosing JSON, SQLite, Postgres, files, or another backend directly.

## Canonical Operations

Managed packages expose canonical domain operations as the single source of behavior.
SDK/API routes, LLM tools, runtime flows, and approved package integrations must reuse those operations instead of duplicating domain logic.

```text
UI/app -> SDK -> server route -> canonical package operation
LLM tool -> host/runtime/server -> same canonical package operation
runtime/internal flow -> same canonical package operation where allowed
```

Tools are an LLM-facing access surface. SDK methods are an app-facing access surface. Both must converge on the same package-owned operation.
