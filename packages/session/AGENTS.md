# AGENTS.md — packages/session

Rules and facts for AI agents working in `packages/session`.
Read the root file set first, then this package's local file set.

## Package location

```
packages/session/src/
  session.ts                      — Session namespace: create, fork, updateMessage, updatePart,
                                     messages, removeMessage/removePart, setWorkflowRun, etc.
  session.sql.ts                  — Drizzle schema: SessionTable, EntriesTable, EdgesTable,
                                     TodoTable, WorkflowRunCheckpointTable
  types.ts                        — domain types (Actor, EdgeType, EntryType, Edge, Entry, etc.)
  message-v2.ts                   — MessageV2 types (Info, Part, WithParts) and the read path:
                                     stream(), parts(), get() — all query EntriesTable/EdgesTable
  graph-writes.ts                 — shared entries+edges write/delete helpers (deriveActor,
                                     writeContainsEdge, writeGenericPartEntry, writeToolPartEntries,
                                     deleteEntryGraph, deleteToolPartGraph)
  prompt.ts                       — SessionPrompt (conversation loop)
  config.ts                       — session configuration (dependency injection)
  processor.ts                    — session processor
  compaction.ts                   — session compaction logic
  revert.ts                       — revert/unrevert/cleanup
  import/                         — vendor session importers (Claude Code, Codex JSONL)
  projectflows-storage-adapter.ts — PingPong session-lifecycle adapter (see below — legacy,
                                     narrow scope)
  session-manager.ts              — PingPong SessionManager (session lifecycle bookkeeping only)
  skill-tools.ts                  — skill-tool integration
  bus.ts                          — Bus singleton
```

## Key rules

- **Entries + universal edges is the canonical session ledger.** Every message and part is an
  `EntriesTable` row; every structural/causal relationship (session→message, message→part,
  reply chains, tool call→result, workflow→session) is an `EdgesTable` row. There is no other
  read or write path — `MessageV2.stream()`/`parts()`/`get()` query only these two tables.
- **No new `EntryType`/`EdgeType`/`Actor` values.** `EntryType` is `message | tool_call |
  tool_result | workflow_step | error | system_event`; every part type maps onto one of these
  (see `mapPartTypeToEntryType` in `graph-writes.ts`) — a semantic-nearest-fit mapping, not a
  perfect one, because widening the union is out of scope by design.
- **Storage is injected.** Session code never reads files directly; DB access goes through
  `getConfig().db` (a Drizzle instance configured once at startup).
- **`Bus` is a process-level singleton.** Unsubscribe after every test. Never share handles
  across modules.
- **`"agent"` is a live `Actor` kind, not dead.** Every new assistant message is constructed with
  `from: { kind: "agent", id: ... }` (see `Session.createNext()`, `compaction.ts`, `prompt.ts`).
  Do not remove or "clean up" this variant without re-verifying — it is load-bearing today.

## Core types

See `src/types.ts` for the canonical type definitions:

- `Actor` — `user | assistant | agent | workflow | system` (`agent` is live, see above)
- `EntryType` — `message | tool_call | tool_result | workflow_step | error | system_event`
- `EdgeType` — `instantiated_as | contains | forked_from | forked_at | reply_to | caused |
  produced | used | branch | merge`
- `Entry` / `Edge` — the two row shapes backing `EntriesTable`/`EdgesTable`
- `SessionMeta` — session metadata (id, type, status, parent, retention, etc.) — this is the
  PingPong subsystem's shape, used only for session lifecycle (see below), not messages

See `src/message-v2.ts` for the `MessageV2` type family used by the runtime/UI/server:
- `MessageV2.Info` — User or Assistant message info, reconstructed from an `EntriesTable` row's
  `payload_json` plus `id`/`sessionID`
- `MessageV2.Part` — 13 part-type variants (text, reasoning, tool, file, step-start, step-finish,
  snapshot, patch, agent, retry, compaction, fallback-switch, subtask), each backed by its own
  `EntriesTable` row
- `MessageV2.WithParts` — `{ info, parts }`
- `MessageV2.stream(sessionID)` — pages through `contains` edges from the session (ordered by
  `seq_in_parent`), batch-fetches the matching entries; `parts(messageID)`/`get(...)` follow the
  same edge-based pattern one level down

## Write paths

`Session.updateMessage`/`updatePart` (in `session.ts`) are the live write path: they upsert an
`EntriesTable` row and the relevant `EdgesTable` rows (`contains` from session→message or
message→part, `reply_to` for parent linkage, `used`/`caused` for tool lifecycle,
`instantiated_as` for workflow provenance) via the shared helpers in `graph-writes.ts`.
`Session.removeMessage`/`removePart` and `revert.ts`'s `cleanup()` call `deleteEntryGraph`/
`deleteToolPartGraph` to cascade-delete the matching graph rows.

