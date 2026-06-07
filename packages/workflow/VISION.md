# VISION.md — packages/workflow

> Owner: human. Approved intent only.

## Intent

Workflow owns reusable process definitions and workflow domain behavior. Workflows are the only executable unit that schedules may trigger.

## Owns

- Workflow definitions.
- Workflow schema and validation.
- Workflow steps, triggers, and execution rules.
- Workflow run state contracts.
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
- A workflow run may be nested inside a parent session, including schedule-created parent sessions and normal agent conversation sessions.
- Runtime coordinates live execution.
- Storage persists definitions and run state through stable contracts.

## Canonical Operations

Workflow management tools, SDK routes, runtime flows, schedule triggers, and package integrations must use the package-owned workflow operations for create, read, update, delete, list, validate, and run/dispatch behavior.
