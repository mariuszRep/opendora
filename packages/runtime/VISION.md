# VISION.md — packages/runtime

> Owner: human. Approved intent only.

## Intent

Runtime is the execution engine and orchestration layer for Projectflows work. Runtime keeps executable runs alive; session records the ledger and current state of the work.

Runtime consumes the unified capability discovery/index to resolve installed agents, skills, tools, workflows, and plugins into executable context. Runtime records source provenance in session context but does not own catalog indexing or install lifecycle.

Runtime discovers and loads capabilities from both the core bundle and installed plugins. Plugin-contributed agents, skills, tools, and workflows are resolved from `.projectflows/plugins/installed/<plugin-id>/` at runtime. Runtime resolves tool availability by source group (`core`, `plugin:<plugin-id>`, `mcp:<server-id>`) and assembles the effective execution context from all available sources.

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
- Deciding when to checkpoint a run, suspend it (awaiting human input, permission, a decision, or an external event), resume it, and replay completed steps from the run's journal.
- Driving conversations and workflows through one step-journaled execution path, where a normal conversation is the simplest workflow (a single assistant-turn loop).

## Does Not Own

- Public API routes.
- Keeping the Projectflows API/service reachable; that belongs to server.
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
- Runtime owns resume and replay: it checkpoints runs, suspends and resumes them, and skips already-completed journal steps. Session defines and records the run state shape; storage persists it; runtime decides when these transitions happen.
- Conversations and workflows advance through the same step-journaled executor; runtime does not maintain in-memory-only run state as a source of truth.
- Runtime can run workflows nested inside a parent session, including parent sessions created or resumed by schedule runs.
- Runtime decides how work executes and when active context changes.
- Session owns how execution state, attached context, event history, and nesting are captured.
- Runtime must ask permission before executing protected actions.
- SDK-triggered execution reaches runtime through server, not by importing runtime directly.

## Canonical Operations

Runtime-facing tools, server routes, SDK-triggered runs, schedule-triggered workflow runs, workflows, and internal flows must enter execution through runtime-owned operations instead of duplicating execution orchestration.
