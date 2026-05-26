# VISION.md — packages/skills

> Owner: human. Approved intent only.

## Intent

Skills owns reusable capability definitions that can be loaded into agent/runtime context.

## Owns

- Skill definitions and metadata.
- Skill loading and discovery.
- Skill activation rules.
- Skill content resolution.

## Does Not Own

- Agent execution loop.
- Tool execution.
- Workflow run state.
- Physical persistence backend choice.

## Depends On

- storage, when persisted skill definitions are needed.

## Used By

- runtime
- server
- agent/session context assembly

## Boundary Rules

- Skills describe reusable capability context.
- Runtime decides when skills are loaded into a run.
