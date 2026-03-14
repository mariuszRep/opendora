# STATE.md — @pingpong/core

Current behavior for `@pingpong/core`.
Every statement here should reflect current code rather than planned work.

---

## What core is

`@pingpong/core` is a **storage-agnostic session library**: create, persist, and manage typed
conversation sessions between users and agents. It has no opinion about LLMs, channels, or UIs.

Core is **not** an agent runner, a router, an LLM client, or a message queue.

---

## Session Model

### Every session has exactly one type

| Type | Business meaning | Default retention |
|---|---|---|
| `role` | Continuous agent or persona | `onExpire: "archive"` |
| `scope` | Scoped to one project or idea | `autoArchive: true`, `onExpire: "archive"` |
| `worker` | Short-lived job session | `autoArchive: true`, `maxMessages: 500`, `onExpire: "close"` |
| `scratchpad` | Throwaway scratch space | `autoDelete: true`, `ttlMs: 6h`, `maxMessages: 100`, `onExpire: "delete"` |

The type is immutable after creation.

### Every session is always in exactly one status

```
active → archived
active → closed
active → (deleted)
archived → active   (via reopen)
closed   → active   (via reopen)
```

Deleting a session removes it permanently — there is no "deleted" status.

### Session metadata

- `id` — caller-assigned string, unique within a store
- `type` — immutable
- `status` — `"active"` | `"archived"` | `"closed"`
- `label?` — optional human-readable name
- `parent?` — `{ sessionId, messageId? }` — who spawned this session
- `spawnDepth?` — `0` = root, `1` = direct worker, `2` = nested worker
- `retention` — merged from type defaults + caller overrides at creation; immutable after
- `sendPolicy?` — `{ allow: string[], deny: string[] }` — stored and enforced at `ping()`/`pong()` call time
- `agentId?` — id of the agent assigned to handle pings in this session
- `toolPolicy?` — `string[]` — allowed tool names; stored, intersection enforced by agents layer
- `systemPrompt?` — boundary prompt prepended to all agent system prompts; stored, composed by agents layer
- `share?` — `{ url: string }` — stored; URL generation is the caller's responsibility
- `compactionCount?` — incremented by the layer above each time context is compacted
- `compactingAt?` — set by the layer above while compaction runs, cleared on completion
- `inputTokens?`, `outputTokens?` — cumulative LLM token counts; incremented by the agents layer
- `cacheReadTokens?`, `cacheWriteTokens?` — cumulative prompt-cache token counts
- `createdAt`, `updatedAt` — epoch ms, maintained by the framework
- `archivedAt?` — set when status transitions to `"archived"`

### Retention policy fields

`ttlMs`, `maxAgeDays`, `maxMessages`, `onExpire`, `autoArchive`, `autoDelete`.
Merged at creation time. Cannot change after creation.

---

## Message Model

### Messages are append-only

No update or edit operation exists.

### Every message has exactly one kind

- `ping` — inbound request (from user or agent)
- `pong` — outbound reply (from agent)

### Every pong must reference a parent

`PongOptions.parent` is required. A pong with no parent is a type error.
A ping's parent is optional — root pings have no parent.

### Message content is always an array of parts

```ts
type MessagePart =
  | { type: "text";            text: string }
  | { type: "reasoning";       text: string }
  | { type: "tool-invocation"; toolName: string; input: unknown; output?: unknown }
  | { type: "file";            mimeType: string; url: string }
```

Passing a plain string to `content` wraps it as `[{ type: "text", text }]`.

### Messages carry optional provenance and token count

- `provenance?: "user" | "agent" | "service"` — origin kind; not evaluated by core
- `tokenCount?: number` — aggregation is the caller's responsibility

### Cross-session threading

A message's `parent.sessionId` references a message in a different session.
Core stores this reference but does not traverse or enforce it.
`session.thread()` only walks within the same in-memory session.

### Streaming messages are not in history until `end()` is called

`session.stream()` accumulates parts in memory. The assembled message is added to history
and persisted only when `stream.end()` is called.

---

## Bus

Process-level synchronous pub/sub singleton. Does not cross process boundaries.

### Events

| Event | When |
|---|---|
| `session.created` | `manager.create()` completes |
| `session.updated` | `manager.reopen()`, `manager.share()`, `manager.unshare()` |
| `session.archived` | `manager.archive()` completes |
| `session.closed` | `manager.close()` completes |
| `session.deleted` | `manager.delete()` completes |
| `session.error` | Message persistence fails in `mount()` |
| `message.appended` | Every `ping()` and `pong()` — including final from `stream.end()` |
| `message.part.delta` | Every `stream.write()` call |
| `retention.evicted` | `RetentionDaemon` applies `onExpire` to a session |

### Guarantees

- Handlers fire synchronously during the publish call
- A handler that throws does not prevent other handlers from running
- Unsubscribing an already-unsubscribed handle is a no-op

---

## Storage

