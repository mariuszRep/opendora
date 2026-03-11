# SCRATCHPAD.md — @pingpong/core

> Exploratory. Nothing here is planned or committed.
> Do not reference in STATE.md or BACKLOG.md.

---

## Session Orchestration Layer (Option B)

Instead of staying a pure session/storage library, core grows upward to own the runtime
layer between storage and the LLM call.

Considered features:
- Lane-based queuing with per-session serialization and global concurrency caps
- Agent spawning primitives — create child sessions, enqueue work, collect results
- Session lifecycle execution states (idle, running, waiting, blocked)
- Announcements — completed worker delivers results back to parent without polling

### What openclaw already built

openclaw's `command-queue.ts` implements lane-based FIFO:
```
lane: "session:<sessionKey>"  — one agent run at a time per session
lane: "main"                  — global cap (default 4 concurrent)
lane: "subagent"              — separate cap for spawned workers (default 8)
```

Queue modes: `collect`, `steer`, `followup`, `interrupt`.
Sub-agent spawning uses `spawnDepth` (already on `SessionMeta`).

### Why deferred

- Queue modes alone took openclaw months to stabilise
- `SessionOrchestrator` is hard to change once consumed
- If execution adapter gets complex, core becomes openclaw without channels
- Realistically 3-4x the current codebase

Revisit after core@0.2.0 ships and at least one external project is consuming it.

---

## canMessage vs canContext (from openada)

Openada's `SessionAgent` uses a two-tier participation model:

- `canMessage` — actor's message triggers the host agent (LLM responds)
- `canContext` — actor injects silently into context, no LLM call

This is richer than core's flat `sendPolicy: { allow, deny }`.
Maps to an enriched `sendPolicy`:

```ts
sendPolicy?: {
  canMessage: string[]   // actor ids that trigger a response
  canContext: string[]   // actor ids that inject silently
}
```

Core stores and enforces actor filtering (ping/pong rejection).
`@pingpong/agents` decides what to do when a `canContext` ping arrives (no LLM call,
or a different handler).

Breaking change from current `{ allow, deny }` shape — migration path needed.
