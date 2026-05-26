# VISION.md — packages/schedule

> Owner: human. Approved intent only.

## Intent

Schedule owns time-based and recurring execution definitions for OpenDora.

## Owns

- Schedule definitions and metadata.
- Cron/time rules and trigger configuration.
- Schedule lifecycle: create, enable, disable, update, delete.
- Dispatch contracts for scheduled work.

## Does Not Own

- Runtime execution internals.
- Workflow, agent, tool, or session domain behavior.
- Public API boundary.
- Physical persistence backend choice.

## Depends On

- runtime, when a schedule triggers executable work.
- session, when scheduled work creates or resumes a session.
- storage for persisted schedules and trigger history.
- permission when schedule access or execution checks are needed.

## Used By

- server
- runtime
- tools that manage schedules

## Boundary Rules

- Schedule decides when work should be triggered.
- Runtime decides how triggered work is executed.
- Storage decides where schedules and trigger history are persisted.
