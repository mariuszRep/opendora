# VISION.md — packages/workflow

> Owner: human. Approved intent only.

## Intent

Workflow owns reusable process definitions and workflow domain behavior. Workflows are the only executable unit that schedules may trigger.

## Owns

- Workflow definitions.
- Workflow schema and validation.
- Workflow steps, triggers, and execution rules.
- Workflow run state contracts, including the durable cursor, context, and step journal that let a workflow run resume, replay completed steps, and suspend for external input across process restarts.
- Workflow definitions produced by projecting an existing conversation/run into a reusable workflow.
- Workflow-run linkage to sessions.
- Workflow-run linkage to schedule-run records when started by a schedule.
- Workflow-declared required/default permission metadata and step-level agent, skill, or tool requirements.

## Does Not Own

- Public API routes except optional route adapters.
- Agent execution loop outside workflow coordination.
- Schedule timing, recurrence, or trigger history.
- Permission lifecycle, policy evaluation, or authorization decisions.
- Physical persistence backend choice.

## Depends On

- agent, skills, session, or tools as workflow semantics require.
- permission, when workflow-declared permission metadata must be resolved or validated.
- storage for persisted workflow definitions and run state.

## Used By

- runtime
- server
- schedule
- workflow tool surfaces

## Boundary Rules

- Workflow defines process structure.
- Workflow is the scheduled execution boundary: scheduled work must be modeled as a workflow before schedule can trigger it.
- Workflow definitions may declare permissions required to run the workflow or individual steps.
- Workflow permission declarations are not authorization decisions; permission owns effective allow/deny evaluation.
- Workflow steps may require agents, skills, or tools, but runtime assembles and enforces the effective execution context.
- Workflow runs are captured through sessions or session-linked run records.
- A workflow run is a durable, resumable run: its state shape (cursor, context, step journal) is defined with session and persisted through storage contracts, never as in-memory-only state. Runtime decides when to checkpoint, suspend, resume, and replay.
- A normal conversation is the simplest workflow (a single assistant-turn loop); any conversation may be projected into a reusable workflow definition over the same ledger.
- The agent-perceivable surface — synthetic workflow tool messages (`workflow_parameters`, `workflow_decide`) and step ordering — must be identical whether a run is fresh or resumed.
- A workflow run may be nested inside a parent session, including schedule-created parent sessions and normal agent conversation sessions.
- Runtime coordinates live execution.
- Storage persists definitions and run state through stable contracts.

## Canonical Operations

Workflow management tools, SDK routes, runtime flows, schedule triggers, and package integrations must use the package-owned workflow operations for create, read, update, delete, list, validate, and run/dispatch behavior.
