# Investigation Findings: Current Session Ledger State

_Investigated: 2026-06-30. No source code changes made._

---

## 1. Schema and Types (AC1)

### 1.1 Tables — `packages/session/src/session.sql.ts`

Five tables exist in the current schema, spanning all three generations of the model:

#### `SessionTable` (lines 36–98)

| Column | Type | Nullable | Key/Index |
|--------|------|----------|-----------|
| `id` | text | NO | PK |
| `project_id` | text | NO | FK ProjectTable.id (cascade); `session_project_idx` |
| `slug` | text | NO | — |
| `directory` | text | NO | — |
| `title` | text | NO | — |
| `version` | text | NO | — |
| `session_type` | text | YES | `session_type_idx` |
| `session_status` | text | YES | — |
| `agent_id` | text | YES | `session_agent_idx` |
| `owner_id` | text | YES | `session_owner_idx` |
| `owner_kind` | text (`"user"\|"agent"\|"workflow"`) | YES | — |
| `parent_session_id` | text | YES | `session_parent_session_idx`; no cascade |
| `reply_to_session_id` | text | YES | — |
| `workflow_run` | text (JSON) | YES | — |
| `model` | text | YES | — |
| `spawn_depth` | integer | YES | — |
| `input_tokens` / `output_tokens` / `cache_*` | integer | YES | — |
| `time_created` / `time_updated` | integer | NO | — |
| `time_compacting` / `time_archived` | integer | YES | — |
| `vendor` | text | YES | `session_vendor_native_idx` (composite with `native_id`) |
| `native_id` | text | YES | `session_vendor_native_idx` |
| `path` / `read_path` / `cwd` | text | YES | — |
| `allowed_agents` / `send_policy` / `retention` | text (JSON) | YES | — |
| `unlocked_tools` | text (JSON) | YES | — |
| `summary_*` / `revert` | mixed | YES | — |

#### `MessageTable` (lines 100–120) — old model, still primary write target

| Column | Type | Nullable | Key/Index |
|--------|------|----------|-----------|
| `id` | text | NO | PK |
| `session_id` | text | NO | FK SessionTable.id (cascade); `message_session_idx` |
| `time_created` | integer | NO | — |
| `time_updated` | integer | NO | — |
| `parent_message_id` | text | YES | `message_parent_message_idx` |
| `data` | text (JSON, `InfoData`) | NO | — |
| `native_id` | text | YES | `message_native_idx` |
| `vendor_raw` | text (JSON) | YES | — |

`InfoData` is `MessageV2.Info` minus `id` and `sessionID` fields (those come from the row itself).

#### `PartTable` (lines 122–142) — old model, still primary write target

| Column | Type | Nullable | Key/Index |
|--------|------|----------|-----------|
| `id` | text | NO | PK |
| `message_id` | text | NO | FK MessageTable.id (cascade); `part_message_idx` |
| `session_id` | text | NO | `part_session_idx` |
| `time_created` / `time_updated` | integer | NO | — |
| `data` | text (JSON, `PartData`) | NO | — |
| `native_id` | text | YES | `part_native_idx` |
| `vendor_raw` | text (JSON) | YES | — |

`PartData` is `MessageV2.Part` minus `id`, `sessionID`, `messageID`.

#### `EntryEdgeTable` (lines 144–167) — legacy session-scoped edge table

| Column | Type | Nullable | Key/Index |
|--------|------|----------|-----------|
| `id` | text | NO | PK |
| `session_id` | text | NO | FK SessionTable.id (cascade); `entry_edge_session_idx` |
| `source_entry_id` | text | NO | Soft FK (no cascade); `entry_edge_source_idx` |
| `target_entry_id` | text | NO | Soft FK (no cascade); `entry_edge_target_idx` |
| `edge_type` | text (old `EdgeType`) | NO | `entry_edge_session_type_idx` (composite with `session_id`) |
| `display_order` | integer | YES | `entry_edge_session_type_idx` |
| `metadata` | text (JSON) | YES | — |
| `time_created` / `time_updated` | integer | NO | — |

**Status**: Still present in schema. Only used by `graph-migration.ts` for SELECT during backfill migration. No write path inserts into it during normal operation. (`EntryEdgeTable` is imported in `session.ts` line 10 but never used in that file for any operation.)

#### `EntriesTable` (lines 189–198) — new vision-aligned ledger

| Column | Type | Nullable | Key/Index |
|--------|------|----------|-----------|
| `id` | text | NO | PK |
| `type` | text (`EntryType`) | NO | — |
| `actor` | text | NO | — |
| `runner_type` | text | NO | — |
| `content_text` | text | YES | — |
| `payload_json` | text (JSON) | YES | — |
| `status` | text | NO | — |
| `created_at` | text | NO | — |

**Status**: Schema exists. Only written to by `graph-migration.ts` (backfill). Normal write path (`updateMessage`) does not populate this table.

#### `EdgesTable` (lines 202–222) — new universal polymorphic edge table

