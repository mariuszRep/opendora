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

agent     -> storage
skills    -> storage
provider  -> storage
tools     -> storage
workflow  -> storage
schedule  -> storage
session   -> storage
```

## Boundary rules

- Apps use the SDK; apps do not depend on backend internals.
- SDK talks to the server API; SDK owns no backend business behavior.
- Server is the public API boundary and coordinates auth, permission, and runtime.
- Auth identifies the caller.
- Permission decides what the caller may do across domains.
- Runtime orchestrates execution across agents, skills, providers, tools, workflows, schedules, and sessions.
- Session is the universal run-capture format for agent runs, workflow runs, schedule-triggered runs, and other executable work.
- Domain packages own their domain behavior and use storage through stable persistence contracts.
- Storage decides physical persistence: JSON, SQLite, Postgres, or another backend.


## Canonical Operations

Managed packages expose canonical domain operations as the single source of behavior.
SDK/API routes, LLM tools, runtime flows, and approved package integrations must reuse those operations instead of duplicating domain logic.

```text
UI/app -> SDK -> server route -> canonical package operation
LLM tool -> host/runtime/server -> same canonical package operation
runtime/internal flow -> same canonical package operation where allowed
```

Tools are an LLM-facing access surface. SDK methods are an app-facing access surface. Both must converge on the same package-owned operation.
