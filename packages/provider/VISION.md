# VISION.md — packages/provider

> Owner: human. Approved intent only.

## Intent

Provider owns AI provider and model access for OpenDora runtime execution.

## Owns

- AI provider adapters and model discovery.
- Provider authentication helpers and credential loading contracts.
- Model selection support, fallback, timeout, transform, and provider error normalization.
- Provider-facing configuration needed to invoke models.

## Does Not Own

- Agent, skill, tool, workflow, schedule, or session domain behavior.
- Runtime execution orchestration.
- Public API boundary.
- Physical persistence backend choice.

## Depends On

- auth, when provider credentials are identity-scoped.
- storage, when provider configuration or credential references must be persisted.

## Used By

- runtime
- server
- agent/session execution paths that need model access

## Boundary Rules

- Provider supplies model access; runtime decides when models are invoked.
- Provider normalizes provider-specific behavior behind a stable interface.
- Provider must not own run history; session captures executable work and model-call context.

## Canonical Operations

Provider/model tools, SDK routes, runtime flows, and package integrations must use the package-owned provider operations for model discovery, provider selection, invocation handoff, fallback, timeout, transform, and error normalization.