| Column | Type | Nullable | Key/Index |
|--------|------|----------|-----------|
| `id` | text | NO | PK |
| `from_type` | text | NO | `edges_from_idx` (from_type, from_id) |
| `from_id` | text | NO | `edges_from_idx` |
| `to_type` | text | NO | `edges_to_idx` (to_type, to_id) |
| `to_id` | text | NO | `edges_to_idx` |
| `type` | text (`EdgeType`) | NO | `edges_type_idx` |
| `seq_in_parent` | integer | YES | `edges_contains_idx` (from_type, from_id, type, seq_in_parent) |
| `label` | text | YES | — |
| `metadata` | text (JSON) | YES | — |
| `created_at` | text | NO | — |

**Status**: Active and used. `edges_contains_idx` is the correct composite index for timeline reads. Written to by `Session.updateMessage()` (reply_to edges) and `graph-migration.ts` (contains + reply_to + legacy edge migration). Also written by `Session.addEdge()`.

---

### 1.2 Type Definitions — `packages/session/src/types.ts`

#### `Actor` (lines 3–8)
```typescript
export type Actor =
  | { kind: "user"; id: string }
  | { kind: "assistant"; id: string }
  | { kind: "agent"; id: string }        // @deprecated, use "assistant"
  | { kind: "workflow"; id: string }
  | { kind: "system"; id: string }
```

#### `EdgeType` (lines 12–23) — already vision-aligned
```typescript
export type EdgeType =
  | "instantiated_as"  // workflow → session
  | "contains"         // session → entry (seq_in_parent = canonical timeline order)
  | "forked_from"      // session → session
  | "forked_at"        // session → entry (fork point)
  | "reply_to"         // entry → entry (sequential chat response)
  | "caused"           // entry → entry (causal: tool result, retry, error)
  | "produced"         // entry → entry/artifact
  | "used"             // entry → tool/artifact/resource
  | "branch"           // entry → entry (fan-out)
  | "merge"            // entry → entry (fan-in)
```

#### `EntryNodeType` (line 26)
```typescript
export type EntryNodeType = "workflow" | "session" | "entry" | "tool" | "artifact"
```

#### `Edge` (lines 30–41)
```typescript
export type Edge = {
  id: string; from_type: EntryNodeType; from_id: string
  to_type: EntryNodeType; to_id: string; type: EdgeType
  seq_in_parent?: number; label?: string
  metadata?: Record<string, unknown>; created_at: string
}
```

#### `EntryEdge` (line 44) — deprecated
```typescript
/** @deprecated Use Edge */
export type EntryEdge = Edge
```

#### `EntryType` (lines 48–54)
```typescript
export type EntryType =
  | "message" | "tool_call" | "tool_result"
  | "workflow_step" | "error" | "system_event"
```

#### `Entry` (lines 56–65)
```typescript
export type Entry = {
  id: string; type: EntryType; actor: string; runner_type: string
  content_text?: string; payload_json?: Record<string, unknown>
  status: string; created_at: string
}
```

#### `SessionType` (line 139)
```typescript
export type SessionType = "role" | "scope" | "worker" | "scratchpad"
```

#### `SessionStatus` (line 141)
```typescript
export type SessionStatus = "active" | "archived" | "closed" | "waiting"
```

#### `SessionMeta` (lines 182–207) — key relationship fields
- `id`, `type: SessionType`, `status: SessionStatus`
- `parent?: SessionParent` → `{ sessionId, messageId? }` — who spawned this session
- `spawnDepth?: number`
- `agentId?`, `model?`, `systemPrompt?`, `path?`, `readPath?`, `cwd?`
- No `workflow_run` here — it lives only in the DB column, not in SessionMeta

---

### 1.3 MessageV2 Types — `packages/session/src/message-v2.ts`

#### `MessageV2.Actor` Zod schema (lines 52–60) — **NOT aligned to vision**
```typescript
export const Actor = z.object({
  kind: z.enum(["user", "agent", "workflow", "scheduler"]),
  id: z.string(),
})
```
Uses `"agent"` (not `"assistant"`) and includes `"scheduler"` which has no vision equivalent.

#### Part union (13 discriminated variants, line 435)
`TextPart | SubtaskPart | ReasoningPart | FilePart | ToolPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | AgentPart | RetryPart | CompactionPart | FallbackSwitchPart`

All parts share base fields: `id`, `sessionID`, `messageID`, plus `type` discriminator.

Key parts:
- **`ToolPart`** (lines 389–398): `callID`, `tool`, `state: ToolState` (4 status variants: pending/running/completed/error)
- **`StepFinishPart`** (lines 300–319): `reason`, `cost`, `tokens`, `schedule_id?`
- **`AgentPart`** (lines 227–240): `name`, `source?` — used for agent attribution

#### `MessageV2.Info` union (line 516) — discriminated on `role`

**User** (lines 405–431): `role: "user"`, `from?: Actor`, `agent` (required), `model` (required), `time.created`

**Assistant** (lines 455–513): `role: "assistant"`, `from?: Actor`, `agent` (required), `providerID` + `modelID` (required), `parentID?` (within-session parent link), `workflowMeta?` (`{ workflowID, workflowRunID, nodeID?, nodeType?, nodeLabel? }`), `cost` + `tokens` (required)

