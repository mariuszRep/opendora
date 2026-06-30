# VISION.md — packages/storage

> Owner: human. Approved intent only.

## Intent

Storage is the exclusive persistence abstraction layer for OpenDora packages.

## Owns

- Stable persistence interfaces/contracts.
- Backend adapters such as JSON files, SQLite, Postgres, or future stores.
- Storage selection and configuration.
- Common persistence behavior needed across domains.
- Persistence support for the universal session/run capture format.
- Persistence of the session graph-backed ledger through stable contracts owned by session.
- A durable run-state / checkpoint contract: the stable interface through which a run's cursor, context, step journal, and suspend/resume tokens are persisted, listed, and read so runs can resume and replay across process restarts.

## Does Not Own

- Domain behavior for agents, skills, providers, tools, workflows, schedules, sessions, auth, or permission.
- Runtime orchestration.
- Public API routes.

## Depends On

- No domain package should be required for core storage contracts.

## Used By

- agent
- auth
- permission
- provider
- skills
- tools
- workflow
- schedule
- session
- notification

## Boundary Rules

- Storage is the only package that touches physical persistence backends.
- Domain packages ask storage to persist domain records through stable contracts.
- Persisted agents, providers, sessions, workflows, skills, schedules, permissions, auth identities, notification records, and tool state go through storage contracts.
- Domain packages must not choose or directly access JSON, SQLite, Postgres, files, or another backend.
- Storage preserves persistence mechanics; domains preserve business meaning.
- The run-state / checkpoint contract is persistence only: storage stores and retrieves run snapshots and journals but never decides when to checkpoint, resume, replay, or suspend. Runtime owns those decisions; session owns the run state shape.
- Storage persists the session graph-backed ledger through stable persistence contracts whose shape is owned by session.
- Edges use a single physical edge table for all persisted cross-entity relationships (workflows, sessions, entries, tools, artifacts/resources). The edge table is a single canonical model with domain-owned edge semantics — session owns session/entry/edge semantics, workflow owns workflow definition semantics.
- Physical backend for sessions, entries, and edges may use ordinary relational tables. Storage does not assign product meaning to actors, entry types, or edge types — those semantics are owned by session.
- SQLite is acceptable for the graph model. Graph behavior should use normal storage contracts and indexed relational structures unless a validated backend-specific graph extension provides clear benefit without changing domain ownership.
- Default timeline reads must be supported by indexed contains edges, e.g. index on `(from_type, from_id, type, seq_in_parent)` filtered to `type='contains'`. Deep graph traversal is explicit/debug, not default chat render.

## Canonical Operations

Domain packages, tools, server routes, and runtime flows must use storage-owned persistence contracts instead of directly choosing JSON, SQLite, Postgres, files, or another backend.
