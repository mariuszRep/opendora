# AGENTS.md — packages/session

Rules and facts for AI agents working in `packages/session`.
Read the root file set first, then this package's local file set.

## Package location

```
packages/session/src/
  session.ts            — Session class (create, fork, updateMessage, updatePart, stream, etc.)
  session.sql.ts        — Drizzle schema: SessionTable, MessageTable, PartTable, EntryEdgeTable
  types.ts              — domain types (Actor, EdgeType, EntryEdge, Message, MessagePart, SessionMeta, etc.)
  prompt.ts             — SessionPrompt.loop (conversation loop)
  message-v2.ts         — MessageV2 types (Info, Part, WithParts, stream, toModelMessages)
  config.ts             — session configuration
  processor.ts          — session processor
  compaction.ts         — session compaction logic
  graph-migration.ts    — backfill from parent_message_id to EntryEdgeTable
  projectflows-storage-adapter.ts — Projectflows storage adapter integration
  skill-tools.ts        — skill-tool integration
  bus.ts                — Bus singleton
```

## Key rules

- **Session is the universal execution ledger.** It records run state and history through entries (immutable runtime events) connected by typed edges. It is not the execution engine — runtime holds that role.
- **Storage is injected.** Session code never reads files or touches a database directly. All persistence goes through `StorageAdapter`.
- **`Bus` is a process-level singleton.** Unsubscribe after every test. Never share handles across modules.
- **All `StorageAdapter` methods return `Promise`.** Even SQLite — sync internally, async interface always.
- **`from` is a SQL reserved word.** DB column is `sender`. Domain field is `from`. Mapping in adapters only.

## Core types

See `src/types.ts` for the canonical type definitions. Key types include:

- `Actor` — who sent the message (`user | agent | workflow | system`)
- `EdgeType` — typed edge relationships (`reply | tool_call | tool_result | delegation | workflow_step | retry | fork | fan_out | fan_in`)
- `EntryEdge` — an edge between two entries (session-scoped)
- `Message` — one turn in a session
- `MessagePart` — part of a message (text, reasoning, tool-invocation, file, etc.)
- `SessionMeta` — session metadata (id, type, status, parent, retention, etc.)

See `src/message-v2.ts` for the `MessageV2` type family used by the UI and stream paths:
- `MessageV2.Info` — User or Assistant message info
- `MessageV2.Part` — part variants (text, tool, reasoning, step-start, step-finish, etc.)
- `MessageV2.WithParts` — Info with parts array
- `MessageV2.stream()` — stream messages from a session
- `MessageV2.toModelMessages()` — convert to AI SDK model messages

## Storage adapter interface

The `StorageAdapter` interface at `packages/storage/src/adapter.ts` defines:
- `createSession`, `getSession`, `updateSession`, `listSessions`, `deleteSession`
- `appendMessage`, `getMessages`, `getMessage`
- Adapter implementations: SQLite, Postgres, JSONL

## Session lifecycle

```
create()       →  active
archive()      →  archived
close()        →  closed
reopen()       →  active
delete()       →  gone
fork()         →  new session (copies messages)
```

## Streaming

```ts
const ms = session.stream({ pingId: ping.id, from: agent })
ms.write({ type: "text", text: "token" })   // fires message.part.delta
const msg = await ms.end()                  // persists, fires message.appended
```

Stream is NOT in history until `end()` is called. Partial streams that never call `end()` are lost.

## Edge model

The current `EntryEdgeTable` is session-scoped (FK via `session_id`), with edge types: `reply`, `tool_call`, `tool_result`, `delegation`, `workflow_step`, `retry`, `fork`, `fan_out`, `fan_in`. Edges are created by `Session.updateMessage` and backfilled by `graph-migration.ts`. The VISION target is a universal edges table spanning all entity types — see `.projectflows/goals/session-graph-ledger-and-chat-rail/GOAL.md`.

## Cross-references

- Run state / checkpoint contract: `.projectflows/goals/unified-durable-run/GOAL.md`
- Entries + universal edges migration: `.projectflows/goals/session-graph-ledger-and-chat-rail/GOAL.md`
- Storage contracts: `packages/storage`
- Workflow runner: `packages/workflow/src/runner.ts`
- Workflow node types: `packages/workflow/src/node-types.ts`

## Common mistakes

- **Forgetting `await this.ready`** in PostgresAdapter — migration may not have run.
- **Using `msg.from` as a DB column** — store as `sender`.
- **Mutating `session.history()` result** — returns a copy, not the live array.
- **Not unsubscribing Bus handles in tests** — leaked handles cause cross-test interference.
- **Calling `manager.create()` twice with the same id** — throws.
- **Not awaiting `ping()` / `pong()` / `stream.end()`** — all return `Promise<Message>`; rejection means the write failed.
- **Not awaiting `manager.delete()`** — recursively deletes children; skipping leaves orphans.