#### `MessageV2.WithParts` (lines 562–566): `{ info: Info, parts: Part[] }`

#### `MessageV2.stream(sessionID)` (lines 757–827)
- Reads from `MessageTable` ordered by `DESC time_created` (line 766) — **old model**
- Batches 50 rows at a time with offset pagination
- Joins with `PartTable` (parts ordered by id ASC)
- Batch-resolves `parentSessionID` from `parent_message_id` cross-session lookups
- **Does NOT use EdgesTable or EntriesTable**

#### `MessageV2.filterCompacted()` (lines 863–878)
- Collects messages until finding a User compaction message following a completed summary Assistant
- Reverses the collected batch (chronological order)
- Input is `AsyncIterable<WithParts>`, output is `WithParts[]`

#### `MessageV2.toModelMessages()` (lines 572–755)
- Converts `WithParts[]` to AI SDK `ModelMessage[]`
- Skips: zero-part messages, workflow-runner messages with running/pending tools, assistant messages with unhandled errors
- Adds actor attribution prefix `[kind:id]` (except user / matching active agent)
- Deduplicates tool names in final result

---

### 1.4 UI Types — `apps/web/lib/projectflows.ts`

#### `EdgeType` (line 11) — already vision-aligned (matches `types.ts`)
#### `EntryNodeType` (line 23) — matches `types.ts`
#### `Edge` (line 25) — matches `types.ts`
#### `EntryEdge` (line 39) — deprecated alias for `Edge`

**`Session`** (lines 83–114): includes `parentSessionID?`, `replyToSessionID?`, token tracking, `model?` override

**`UserMessage`** (line 116): `id`, `sessionID`, `role: "user"`, `time.created`, `agent`, `model`; optional `parentMessageID`, `parentSessionID`, `schedule_id`, `hidden`

**`AssistantMessage`** (line 133): `id`, `sessionID`, `role: "assistant"`, `time`, `providerID`, `modelID`; optional `from: { kind, id }`, `agent`, `error`, `parentMessageID`, `parentSessionID`, `schedule_id`, `hidden`

**`MessageWithParts`** (line 251): `{ info: Message, parts: Part[] }` — the primary UI-layer message shape

**`Part` union** (4 variants + open extension): `TextPart | ReasoningPart | ToolPart | FallbackSwitchPart | (unknown)`

---

### 1.5 Vision Target Comparison

| Dimension | Current | Vision Target | Gap? |
|-----------|---------|--------------|------|
| Actor kinds | `"user" \| "agent" \| "workflow" \| "scheduler"` (MessageV2); `"user" \| "assistant" \| "agent"(deprecated) \| "workflow" \| "system"` (types.ts) | `"user" \| "assistant" \| "workflow" \| "system"` | YES — `"agent"` still in active use; `"scheduler"` unmapped |
| EdgeType | Vision-aligned 10-type set in types.ts | Same | NO |
| Entries schema | `EntriesTable` exists, schema correct | Same | NO (schema OK, write path gap) |
| Edges schema | `EdgesTable` exists, correct index | Same | NO (schema OK, write path gaps) |
| `seq_in_parent` | Exists on `EdgesTable`, used by `Session.messages()` | `contains` edges with `seq_in_parent` | NO (schema OK, write path gap) |
| Entry fields | `id, type, actor, runner_type, content_text, payload_json, status, created_at` | Same | NO |
| No FK `tool_id`/`workflow_node_id` on entries | Correct — not present | Same | NO |
| Old `EntryEdgeTable` | Still present with old edge types | Should be migrated away | YES — schema coexists |

---

## 2. Write Paths (AC2)

### 2.1 Message Write Path

```
User input / agent response
    ↓
SessionPrompt.loop() [prompt.ts:313]
    ↓ passes parentMessageID
Session.updateMessage(info, parentMessageID?) [session.ts:1208]
    ├─ INSERT/UPDATE MessageTable (data = full MessageV2.Info JSON)
    └─ if parentMessageID set:
          └─ INSERT EdgesTable: from_type="entry", from_id=parent, to_type="entry", to_id=this,
                                type="reply_to", metadata={delegation:true} if cross-session
                                onConflictDoNothing
```

Key detail: `isDelegation` at session.ts:1237 is determined by reading the parent message's `session_id` from `MessageTable` and comparing to `msg.sessionID`. If different → `metadata.delegation: true`.

### 2.2 Part Write Path

```
Session.updatePart(part) [session.ts:1320]
    └─ INSERT/UPDATE PartTable (data = Part JSON minus id/sessionID/messageID)
       onConflictDoUpdate(target: PartTable.id, set: { data })
```

No edges or entries written. Events published: `MessageV2.Event.PartUpdated`.

### 2.3 Edge Write Path in `updateMessage()`

`reply_to` edges are created at session.ts:1241–1272 when `parentMessageID` is set. The edge written is:

```
from_type: "entry", from_id: <parentMessageID>
to_type: "entry", to_id: <this message id>
type: "reply_to"
seq_in_parent: null
metadata: { delegation: true } if cross-session parent
```

**No `contains` edges are written by `updateMessage()`.**  
`Session.addEdge()` (session.ts:1502) provides a general-purpose edge-write method but is not called by the normal message write path.

