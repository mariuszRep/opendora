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
        -> tools
        -> workflow
        -> schedule
        -> session

agent     -> storage
skills    -> storage
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
- Runtime orchestrates execution across agents, skills, tools, workflows, schedules, and sessions.
- Domain packages own their domain behavior and use storage through stable persistence contracts.
- Storage decides physical persistence: JSON, SQLite, Postgres, or another backend.
