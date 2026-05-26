# VISION.md — packages/schedule

> Owner: human. Approved intent only.

## Intent

Schedule owns time-based and recurring execution definitions for OpenDora.

## Owns

- Schedule definitions and metadata.
- Cron/time rules and trigger configuration.
- Schedule lifecycle: create, enable, disable, update, delete.
- Dispatch contracts for scheduled work.
- Schedule-run linkage to sessions.

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
- A schedule run creates or resumes a session so scheduled work is captured in the same format as normal agent work.
- Runtime decides how triggered work is executed.
- Storage decides where schedules and trigger history are persisted.

## Canonical Operations

Schedule management tools, SDK routes, runtime flows, and package integrations must use the package-owned schedule operations for create, read, update, delete, list, enable/disable, and trigger behavior.