### 2.4 Workflow Runner Capture — `packages/workflow/src/runner.ts`

```
runWorkflow()/  _runWorkflow() [runner.ts:887/912]
    ├─ Session.setWorkflowRun({ workflowID, workflowRunID, startedAt }) → SessionTable.workflow_run JSON column
    │
    └─ runSubGraph() [runner.ts:307]
           └─ startNodeToolPart(sessionId, toolName, input, directory, meta) [runner.ts:60]
                  ├─ Session.updateMessage({ role:"assistant", from:{kind:"workflow",...}, workflowMeta })
                  │       → MessageTable row; reply_to edge if parentID set (none here — no parentID passed)
                  └─ Session.updatePart({ type:"tool", state:{status:"running",...} })
                          → PartTable row
                  ├─ .finish(output) → Session.updatePart (status:"completed", output stringified)
                  │                 → Session.updateMessage (time.completed)
                  └─ .fail(error)   → Session.updatePart (status:"error")
                                    → Session.updateMessage (time.completed)
```

**No `instantiated_as` edge is created by `runWorkflow()` or `setWorkflowRun()`.**  
`setWorkflowRun()` only updates the `workflow_run` JSON column on `SessionTable` (session.ts:906).

Workflow output serialization (runner.ts:107–122): `typeof output === "string" ? output : JSON.stringify(output, null, 2)` — string-only, not structured `payload_json`.

### 2.5 `graph-migration.ts` Backfill

**File**: `packages/session/src/graph-migration.ts`

#### `EDGE_TYPE_MAP` (lines 20–30) — old `EntryEdgeTable` edge types → new `EdgeType`

| Old (EntryEdgeTable) | New (EdgesTable) |
|----------------------|-----------------|
| `reply` | `reply_to` |
| `tool_call` | `used` |
| `tool_result` | `caused` |
| `delegation` | `reply_to` (metadata.delegation preserved) |
| `workflow_step` | `contains` |
| `retry` | `caused` |
| `fork` | `forked_from` |
| `fan_out` | `branch` |
| `fan_in` | `merge` |

#### `migrateSession(sessionId)` (lines 36–189)

1. **Idempotency guard** (lines 40–52): checks if `contains` edges already exist for this session in `EdgesTable`; returns 0 if so.
2. **Load messages** ordered by `ASC time_created` (line 60).
3. **For each message**:
   - Inserts into `EntriesTable`: `type="message"`, actor derived from `data.from.kind` or `data.role`, `content_text` = first text part (max 1000 chars), `payload_json` = full `data`, `status="complete"`, `created_at` = ISO from `time_created`.
   - Inserts `contains` edge into `EdgesTable`: `from_type="session"`, `from_id=sessionId`, `to_type="entry"`, `to_id=messageId`, `seq_in_parent=i` (loop index).
   - If `parent_message_id` set: inserts `reply_to` edge. Detects cross-session delegation by checking parent's `session_id`.
4. **Legacy EntryEdgeTable migration** (lines 158–186): SELECTs all `EntryEdgeTable` rows for the session, maps edge type via `EDGE_TYPE_MAP`, inserts into `EdgesTable` with `metadata._migrated_from=<originalType>` and `seq_in_parent=display_order`.

---

## 3. Read Paths and Ordering (AC3)

### 3.1 `Session.messages()` — contains-edge ordering (session.ts:683–720)

```typescript
// 1. Query EdgesTable for contains edges (seq_in_parent order)
const containsEdges = db.select({ to_id, seq_in_parent })
  .from(EdgesTable)
  .where(from_type="session", from_id=sessionID, type="contains")
  .orderBy(asc(seq_in_parent))
  .all()

// 2. Stream all messages via MessageV2.stream() (DESC time_created), then reverse
for await (const msg of MessageV2.stream(sessionID)) { result.push(msg) }
result.reverse()  // now ASC time_created

// 3. If contains edges exist: re-sort by seq_in_parent
if (containsEdges.length > 0) {
  result.sort((a, b) => seqMap.get(a.info.id) - seqMap.get(b.info.id))
}
```

**Fallback behavior**: If no `contains` edges exist (new session, migration not yet run), result is in `time_created` ASC order. This is a graceful degradation, not a crash. However, the ordering may differ from `seq_in_parent` order if messages were written out of chronological order.

### 3.2 `MessageV2.stream()` — legacy `time_created` ordering (lines 757–827)

- Reads from `MessageTable` + `PartTable` only
- `orderBy(desc(MessageTable.time_created))` — **old ordering, not `contains` edges**
- 50-row batch with offset pagination
- Resolves `parentSessionID` by batch-joining `MessageTable` on `parent_message_id`
- **Does not use `EdgesTable` or `EntriesTable`**

Two independent code paths for message ordering:
- `Session.messages()` → prefers `contains` edges with `seq_in_parent`
- `MessageV2.stream()` → always uses `time_created` DESC

### 3.3 `filterCompacted()` and `toModelMessages()`

