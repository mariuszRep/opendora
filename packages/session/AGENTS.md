# AGENTS.md — @pingpong/core

Rules and facts for AI agents working in this package.
Read the root file set first, then this package's `SCOPE.md`, `STATE.md`, and `ROADMAP.md`.

---

## Package location

```
packages/core/src/
  index.ts              — public exports
  types.ts              — all domain types
  bus.ts                — Bus singleton
  session.ts            — Session class
  session-manager.ts    — SessionManager class
  session-queue.ts      — SessionQueue class
  daemon.ts             — RetentionDaemon
  storage/
    adapter.ts          — StorageAdapter interface
    drizzle/schema.ts   — shared Drizzle schema (Sqlite + Postgres)
    jsonl/index.ts      — JsonlAdapter
    sqlite/index.ts     — SqliteAdapter
    postgres/index.ts   — PostgresAdapter
```

## Key rules

- **`core` has no I/O.** `src/index.ts`, `bus.ts`, `session.ts`, `session-manager.ts`,
  `session-queue.ts`, and `daemon.ts` never read files or touch a database. Storage is injected.
- **`Bus` is a process-level singleton.** Unsubscribe after every test. Never share handles across modules.
- **All `StorageAdapter` methods return `Promise`.** Even SQLite — sync internally, async interface always.
- **`from` is a SQL reserved word.** DB column is `sender`. Domain field is `from`. Mapping in adapters only.
- **Adapters live inside core** as subpath exports (`@pingpong/core/jsonl`, `/sqlite`, `/postgres`).
  `better-sqlite3` and `postgres` are optional peer deps — only install what you import.

## Core types

```ts
// Actor — who sent the message
type Actor = { kind: "user" | "agent"; id: string }

// Message — one turn in a session
type Message = {
  id: string
  sessionId: string
  kind: "ping" | "pong"       // ping = request, pong = reply
  from: Actor
  parts: MessagePart[]
  parent: Parent | null
  provenance?: "user" | "agent" | "service"
  tokenCount?: number
  timestamp: number
}

// MessagePart
type MessagePart =
  | { type: "text";            text: string }
  | { type: "reasoning";       text: string }
  | { type: "tool-invocation"; toolName: string; input: unknown; output?: unknown }
  | { type: "file";            mimeType: string; url: string }

// Parent
type Parent = { messageId: string; sessionId?: string }

// SessionMeta
type SessionMeta = {
  id: string
  type: "role" | "scope" | "worker" | "scratchpad"
  status: "active" | "archived" | "closed"
  label?: string
  parent?: { sessionId: string; messageId?: string }
  spawnDepth?: number
  retention: RetentionPolicy
  sendPolicy?: SendPolicy
  share?: { url: string }
  compactionCount?: number
  compactingAt?: number
  createdAt: number
  updatedAt: number
  archivedAt?: number
}
```

## Session types and defaults

| Type | Use | Default retention |
|---|---|---|
| `role` | Long-lived agent | `onExpire: "archive"` |
| `scope` | One project | `autoArchive: true`, `onExpire: "archive"` |
| `worker` | Short job | `autoArchive: true`, `maxMessages: 500`, `onExpire: "close"` |
| `scratchpad` | Throwaway | `autoDelete: true`, `ttlMs: 6h`, `maxMessages: 100`, `onExpire: "delete"` |

### scratchpad — what is known and what is not

**What the code does:**
- Deleted entirely after 6h inactivity — no archive step
- Capped at 100 messages; oldest evicted on append (JsonlAdapter only)
- JsonlAdapter deletes the JSONL file immediately on session close

**Not yet decided:**
- Ownership model (user, agent, or system?)
- Visibility to other sessions
- Whether `autoDelete` applies on close vs TTL expiry only

Do not rely on scratchpad semantics beyond what the retention defaults mechanically guarantee.

