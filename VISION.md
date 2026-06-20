# VISION.md — OpenDora

> Owner: human. Approved intent only.
> This document records durable product/system intent, not roadmap or implementation status.

## Intent

OpenDora is a local-first agentic application platform where users operate and extend agents, skills, tools, workflows, schedules, sessions, providers, and related configuration through consistent application surfaces.

OpenDora is intended to remain lightweight at its core while supporting an ecosystem of installable extensions that can attach new capabilities and integrated experiences without turning every capability into a core module.

Conversations and workflows are one durable execution model. A run — whether a normal conversation or a workflow — is a single durable, resumable, event-sourced execution. A normal conversation is the simplest workflow (message → reply); a workflow is the same run with more structure; and any conversation can be transformed into a reusable workflow.

## Owns

- Product-level architecture and boundaries for OpenDora.
- User-facing applications: web UI and CLI (CLI includes integrated terminal UI mode).
- A typed SDK gateway for application access.
- A server/service boundary that exposes OpenDora behavior.
- Runtime execution for live agentic work.
- Domain packages that own their own entities and behavior.
- A storage boundary for persistence.
- A plugin boundary for installable OpenDora capabilities.
- A mini-app integration boundary for standalone experiences that are visually and contextually integrated into OpenDora.
- Shared UI primitives and application design-system boundaries used by OpenDora surfaces and approved extensions.

## Does Not Own

- Package-specific domain rules that belong in package-scoped `VISION.md` files.
- Migration plans, implementation checklists, or status tracking.
- Agent operating instructions.
- Third-party extension business logic except through explicit OpenDora plugin, tool, workflow, mini-app, permission, and UI contracts.

## Relationships

```text
apps/web | apps/cli
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

plugins
  -> declared capabilities
    -> agents
    -> skills
    -> tools
    -> MCP integrations
    -> workflows
    -> schedules
    -> UI extensions

mini-apps
  -> OpenDora context contracts
  -> OpenDora UI/design primitives
  -> plugin/workflow/tool/session data as permitted

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
- A run is one durable, resumable, event-sourced execution; conversations and workflows share this model, and any conversation may be transformed into a reusable workflow.
- Durable run state — checkpoints, step journal, and suspend/resume tokens — is persisted only through storage contracts; runtime owns resume and replay; session records run state and history.
- Plugins are installable OpenDora extension packages. A plugin may contribute any subset of agents, skills, tools, MCP integrations, workflows, schedules, configuration, permissions, and UI extension surfaces.
- Users should install extension capabilities as plugins rather than through separate product concepts for installing agents, skills, workflows, schedules, or tools independently.
- Tools are a primary extension boundary because they may need execution behavior, schemas, permissions, configuration, and bespoke UI interaction/rendering surfaces.
- Mini-apps are standalone application experiences integrated into OpenDora visually and contextually; they are distinct from core modules and from ordinary plugin capability contributions.
- Mini-apps must use OpenDora-approved context, permission, storage, and UI/design-system contracts instead of depending on app internals.
- Extension UI must be built from OpenDora-approved primitives and design-system contracts so plugins and mini-apps remain visually consistent without copying app-owned implementation details.

## Canonical Operations / Contracts

SDK methods, server routes, runtime flows, tools, plugins, mini-apps, UI extensions, and package integrations must converge on package-owned canonical operations rather than duplicating business behavior.
