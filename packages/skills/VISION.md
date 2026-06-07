# VISION.md — packages/skills

> Owner: human. Approved intent only.

## Intent

Skills owns reusable capability definitions that can be loaded into agent/runtime context.

## Owns

- Skill definitions and metadata.
- Skill loading and discovery.
- Skill activation rules.
- Skill content resolution.
- Skill-declared attached tools and required/default permission metadata.

## Does Not Own

- Agent execution loop.
- Tool execution.
- Workflow run state.
- Permission lifecycle, policy evaluation, or authorization decisions.
- Physical persistence backend choice.

## Depends On

- storage, when persisted skill definitions are needed.
- tools by reference when a skill attaches tools.
- permission, when skill-declared permission metadata must be resolved or validated.

## Used By

- runtime
- server
- agent/session context assembly

## Boundary Rules

- Skills describe reusable capability context.
- A loaded skill may expand the runtime context with skill content, attached tools, and permission requirements/defaults.
- Skill permission declarations are not authorization decisions; permission owns effective allow/deny evaluation.
- Runtime decides when skills are loaded into a run and must enforce permission checks before protected actions.

## Canonical Operations

Skill management tools, SDK routes, runtime flows, and package integrations must use the package-owned skill operations for create, read, update, delete, list, search, install, load, and skill attachment behavior.