`filterCompacted()` (lines 863–878): Operates on `AsyncIterable<WithParts>`. Clips history at the most recent User compaction message following a completed summary Assistant message. Used to implement sliding-window context before sending to LLM.

`toModelMessages()` (lines 572–755): Converts `WithParts[]` to AI SDK format. Filters zero-part messages, skips running/pending workflow tool calls, deduplicates tool names. Adds actor attribution prefix `[kind:id]` unless it's a user message or the speaking agent matches the active agent.

### 3.4 UI Rendering Pipeline

```
useOpendora() hook [use-projectflows.ts]
  └─ GET /session/{id}/message → MessageWithParts[]
       ↓
chatbot.tsx
  ├─ messagesToExecutionState(messages, ...) [lib/execution-graph/messages-to-state.ts]
  │     → ExecutionState { steps, runs, cursor, stepOrder }
  ├─ computeLayout(state, options) [lib/execution-graph/layout.ts]
  │     → RenderLayout { steps, paths, runTags }
  └─ ConversationCanvas [components/execution-graph/conversation-canvas.tsx]
        ├─ SVG overlay: animated paths (Framer Motion) + node dots
        └─ MessageRow[i] per visible message
              └─ getTimelineSteps(parts, error?) → TimelineStep[]
                    → reasoning → tool calls → fallback switches → final reply
```

SSE streaming updates arrive as `message.updated` (full info replacement) and `message.part.delta` (streaming text delta) events.

---

## 4. Session Relationships (AC4)

### 4.1 `parent_session_id` — delegation/child/worker

Column on `SessionTable`. Set via `Session.setParentSessionID()` (session.ts:538) with cycle detection. Indexed by `session_parent_session_idx`. Used for:
- Worker sessions spawned by a parent agent session
- Delegation: sub-sessions created to handle specific tool calls
- `Session.list({ roots: true })` filters to sessions with `null` parent_session_id

**No `forked_from` edge is created** when `parent_session_id` is set.

### 4.2 `reply_to_session_id`

Column on `SessionTable`. Set during `createNext()` if provided. No special index. Represents "this session is a reply to that session's conversation" — distinct from the parent/child worker relationship.

### 4.3 `parent_message_id` → `reply_to` edge

Column on `MessageTable`. Written by `Session.updateMessage()` as a parameter. When set, a `reply_to` edge is created in `EdgesTable`. Cross-session parent detection at session.ts:1237 checks the parent's `session_id` — if different, sets `metadata.delegation: true` on the edge.

Within-session: `parentID` field on `AssistantMessage` (the `parentMessageID` parameter becomes `data.parentID` stored in JSON).

### 4.4 `Session.fork()` — message copy, no structural edges (lines 317–357)

Fork creates a new session via `createNext()`, then copies all messages (and parts) up to the optional `messageID` cutoff. Each message gets a new ID; `parentID` pointers are remapped via `idMap`. Copies are written via `updateMessage()` which creates `reply_to` edges for messages with parents.

**No `forked_from` or `forked_at` edges are created by `Session.fork()`.**

### 4.5 `workflow_run` JSON column

Column on `SessionTable`. Set via `Session.setWorkflowRun()`. Contains `{ workflowID, workflowRunID, startedAt }` while a workflow is running; set to `null` on completion. Not linked to `EdgesTable`.

**No `instantiated_as` edge (workflow → session) is created by any current code path.**

---

## 5. Server/SDK and UI Assumptions (AC5)

### 5.1 API Surfaces

All API traffic flows through `apps/web/lib/projectflows.ts` → `/api` proxy → backend at `http://localhost:4097` (or `NEXT_PUBLIC_OPENDORA_URL`). No `server/` directory exists — the server is a separate process.

| Endpoint | Method | Purpose | Response shape |
|----------|--------|---------|----------------|
| `/session/{id}/message` | GET | Fetch session messages | `MessageWithParts[]` |
| `/session/{id}/graph` | GET | Fetch graph view | `{ messages: MessageWithParts[], edges: Edge[] }` |
| `/session/{id}/message` | POST | Send prompt | `MessageWithParts` |
| `/session/{id}/prompt_async` | POST | Fire-and-forget prompt | (streams via SSE) |
| `/event` | GET (SSE) | Event stream | SSE: `message.updated`, `message.part.delta`, etc. |

The `/session/{id}/graph` endpoint already returns `Edge[]` alongside messages. Its usage in the UI is limited (execution-graph canvas uses `messagesToExecutionState`, not the graph edges directly).

### 5.2 UI Type Expectations

The UI consumes `MessageWithParts[]` from the messages API. The `Edge`/`EntryEdge` types are imported in `lib/projectflows.ts` (lines 25, 39) and the graph endpoint returns edges, but the primary chat render path (`chatbot.tsx` → `messagesToExecutionState`) derives graph structure from `MessageWithParts` shape alone — it does not consume `Edge[]` from the server for the default chat view.

### 5.3 SSE Streaming

`apps/web/app/api/event/route.ts` is an explicit SSE proxy that pipes the backend event stream to the browser. Key event types:
- `message.updated` (use-projectflows.ts:568): Full message info replaced in state
- `message.part.delta` (use-projectflows.ts:677): Streaming text delta with `{ sessionID, messageID, partID, field, delta }` — used for real-time text streaming during LLM generation

