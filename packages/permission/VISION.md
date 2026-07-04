# VISION.md — packages/permission

> Owner: human. Approved intent only.

## Intent

Permission owns authorization policy across Projectflows domains. It creates, manages, persists, and evaluates permissions and policies; storage owns the physical persistence backend.

Catalog-managed entities and plugins may declare permission metadata. Permission owns effective evaluation regardless of whether declarations originate from local definitions, plugins, MCP integrations, or remote catalog-installed entities.

Plugins may declare required or default permissions as part of their manifest. These plugin-declared permission metadata follow the same model as agent- or skill-declared permissions: they supply default requirements, not authorization decisions. Permission owns effective evaluation regardless of whether the permission metadata comes from a plugin, an agent definition, or a skill definition.

## Owns

- Permission models, policy definitions, and policy evaluation.
- Permission lifecycle: create, read, update, delete, list, attach, detach, and resolve.
- Cross-domain access checks for agents, skills, tools, workflows, sessions, schedules, and stored resources.
- Consistent allow/deny decisions for server and runtime operations.
- Effective permission resolution from identity, agent defaults, agent-scoped permissions, loaded skills, available tools, workflow context, schedule context, and session context.

## Does Not Own

- User identity creation or token validation.
- Domain execution logic.
- Agent, skill, tool, workflow, schedule, or session domain definitions.
- Physical storage backend choice.

## Depends On

- auth identity context.
- storage for persisted permissions, policies, assignments, and permission history where needed.

## Used By

- server
- runtime
- notification (for permission-request notification history retention)
- agent, skills, tools, workflow, schedule, session, and other domain packages that require policy checks or permission metadata.

## Boundary Rules

- Permission receives an identity and an action/resource/context question.
- Permission returns an authorization decision; it does not perform the action.
- Permission owns permission management and evaluation even when another package declares permission requirements or defaults.
- Agents, skills, tools, workflows, and schedules may declare required/default permissions, but they do not own permission lifecycle or evaluation.
- Runtime and server must ask permission before protected actions.
- Permission persists policies and assignments through storage contracts only.
- Permission owns authorization and permission lifecycle. Notification retains permission request records as user-facing notification history after the user replies, marked resolved/rejected/allowed and removed from action-required count. Notification does not own authorization evaluation or permission lifecycle.

## Canonical Operations

Permission tools, SDK routes, server checks, runtime flows, and package integrations must use the package-owned permission operations for permission lifecycle, assignment, effective permission resolution, and authorization decisions.
