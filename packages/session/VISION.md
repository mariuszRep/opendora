# VISION.md — packages/session

> Owner: human. Approved intent only.

## Intent

Session owns conversation, thread, message, and run-history state.

## Owns

- Session records and metadata.
- Messages and history.
- Session lifecycle and status.
- Run linkage, summaries, compaction, and token usage where session-scoped.

## Does Not Own

- Public API boundary.
- Agent/tool/workflow definitions.
- Identity or authorization policy.
- Physical persistence backend choice.

## Depends On

- storage for persisted session state.
- permission when session access checks are needed.

## Used By

- runtime
- server
- workflow
- tools that inspect or manage sessions

## Boundary Rules

- Session owns state shape and lifecycle.
- Storage decides where and how that state is persisted.