---

## 6. Migration and Test Coverage (AC6)

### 6.1 `graph-migration.ts` Details

Already documented in §2.5 above. Key characteristics:
- Idempotent per session (guards on `contains` edge existence)
- Sequential per-session iteration (no batching)
- Creates both `EntriesTable` rows and `EdgesTable` rows in one pass
- Maps old `EntryEdgeTable` edge types to new `EdgeType` values
- Actor derivation: `data.from.kind ?? data.role ?? "system"` — preserves old `"agent"` string in entries (does not rename to `"assistant"`)

### 6.2 Storage Adapter Interface — `packages/session/src/storage/adapter.ts`

```typescript
export interface StorageAdapter {
  // Sessions
  createSession(meta: SessionMeta): Promise<void>
  getSession(id: string): Promise<SessionMeta | null>
  updateSession(id: string, patch: Partial<SessionMeta>): Promise<void>
  listSessions(filter?: SessionFilter): Promise<SessionMeta[]>
  deleteSession(id: string): Promise<void>
  // Messages
  appendMessage(msg: Message): Promise<void>
  getMessages(sessionId: string): Promise<Message[]>
  getMessage(id: string): Promise<Message | null>
}
```

**No methods for `entries`, `edges`, or graph queries.** The `EntriesTable` and `EdgesTable` are accessed directly via Drizzle in session.ts (bypassing the `StorageAdapter` interface entirely).

Storage adapters under `packages/session/src/storage/`: `adapter.ts`, `drizzle/`, `jsonl/`, `postgres/`, `sqlite/`

### 6.3 JSONL and Postgres Adapter Edge Support

**JSONL adapter** (`packages/session/src/storage/jsonl/index.ts`): Implements `StorageAdapter` using flat files (JSON index + per-session JSONL files). **No edges or entries support.** Sessions are stored in `sessions.json`; messages in `{id}.jsonl` per session.

**Postgres adapter** (`packages/session/src/storage/postgres/index.ts`): Implements `StorageAdapter` against `PgSessionsTable` + `PgMessagesTable` (Drizzle Postgres schemas). Own migration DDL for `sessions` + `messages` tables only. **No edges or entries support.**

The `EdgesTable` and `EntriesTable` exist only in the SQLite Drizzle schema (`session.sql.ts`) — they are not defined in the Postgres adapter's schema and not implemented in the JSONL adapter.

### 6.4 Test Coverage Summary

Test files in `packages/session/test/`:

| File | What it covers |
|------|---------------|
| `session.test.ts` | Session.started event, session path inheritance |
| `message-v2.test.ts` | `toModelMessage()` (12 cases), `fromError()` — no edge/entry tests |
| `compaction.test.ts` | Context compaction lifecycle |
| `prompt.test.ts` | SessionPrompt.loop() behavior |
| `retry.test.ts` | Retry logic |
| `revert-compact.test.ts` | Compaction revert |
| `structured-output.test.ts` | Structured output parsing |
| `structured-output-integration.test.ts` | Integration structured output |
| `instruction.test.ts` | Instruction injection |
| `llm.test.ts` | LLM interaction patterns |

**No test coverage for**:
- `Session.addEdge()` / `Session.getEdges()`
- `graph-migration.ts` (migrateSession / migrateAllSessions)
- `contains` edge creation or `seq_in_parent` ordering
- `Session.fork()` edge behavior
- `EntriesTable` writes
- `WorkflowRunner` → session edge linkage
- Cross-session `delegation` edge detection

---

## 7. Gap Analysis (AC7)

### 7.1 Schema Gaps

| Gap | Detail |
|-----|--------|
| `EntryEdgeTable` still present | Session-scoped legacy table coexists with universal `EdgesTable`; must be removed after migration |
| `MessageTable`/`PartTable` still primary | All write paths still target old tables; no dual-write to `EntriesTable` |
| `StorageAdapter` has no edges/entries methods | Interface is session+message only; JSONL and Postgres backends have no schema for new model |

### 7.2 Write Path Gaps

| Gap | Detail | Risk |
|-----|--------|------|
| No `contains` edge on message write | `updateMessage()` creates `reply_to` but not `contains`; only `graph-migration.ts` creates `contains` | HIGH — `Session.messages()` reads ordering from `contains` edges; new sessions have none until migration runs |
| No `EntriesTable` write on message write | `updateMessage()` only writes to `MessageTable`; `EntriesTable` only populated by migration backfill | HIGH — live data never enters entries table |
| No `instantiated_as` edge on workflow start | `runWorkflow()` / `setWorkflowRun()` only updates JSON column on session | MEDIUM — workflow → session relationship not in graph |
| No `forked_from`/`forked_at` edges on fork | `Session.fork()` copies messages but creates no structural edges | MEDIUM — fork topology not in graph |
| No `used`/`caused` edges on tool calls | Tool call/result pairs written as ToolPart states, not as separate entries with edges | LOW (for now) — can be added later |
| Workflow runner output stringified | `finish()` calls `JSON.stringify(output, null, 2)` for non-strings; `payload_json` would change this | LOW — serialization contract change |

