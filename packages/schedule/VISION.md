# VISION.md — packages/schedule

> Owner: human. Approved intent only.

## Intent

Schedule owns time-based and recurring execution definitions for OpenDora. A schedule triggers workflow execution only; anything that needs to run on a schedule must be represented as a workflow first.

## Owns

- Schedule definitions and metadata.
- Cron/time rules and trigger configuration.
- Schedule lifecycle: create, enable, disable, update, delete.
- Dispatch contracts from schedules to workflows.
- Schedule-run records and trigger history.
- Schedule-run linkage to parent sessions and nested workflow runs.

## Does Not Own

- Runtime execution internals.
- Workflow, agent, tool, or session domain behavior.
- Direct scheduled execution of agents, tools, skills, or arbitrary tasks.
- Public API boundary.
- Physical persistence backend choice.

## Depends On

- workflow, because schedules trigger workflows only.
- runtime, when a schedule triggers executable workflow work.
- session, when scheduled work creates or resumes a parent session.
- storage for persisted schedules, schedule-run records, and trigger history.
- permission when schedule access or execution checks are needed.

## Used By

- server
- runtime
- tools that manage schedules

## Boundary Rules

- Schedule decides when workflow work should be triggered.
- A schedule must not directly trigger an agent, tool, skill, prompt, or arbitrary task; convert scheduled work into a workflow first.
- A schedule run creates or resumes a parent session so scheduled work is captured in the same session ledger model as normal agent work.
- The scheduled workflow runs nested within that parent session, replacing delegation-style scheduled execution.
- Each schedule trigger must have a distinct schedule-run record linked to the schedule, workflow, parent session, nested workflow run/session linkage, status, timestamps, and result or error metadata where available.
- Runtime decides how the triggered workflow executes.
- Storage decides where schedules, schedule-run records, and trigger history are persisted.

## Canonical Operations

Schedule management tools, SDK routes, runtime flows, and package integrations must use the package-owned schedule operations for create, read, update, delete, list, enable/disable, trigger, and schedule-run history behavior.
