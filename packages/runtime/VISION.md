# VISION.md — packages/runtime

> Owner: human. Approved intent only.

## Intent

Runtime is the execution and orchestration layer for OpenDora work.

## Owns

- Agent run orchestration.
- Skill loading into execution context.
- Tool-call coordination.
- Workflow execution handoff.
- Schedule-triggered execution handoff.
- Session updates during execution.
- Streaming, cancellation, retries, and run lifecycle behavior.

## Does Not Own

- Public API routes.
- Identity or permission policy definitions.
- Domain definitions themselves.
- Physical persistence backend choice.

## Depends On

- agent
- skills
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
- Runtime must respect permission decisions before executing protected actions.