### 7.3 Ordering Gaps

| Gap | Detail |
|-----|--------|
| `Session.messages()` vs `MessageV2.stream()` ordering divergence | `Session.messages()` uses `contains`/`seq_in_parent` when available; `MessageV2.stream()` always uses `time_created DESC`; they give different results for same session after migration |
| `Session.messages()` fallback to `time_created` | For sessions without `contains` edges, falls back to `time_created ASC`; graceful but not vision-canonical |
| No `contains` edge written during normal operation | New sessions can never get canonical `seq_in_parent` ordering without running migration |

### 7.4 Actor Naming Gaps

| Current value | Where used | Vision target | Action needed |
|---------------|-----------|---------------|--------------|
| `"agent"` | `MessageV2.Actor` Zod schema, active write paths (`SessionPrompt.loop`, `graph-migration` actor derivation) | `"assistant"` | Rename in write path + migration compatibility |
| `"scheduler"` | `MessageV2.Actor` Zod schema | No equivalent (nearest: `"system"`) | Map to `"system"` or add to migration as `"system"` |
| `"agent"` (deprecated) | `types.ts Actor` | Kept as deprecated alias | Purge once write paths updated |

### 7.5 Edge Type Gaps

Old `EntryEdgeTable` edge types (`reply`, `tool_call`, `tool_result`, `delegation`, `workflow_step`, `retry`, `fork`, `fan_out`, `fan_in`) still exist in schema. `graph-migration.ts` maps them to new types, but the old table itself is not removed. Active code never inserts to `EntryEdgeTable`, so no new data is being added to it.

### 7.6 API Compatibility Gaps

- API returns `MessageWithParts[]` (old shape); no `entries+edges` API shape yet
- `/session/{id}/graph` endpoint exists and returns `Edge[]` but UI primary render does not consume it for ordering
- `MessageV2.stream()` (used by `toModelMessages()` for LLM input) still uses `time_created` ordering — switching to `contains`/`seq_in_parent` would require updating this path too

---

## 8. Risks and Compatibility (AC7 continued)

### 8.1 Backward Compatibility Risks

| Risk | Severity | Detail |
|------|----------|--------|
| `Session.messages()` ordering regression for new sessions | HIGH | New sessions have no `contains` edges; read path falls back to `time_created` ASC. If `updateMessage()` starts writing `contains` edges and sets `seq_in_parent` incorrectly, display order breaks |
| `toModelMessages()` uses `MessageV2.stream()` ordering | MEDIUM | Switching `stream()` to `contains` edges could change LLM context window content, affecting agent behavior |
| Forked sessions have no `contains` edges | MEDIUM | After implementing forked_from/forked_at edges, `fork()` must also create `contains` edges for copied messages or they'll have no ordering in the new model |
| JSONL/Postgres backends have no edge/entries support | HIGH | Any code path that writes edges or entries will silently do nothing on these backends (or crash if they bypass `StorageAdapter`) |

### 8.2 Data Migration Risks

| Risk | Severity | Detail |
|------|----------|--------|
| `graph-migration.ts` runs per-session on demand | MEDIUM | No automatic trigger for new sessions; migration must be called explicitly or continuously |
| `fork()` copies messages but no `contains` edges for forked session | MEDIUM | Forked sessions will need separate migration run to get `contains` edges |
| Actor rename `"agent"` → `"assistant"` in migration | LOW | `graph-migration.ts` preserves original `"agent"` string in entries (line 95: `data.from.kind ?? data.role ?? "system"`); rename not applied during migration backfill |
| `"scheduler"` actor not mapped in migration | LOW | Not currently handled in `EDGE_TYPE_MAP` or entry creation |

### 8.3 Performance Risks

| Risk | Severity | Detail |
|------|----------|--------|
| `edges_contains_idx` is correct | LOW | `(from_type, from_id, type, seq_in_parent)` composite index exists and covers default timeline reads |
| `Session.messages()` loads all messages then sorts in-memory | MEDIUM | For large sessions (1000+ messages), loading all via `MessageV2.stream()` then sorting adds latency |
| `graph-migration.ts` is sequential | LOW | `migrateAllSessions()` iterates sessions one at a time; large deployments may need batching |
| `MessageV2.stream()` batch pagination with offset | LOW | Offset-based pagination degrades on large sessions; cursor-based would be better |

---

## 9. Recommended Implementation Sequence

### Phase 1: Close the `contains` edge write gap (CRITICAL, highest risk)

**File**: `packages/session/src/session.ts` — `updateMessage()`

Wire `contains` edge creation into `Session.updateMessage()`. On every new message write, compute the next `seq_in_parent` (count existing `contains` edges for the session + 1) and insert a `contains` edge: `session --contains(seq_in_parent)--> entry_id`. Use `onConflictDoNothing` for idempotency.

This is the highest-priority gap: `Session.messages()` already reads ordering from `contains` edges, but the write path never creates them for new sessions. Without this, new sessions always fall back to `time_created` ordering.

Dependency: None — can be done standalone.

### Phase 2: Wire `EntriesTable` writes alongside `MessageTable` writes (dual-write)

