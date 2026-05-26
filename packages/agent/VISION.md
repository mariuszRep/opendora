# VISION.md — packages/agent

> Owner: human. Approved intent only.

## Intent

Agent owns OpenDora agent definitions and agent-facing metadata.

## Owns

- Agent definitions, roles, and metadata.
- Agent templates and configuration shape.
- Agent discovery/loading contracts.
- Agent-run linkage to sessions.

## Does Not Own

- Runtime execution loop.
- Tool execution.
- Skill implementation.
- Physical persistence backend choice.

## Depends On

- storage, when persisted agent definitions are needed.

## Used By

- runtime
- server
- tools or management surfaces as needed

## Boundary Rules

- Agent defines what an agent is.
- Runtime decides when and how an agent runs.
- Agent runs are captured through sessions or session-linked run records.

## Canonical Operations

Agent management tools, SDK routes, runtime flows, and package integrations must use the package-owned agent operations for create, read, update, delete, list, and load behavior.
