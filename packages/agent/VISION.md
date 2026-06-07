# VISION.md — packages/agent

> Owner: human. Approved intent only.

## Intent

Agent owns OpenDora agent definitions and agent-facing metadata.

## Owns

- Agent definitions, roles, and metadata.
- Agent templates and configuration shape.
- Agent discovery/loading contracts.
- Agent-run linkage to sessions.
- Agent-declared default permissions, embedded/agent-scoped permission requirements, attached skills, and attached tools as part of the agent definition shape.

## Does Not Own

- Runtime execution loop.
- Tool execution.
- Skill implementation.
- Permission lifecycle, policy evaluation, or authorization decisions.
- Physical persistence backend choice.

## Depends On

- storage, when persisted agent definitions are needed.
- permission, when agent-defined permission metadata must be resolved or validated.
- skills and tools by reference when an agent attaches skills or tools.

## Used By

- runtime
- server
- tools or management surfaces as needed

## Boundary Rules

- Agent defines what an agent is, including its declared skills, tools, and permission metadata.
- Agent permission declarations are not authorization decisions; permission owns effective allow/deny evaluation.
- Runtime decides when and how an agent runs and assembles the active execution context.
- Runtime may use agent-declared skills/tools/permissions while still enforcing permission checks before protected actions.
- Agent runs are captured through sessions or session-linked run records.

## Canonical Operations

Agent management tools, SDK routes, runtime flows, and package integrations must use the package-owned agent operations for create, read, update, delete, list, load, and agent attachment behavior.