**Files**: `packages/session/src/session.ts` — `updateMessage()`, `updatePart()`

On each `updateMessage()` call, also upsert into `EntriesTable` with the correct `type`, `actor` (vision-aligned), `runner_type`, `content_text`, `payload_json`, `status`, `created_at`. On `updatePart()`, update the corresponding `EntriesTable` entry's `payload_json` and `status`.

This builds up live data in the entries table while keeping old tables intact. The actor rename (`"agent"` → `"assistant"`, `"scheduler"` → `"system"`) is applied here.

Dependency: Phase 1 should be done first (so `contains` edge points to a real `EntriesTable` id).

### Phase 3: Wire missing structural edges

**Files**: `packages/session/src/session.ts` — `fork()`; `packages/workflow/src/runner.ts` — `runWorkflow()`

- `Session.fork()`: After creating new session, insert `forked_from` edge (new_session → original_session) and optionally `forked_at` edge (new_session → fork_point_message_id in original session). Also ensure `contains` edges are created for all copied messages (Phase 1 handles this if `updateMessage()` creates them).
- `runWorkflow()` / `_runWorkflow()`: After `Session.setWorkflowRun()`, insert `instantiated_as` edge: `workflow --instantiated_as--> session`.

Dependency: Phase 1 (for fork `contains` edges to work on copied messages).

### Phase 4: Actor rename + compatibility layer

**Files**: `packages/session/src/session.ts` (write path), `packages/session/src/message-v2.ts` (Zod schema)

- Update `MessageV2.Actor` Zod schema to accept `"assistant"` as a valid `kind` value (alongside `"agent"` for backward compat reading).
- In entries write path (Phase 2), map `"agent"` → `"assistant"` and `"scheduler"` → `"system"`.
- Add deprecated `"agent"` → `"assistant"` coercion in `types.ts Actor` read paths.
- Update `graph-migration.ts` actor derivation to rename during backfill.

Dependency: Phase 2 (entries write path exists).

### Phase 5: Switch `MessageV2.stream()` to `contains` + `seq_in_parent` ordering

**File**: `packages/session/src/message-v2.ts` — `stream()`

Update `MessageV2.stream()` to query `EdgesTable` for `contains` edges (ordered by `seq_in_parent`) and use that to order message fetches, instead of `orderBy(desc(time_created))`. Maintain a fallback to `time_created` for sessions without `contains` edges.

This aligns `stream()` (used by `toModelMessages()` for LLM input) with `Session.messages()` (used by UI).

Dependency: Phase 1 (contains edges must exist for new sessions); Phase 2 (entries rows exist as targets).

### Phase 6: Update API to expose entries + edges

**Files**: Backend API routes (at `localhost:4097`), `apps/web/lib/projectflows.ts`

Add or extend API endpoints to return entries + edges data. The `/session/{id}/graph` endpoint already returns `Edge[]` — update it to return `Entry[]` from `EntriesTable`. Update UI consumer in `chatbot.tsx` to optionally use entries+edges for rendering if available.

Keep `MessageWithParts[]` shape functional via compatibility mapping from entries+edges.

Dependency: Phases 1–5.

### Phase 7: Storage adapter + backend support

**Files**: `packages/session/src/storage/adapter.ts`, `packages/session/src/storage/jsonl/index.ts`, `packages/session/src/storage/postgres/index.ts`

Add `edges`/`entries` methods to `StorageAdapter` interface. Implement in JSONL adapter (file-per-session edge store) and Postgres adapter (add DDL for `entries` and `edges` tables in MIGRATION_SQL). SQLite backend already uses these tables via Drizzle directly — connect through `StorageAdapter` for consistency.

Dependency: Phases 1–4 (defines what the interface needs to support).

### Phase 8: Remove old tables (post-verification)

After all phases are verified:
- Deprecate then remove `MessageTable`, `PartTable`, `EntryEdgeTable` from `session.sql.ts`
- Remove `graph-migration.ts` (or archive it)
- Run `migrateAllSessions()` for all existing sessions
- Remove backward-compat fallback code from `Session.messages()` and `MessageV2.stream()`

Dependency: All previous phases complete and verified.

---

## Verification

`git status` at investigation close shows only:
- New file: `.projectflows/goals/investigate-current-session-ledger-state/FINDINGS.md`
- No source code changes

All acceptance criteria covered:
- **AC1** (Schema and types): §1 — all 5 tables, all type definitions, vision comparison
- **AC2** (Write paths): §2 — message, part, edge, workflow runner, migration paths
- **AC3** (Read paths and ordering): §3 — both read paths, fallback behavior, UI pipeline
- **AC4** (Session relationships): §4 — parent_session_id, reply_to_session_id, parent_message_id, fork, workflow_run
- **AC5** (Server/SDK/UI assumptions): §5 — API surfaces, UI types, SSE streaming
- **AC6** (Migration and test coverage): §6 — migration details, adapter interface, backend support, test files
- **AC7** (Gap analysis, risks, sequencing): §§7–9 — schema/write/ordering/actor/API gaps, compatibility/data/performance risks, 8-phase implementation sequence