Vendor importers (`import/claude.ts`, `import/codex.ts`, and `apps/cli/src/cli/cmd/import.ts`)
bypass `Session.updateMessage`/`updatePart` on purpose — they perform bulk backfills of existing
conversations and must not fire runtime bus events. They call the same `graph-writes.ts` helpers
directly instead.

## PingPong subsystem — legacy, narrow scope

`projectflows-storage-adapter.ts` + `session-manager.ts` implement `StorageAdapter`
(`storage/adapter.ts`), a separate, older session abstraction. Its **session-lifecycle** methods
(`createSession`/`getSession`/`updateSession`/`listSessions`/`deleteSession`) are live — every
`Session.archive`/`close`/`reopen`/`delete`/`update*` call goes through `sessionManager` to these,
touching only `SessionTable`. Its **message-persistence** methods (`appendMessage`/`getMessages`/
`getMessage`) are unreachable stubs — nothing calls `Session.pong()`/`sessionManager.pong()`
anywhere in the codebase, and their bodies reflect that (an explicit "not implemented" error for
the write side, empty results for the read side). Do not build on these three methods or treat
them as a real message-persistence path — `MessageV2`/`Session.updateMessage`/`updatePart` are the
actual message ledger.

## Session lifecycle

```
create()       →  active
archive()      →  archived
close()        →  closed
reopen()       →  active
delete()       →  gone
fork()         →  new session (copies messages)
```

## Cross-references

- Run state / checkpoint contract: `.projectflows/goals/done/unified-durable-run/GOAL.md`
- Entries + universal edges cutover: `.projectflows/goals/ready/session-graph-ledger-cutover-and-legacy-removal/GOAL.md`
- Storage contracts: `packages/storage`
- Workflow runner: `packages/workflow/src/runner.ts`

## Error classification — OpenCode Zen 401 "No provider available"

OpenCode Zen's router (`opencode.ai/zen/v1/chat/completions`) can return **HTTP 401** with a
structured `ModelError` body when no upstream provider is available for the requested model. This
is a **transient router-capacity issue**, not a credential failure — but the 401 status code
alone causes it to be classified as a hard, non-retryable auth failure, killing the session
instead of retrying or falling back.

**Detection** is narrow: `opencode` provider prefix + HTTP 401 + response body matching
`{type:"error", error:{type:"ModelError", message:"No provider available"}}`. Genuine 401s from
other providers are unaffected.

**Three classification sites were patched** (all must stay in sync):

1. **`message-v2.ts` → `fromError()`** — `isOpenCodeZenModelUnavailable()` helper checks the
   structured body and sets `isRetryable: true` on the resulting `MessageV2.APIError`. This is
   the primary fix: `SessionRetry.retryable()` checks `error.data.isRetryable` and returns a
   non-undefined value, enabling the retry loop in `processor.ts`.

2. **`processor.ts` → `classifyErrorKind()`** — Extended to accept `providerID` and
   `responseBody` parameters. Returns `"server"` instead of `"auth"` for the Zen 401 pattern.
   This ensures the fallback-group path (`errorKind !== "auth"`) is not blocked, allowing the
   processor to switch to a backup provider if one is configured.

3. **`@projectflows/provider` → `ProviderError.parseAPICallError()`** — Same detection in
   `packages/provider/src/provider/error.ts`. Overrides `errorKind` to `"server"` and
   `isRetryable` to `true`. See `packages/provider/AGENTS.md` for details.

**Known upstream issues** documenting this behavior:
- https://github.com/anomalyco/opencode/issues/33229
- https://github.com/anomalyco/opencode/issues/30192
- https://github.com/anomalyco/opencode/issues/38257

**Regression tests** are in `test/retry.test.ts`:
- "classifies OpenCode Zen 401 'No provider available' as retryable"
- "does not classify non-opencode 401 'No provider available' as retryable"

## Common mistakes

- **Assuming `MessageTable`/`PartTable`/`EntryEdgeTable` are read anywhere** — they still exist in
  `session.sql.ts` (physical drop is a separate, deliberately-deferred step) but nothing reads or
  writes them anymore; treat them as inert.
- **Calling `Session.pong()` expecting message persistence** — it's wired to the unreachable
  PingPong stub; use `Session.updateMessage`/`updatePart` instead.
- **Removing the `"agent"` `Actor` variant or widening `EntryType`/`EdgeType`** — both are explicit
  non-goals; see Key rules above.
- **Not unsubscribing Bus handles in tests** — leaked handles cause cross-test interference.
- **Writing a part without going through `writeGenericPartEntry`/`writeToolPartEntries`** — every
  part needs both its own entry and a `contains` edge from its message entry, or `parts()` will
  silently omit it.
- **Classifying OpenCode Zen 401 "No provider available" as auth** — this is a transient
  router-capacity issue, not a credential failure. All three classification sites (see above)
  must override it to `"server"` / retryable. Do not remove the `isOpenCodeZenModelUnavailable`
  checks without replacing them.