Storage is injected into `SessionManager`. Core contains no I/O of any kind.

Three adapters ship inside `@pingpong/core` as subpath exports:

| Adapter | Import | Backend | Best for |
|---|---|---|---|
| `JsonlAdapter` | `@pingpong/core/jsonl` | JSONL files on disk | Dev, small deployments |
| `SqliteAdapter` | `@pingpong/core/sqlite` | SQLite via better-sqlite3 + Drizzle | Single-process production |
| `PostgresAdapter` | `@pingpong/core/postgres` | Postgres via postgres.js + Drizzle | Multi-process production |

`better-sqlite3` and `postgres` are optional peer deps — install only what you use.

### JsonlAdapter guarantees

- Metadata in `sessions.json` (atomic rename writes, mtime-cached reads)
- Messages in `<sessionId>.jsonl` (one line per message, append-only)
- Archive moves JSONL to `archived/<sessionId>.jsonl`
- Closing a scratchpad deletes its JSONL file
- `maxMessages` cap enforced at append time (oldest evicted, file rewrite)
- `getMessage()` is a linear scan — use SqliteAdapter for large-scale lookup

### SqliteAdapter guarantees

- WAL mode and foreign keys enabled on open
- Migration runs synchronously in the constructor
- Messages cascade-delete when their session is deleted

### PostgresAdapter guarantees

- Migration is async, stored in `this.ready` — every method awaits it
- Messages cascade-delete when their session is deleted
- Timestamps stored as `BIGINT` (ms); JSON columns as `JSONB`
- Call `adapter.end()` on shutdown to close the connection pool

---

## Retention Daemon

`RetentionDaemon` enforces `ttlMs`, `maxAgeDays`, `autoArchive`, and `autoDelete` at runtime.

- Polls all `active` sessions on a configurable interval (default 60s)
- Applies `onExpire` (`"archive"` | `"close"` | `"delete"`) when TTL or age has elapsed
- After `onExpire: "close"`, immediately applies `autoDelete` or `autoArchive`
- Publishes `retention.evicted` on the Bus for each affected session
- Has zero effect if never started
- `maxMessages` enforced by JsonlAdapter only — SQLite and Postgres do not enforce this cap

---

## Per-Session Queue

```ts
class SessionQueue {
  enqueue(sessionId: string, task: () => Promise<void>): Promise<void>
}
```

`manager.queue` serializes concurrent work per session. Tasks for different sessions run
concurrently; tasks for the same session run in FIFO order.

---

## Reliable Message Persistence

`ping()`, `pong()`, and `stream.end()` resolve only after the storage write succeeds.
If the write fails, the promise rejects and `session.error` is published on the Bus.
`message.appended` fires after — not before — the storage write completes.

---

## Message Part Validation

`ping()`, `pong()`, and `stream.end()` validate parts before any storage involvement:

- `parts` must be non-empty — throws `TypeError`
- `text` and `reasoning` parts must have a non-empty `text` string — throws `TypeError`
- `tool-invocation` parts must have a non-empty `toolName` — throws `TypeError`

---

## Send Policy Enforcement

`evaluateSendPolicy(policy: SendPolicy, actor: Actor): "allow" | "deny"` is a pure exported function.

Rules (in priority order):
1. If `policy.deny` includes `actor.id` → `"deny"`
2. If `policy.allow` is non-empty and does not include `actor.id` → `"deny"`
3. Otherwise → `"allow"`

`Session` enforces the policy at `ping()` and `pong()` call time when constructed with a
`sendPolicy` argument. `SessionManager` passes the stored policy to `Session` at mount time,
so enforcement is always active when a session is created or reopened through the manager.

---

## Cascade Child Cleanup

`SessionManager.delete(id)` recursively deletes all child sessions before the parent.
`session.deleted` is published for each deleted session.

---

## SyncAdapter Interface

Transport-agnostic contract for replicating local Bus events to a remote server.

```ts
interface SyncAdapter {
  /** Called by core after every Bus event that should be forwarded to the server. */
  publish(event: string, data: unknown): void
  /** Called by the bridge when the server pushes an event down to the local Bus. */
  onServerEvent(handler: (event: string, data: unknown) => void): () => void
}
```

- Exported as a type from `@pingpong/core`
- Core defines only the interface — no network code, no queuing, no retry logic
- Concrete implementations (WebSocket adapter) live in `@pingpong/ui` and `packages/app`

---

## Explicit Non-Capabilities

Not supported by the current code:

- Message deletion or mutation
- Session forking or branching
- Cross-session thread querying via `SessionManager`
- Session export
- canMessage / canContext two-tier SendPolicy (current policy is flat allow/deny only)
- Tool policy enforcement (field stored; intersection computed by agents layer, not core)
- Session-level system prompt composition (field stored; prepended by agents layer, not core)
- Token total normalisation across providers (stored; incremented by agents layer)
- Cross-process Bus delivery
- Redis or any cache layer
- Global store pruning or session count caps
