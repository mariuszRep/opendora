# VISION.md — OpenDora

> Owner: human. Approved intent only.
> This document records durable product/system intent, not roadmap or implementation status.

## Intent

OpenDora is an agentic application platform where users operate agents, skills, tools, workflows, schedules, sessions, providers, and related configuration through consistent application surfaces.

## Owns

- Product-level architecture and boundaries for OpenDora.
- User-facing applications: web UI, CLI, and TUI.
- A typed SDK gateway for application access.
- A server/service boundary that exposes OpenDora behavior.
- Runtime execution for live agentic work.
- Domain packages that own their own entities and behavior.
- A storage boundary for persistence.

## Does Not Own

- Package-specific domain rules that belong in package-scoped `VISION.md` files.
- Migration plans, implementation checklists, or status tracking.
- Agent operating instructions.

## Relationships

```text
apps/web | apps/cli | apps/tui
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

domain packages that persist data
  -> storage
```

## Boundary Rules

- Apps are user-facing shells and must use the SDK instead of importing backend/domain internals.
- SDK is the typed client gateway and talks to the server only.
- Server is the API/service boundary that keeps OpenDora reachable, validates requests, applies auth/permission, exposes routes/streams, and coordinates package-owned operations.
- Runtime is the execution engine that keeps executable work alive: agent runs, tool calls, provider invocations, workflow advancement, schedule-triggered execution, streaming, cancellation, retries, and run lifecycle.
- Domain packages own their own entities and canonical behavior.
- Storage is the only persistence boundary. Packages that need durable data use storage contracts instead of choosing JSON, SQLite, Postgres, files, or another backend directly.
- Session is the universal execution ledger and records run state/history; it is not the execution engine.

## Canonical Operations / Contracts

SDK methods, server routes, runtime flows, tools, and package integrations must converge on package-owned canonical operations rather than duplicating business behavior.