`manager.create()` merges caller-supplied retention over type defaults. Calling
`adapter.createSession()` directly (e.g. in tests) does NOT apply defaults.

## StorageAdapter interface

```ts
interface StorageAdapter {
  createSession(meta: SessionMeta): Promise<void>
  getSession(id: string): Promise<SessionMeta | null>
  updateSession(id: string, patch: Partial<SessionMeta>): Promise<void>
  listSessions(filter?: SessionFilter): Promise<SessionMeta[]>
  deleteSession(id: string): Promise<void>
  appendMessage(msg: Message): Promise<void>
  getMessages(sessionId: string): Promise<Message[]>
  getMessage(id: string): Promise<Message | null>
}
```

## Bus events

| Event | Payload |
|---|---|
| `session.created` | `{ meta: SessionMeta }` |
| `session.updated` | `{ id, patch: Partial<SessionMeta> }` |
| `session.archived` | `{ id }` |
| `session.closed` | `{ id }` |
| `session.deleted` | `{ id }` |
| `session.error` | `{ sessionId, error: unknown }` |
| `message.appended` | `{ message: Message }` |
| `message.part.delta` | `{ sessionId, messageId, part: MessagePart }` |
| `retention.evicted` | `{ sessionId, evictedCount: 1 }` |

## SessionManager lifecycle

```
create()       →  active
archive()      →  archived  (fires session.archived)
close()        →  closed    (fires session.closed)
reopen()       →  active    (fires session.updated)
delete()       →  gone      (fires session.deleted)
share(id, url) →  sets share.url   (fires session.updated)
unshare(id)    →  clears share.url (fires session.updated)
```

`archive()` and `close()` remove the session from the in-memory map. `reopen()` re-mounts it.

## Streaming

```ts
const ms = session.stream({ pingId: ping.id, from: agent })
ms.write({ type: "text", text: "token" })   // fires message.part.delta
const msg = await ms.end()                  // persists, fires message.appended
```

Stream is NOT in history until `end()` is called. Partial streams that never call `end()` are lost.

## Adapter internals

**JsonlAdapter**
- `sessions.json` — index of all metadata (atomic rename writes, mtime-cached reads)
- `<id>.jsonl` — one line per message, append-only
- `archived/<id>.jsonl` — moved here on archive
- `maxMessages`: after append, oldest evicted (file rewrite)
- `getMessage()` is a linear scan — use SqliteAdapter for large-scale lookup

**SqliteAdapter**
- `better-sqlite3` + `drizzle-orm/better-sqlite3`; import from `@pingpong/core/sqlite`
- WAL mode + foreign keys on open
- Migration runs synchronously in constructor
- Messages cascade-delete when session is deleted
- All Drizzle methods are sync; wrapped in `async` to satisfy the interface

**PostgresAdapter**
- `postgres.js` + `drizzle-orm/postgres-js`; import from `@pingpong/core/postgres`
- Migration is async; stored in `this.ready` — every method awaits it
- Call `adapter.end()` on shutdown
- Timestamps as `BIGINT` (ms); JSON columns as `JSONB`

## Adding a new adapter

1. Implement `StorageAdapter` from `@pingpong/core/storage/adapter`
2. Import types from `@pingpong/core`
3. Add tests in `packages/tests/src/<name>-adapter.test.ts`
4. Do not modify any other file in core

## Common mistakes

- **Forgetting `await this.ready`** in PostgresAdapter — migration may not have run.
- **Using `msg.from` as a DB column** — store as `sender`.
- **Mutating `session.history()` result** — returns a copy, not the live array.
- **Not unsubscribing Bus handles in tests** — leaked handles cause cross-test interference.
- **Calling `manager.create()` twice with the same id** — throws.
- **Not awaiting `ping()` / `pong()` / `stream.end()`** — all return `Promise<Message>`; rejection means the write failed.
- **Not awaiting `manager.delete()`** — recursively deletes children; skipping leaves orphans.
