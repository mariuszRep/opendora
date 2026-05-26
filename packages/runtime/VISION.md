# VISION.md — packages/runtime

> Owner: human. Approved intent only.

## Intent

Runtime is the execution engine and orchestration layer for OpenDora work. Runtime does the work; session records the ledger and current state of the work.

## Owns

- Agent run orchestration.
- Skill loading into execution context.
- Tool availability decisions for the active context.
- Provider/model selection and invocation handoff.
- Tool-call coordination.
- Workflow execution handoff and advancement.
- Schedule-triggered execution handoff.
- Starting and continuing executable runs.
- Writing execution context, state changes, events, and output into session during execution.
- Streaming, cancellation, retries, and run lifecycle behavior.

## Does Not Own

- Public API routes.
- Identity or permission policy definitions.
- Domain definitions themselves.
- Physical persistence backend choice.
- Durable session data model, message schema, or run-history storage shape.

## Depends On

- agent
- skills
- provider
- tools
- workflow
- schedule
- session
- permission
- storage as needed through domain contracts

## Used By

- server

## Boundary Rules

- Runtime coordinates work; domain packages own domain meaning.
- Runtime records executable work through sessions so runs share one capture format.
- Runtime decides how work executes and when active context changes.
- Session owns how execution state, attached context, and event history are captured.
- Runtime must respect permission decisions before executing protected actions.

## Canonical Operations

Runtime-facing tools, server routes, SDK-triggered runs, schedules, workflows, and internal flows must enter execution through runtime-owned operations instead of duplicating execution orchestration.
