# SCOPE.md

## What this repository is

`opendora` is a Bun-based monorepo for an AI-assisted development system. It contains:

- a primary runtime in `packages/opencode`
- a file-based agent package in `packages/agent`
- a web UI in `packages/ai-sdk`
- a TypeScript SDK in `packages/sdk/js`
- shared utilities in `packages/util`
- a session/storage core library in `packages/pingpong-core`

## Repository ownership

The repository root owns:

- workspace configuration
- shared scripts and package relationships
- repository-level documentation and development conventions
- integration expectations between packages

## Repository boundaries

The repository does own:

- the monorepo composition and package contracts that are visible in committed code
- generated API artifacts that are committed, such as `packages/sdk/openapi.json`

The repository does not, by itself, own:

- production deployment topology
- hosted infrastructure details
- external service configuration beyond what the code and docs explicitly show

## Local scopes

Independent local scopes currently appear to be:

- `packages/opencode`
- `packages/agent`
- `packages/ai-sdk`
- `packages/sdk/js`
- `packages/util`
- `packages/pingpong-core`

Other directories inherit root context unless a nearer file set says otherwise.
