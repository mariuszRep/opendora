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
