# MIGRATION.md - packages/provider

> Owner: agent. Update as provider/model boundary work starts, completes, or gets blocked.

## In Progress: Centralize Provider And Model Resolution

### Why

Provider catalog loading, auth, SDK creation, and model transforms already live in this package, but callers still resolve fallback groups and choose concrete model refs in `packages/session` and `packages/opencode`.

The target boundary is that callers provide intent, such as agent plus purpose, and this package returns a concrete provider model and SDK language model.

### Target

- Provider-owned model reference types.
- Provider-owned fallback group state and rotation.
- A single provider API for resolving agent/requested/default/small/fallback selections.
- Session receives concrete model data and does not interpret synthetic provider IDs such as `fallback`.

### Steps

- [x] Add provider-local agent instructions.
- [x] Start provider migration notes.
- [x] Move fallback group state from `packages/session` to `packages/provider`.
- [x] Expose fallback resolution/reporting through the provider service injected into `packages/session`.
- [x] Replace session fallback imports with provider service calls.
- [ ] Add a higher-level provider resolver for agent/purpose model selection.
