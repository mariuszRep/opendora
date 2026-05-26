# VISION.md — packages/auth

> Owner: human. Approved intent only.

## Intent

Auth owns identity: who the caller is.

## Owns

- Users and service identities.
- Login/logout identity flows.
- Tokens, API keys, and session identity.
- Identity extraction for server requests.

## Does Not Own

- Cross-domain authorization policy.
- Agent, skill, tool, workflow, or session behavior.
- Runtime execution.

## Depends On

- storage, when identity persistence is needed.

## Used By

- server
- permission

## Boundary Rules

- Auth answers identity questions only.
- Permission answers access questions.

## Canonical Operations

Auth SDK routes, server checks, runtime flows, and package integrations must use the package-owned auth operations for identity extraction, token/API-key handling, and identity lifecycle behavior.
