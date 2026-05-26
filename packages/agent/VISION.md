# VISION.md — packages/agent

> Owner: human. Approved intent only.

## Intent

Agent owns OpenDora agent definitions and agent-facing metadata.

## Owns

- Agent definitions, roles, and metadata.
- Agent templates and configuration shape.
- Agent discovery/loading contracts.

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
