# VISION.md — packages/workflow

> Owner: human. Approved intent only.

## Intent

Workflow owns reusable process definitions and workflow domain behavior.

## Owns

- Workflow definitions.
- Workflow schema and validation.
- Workflow steps, triggers, and execution rules.
- Workflow run state contracts.
- Workflow-run linkage to sessions.

## Does Not Own

- Public API routes except optional route adapters.
- Agent execution loop outside workflow coordination.
- Physical persistence backend choice.

## Depends On

- agent, skills, session, or tools as workflow semantics require.
- storage for persisted workflow definitions and run state.

## Used By

- runtime
- server
- workflow tool surfaces

## Boundary Rules

- Workflow defines process structure.
- Workflow runs are captured through sessions or session-linked run records.
- Runtime coordinates live execution.
- Storage persists definitions and run state through stable contracts.

## Canonical Operations

Workflow management tools, SDK routes, runtime flows, and package integrations must use the package-owned workflow operations for create, read, update, delete, list, validate, and run/dispatch behavior.
