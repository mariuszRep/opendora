# VISION.md — packages/storage

> Owner: human. Approved intent only.

## Intent

Storage is the persistence abstraction layer for OpenDora domain packages.

## Owns

- Stable persistence interfaces/contracts.
- Backend adapters such as JSON files, SQLite, Postgres, or future stores.
- Storage selection and configuration.
- Common persistence behavior needed across domains.

## Does Not Own

- Domain behavior for agents, skills, tools, workflows, schedules, or sessions.
- Runtime orchestration.
- Public API routes.

## Depends On

- No domain package should be required for core storage contracts.

## Used By

- agent
- skills
- tools
- workflow
- schedule
- session
- auth
- permission

## Boundary Rules

- Domain packages ask storage to persist domain records through stable contracts.
- Domain packages should not care whether data is stored in JSON, SQLite, Postgres, or another backend.
- Storage preserves persistence mechanics; domains preserve business meaning.
