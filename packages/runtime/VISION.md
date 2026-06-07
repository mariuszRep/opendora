# VISION.md — packages/runtime

> Owner: human. Approved intent only.

## Intent

Runtime is the execution engine and orchestration layer for OpenDora work. Runtime keeps executable runs alive; session records the ledger and current state of the work.

## Owns

- Agent run orchestration.
- Skill loading into execution context.
- Tool availability decisions for the active context.
- Provider/model selection and invocation handoff.
- Tool-call coordination.
- Workflow execution handoff and advancement.
- Schedule-triggered workflow execution handoff.
- Starting and continuing executable runs.
- Creating or continuing nested workflow execution inside an existing parent session when requested by schedule or conversation flow.
- Effective execution context assembly from identity, active agent, loaded skills, available tools, workflow context, schedule context, session context, and declared permission metadata.
- Calling permission for authorization before protected actions.
- Writing execution context, state changes, events, and output into session during execution.
- Streaming, cancellation, retries, and run lifecycle behavior.

## Does Not Own

- Public API routes.
- Keeping the OpenDora API/service reachable; that belongs to server.
- Identity or permission policy definitions.
- Permission lifecycle, policy evaluation rules, or authorization ownership.
- Domain definitions themselves.
- Schedule timing, recurrence, or schedule-run history ownership.
- Workflow definition/schema ownership.
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

- Runtime coordinates live executable work; domain packages own domain meaning.
- Runtime assembles the effective execution context from agent, skill, tool, workflow, schedule, session, identity, and permission metadata.
- Schedule-triggered execution enters runtime as workflow execution only.
- Runtime records executable work through sessions so runs share one capture format.
- Runtime can run workflows nested inside a parent session, including parent sessions created or resumed by schedule runs.
- Runtime decides how work executes and when active context changes.
- Session owns how execution state, attached context, event history, and nesting are captured.
- Runtime must ask permission before executing protected actions.
- SDK-triggered execution reaches runtime through server, not by importing runtime directly.

## Canonical Operations

Runtime-facing tools, server routes, SDK-triggered runs, schedule-triggered workflow runs, workflows, and internal flows must enter execution through runtime-owned operations instead of duplicating execution orchestration.
