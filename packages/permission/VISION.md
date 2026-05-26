# VISION.md — packages/permission

> Owner: human. Approved intent only.

## Intent

Permission owns authorization policy across OpenDora domains.

## Owns

- Permission models and policy evaluation.
- Cross-domain access checks for agents, skills, tools, workflows, sessions, and stored resources.
- Consistent allow/deny decisions for server and runtime operations.

## Does Not Own

- User identity creation or token validation.
- Domain execution logic.
- Physical storage backend choice.

## Depends On

- auth identity context.
- storage, when policy persistence is needed.

## Used By

- server
- runtime
- domain packages that require policy checks

## Boundary Rules

- Permission receives an identity and an action/resource question.
- Permission returns an authorization decision; it does not perform the action.

## Canonical Operations

Permission tools, SDK routes, server checks, runtime flows, and package integrations must use the package-owned permission operations for authorization decisions.
