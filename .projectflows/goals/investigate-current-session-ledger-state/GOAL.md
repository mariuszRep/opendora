---
name: investigate-current-session-ledger-state
title: Investigate current session ledger state before entries and universal edges refactor
description: Investigate the current OpenDora session, message, workflow, storage, API, and UI assumptions before implementing the unified entries plus universal edges architecture.
status: ready
type: investigation
scope: packages/session, packages/storage, packages/workflow, packages/runtime, server/sdk/API surfaces, apps/web chat/session rendering, migrations/tests
attempt: 0
max_attempts: 3
last_result: none
next_action: Inspect the current session/message/workflow/storage schema, APIs, runtime write paths, and UI read/render paths; produce a current-state report with migration risks and recommended implementation sequencing.
success_criteria:
  - Current session/message tables, types, and storage contracts are documented with file references.
  - Current workflow definition and workflow run/session linkage behavior is documented with file references.
  - Current tool-call/tool-result capture path is documented from runtime/workflow execution through session storage and UI display.
  - Current message ordering behavior is documented, including any parent pointers, timestamps, display order fields, or implicit ordering assumptions.
  - Current session parent/child, fork, delegation, nested-run, and workflow-run relationship behavior is documented.
  - Current server, SDK, and apps/web assumptions around messages/session history are identified.
  - Current migration/test coverage relevant to sessions, messages, workflow runs, and storage is identified.
  - Gaps, blockers, compatibility risks, and performance risks for moving to entries plus universal edges are listed.
  - A recommended implementation sequence is produced for the later refactor goal.
  - No source code changes are made during the investigation.
source: mixed
---

# Investigate current session ledger state before entries and universal edges refactor

## Goal

Produce a thorough, evidence-backed current-state report of how OpenDora currently stores, writes, reads, orders, and renders session history (messages, tool calls, workflow steps, edges) so the subsequent unified entries + universal edges implementation goal can be planned with known gaps, risks, and a sequenced migration path. This is an investigation-only goal — no source code, schema, API, or UI changes are made.

## Source Requirements

The VISION documents at `VISION.md` (root), `packages/session/VISION.md`, `packages/storage/VISION.md`, `packages/workflow/VISION.md`, and `packages/runtime/VISION.md` define the target architecture:

- **Entries** are the canonical immutable runtime ledger events; a chat message is one entry type. Minimal intrinsic fields: `id, type, actor, runner_type, content_text, payload_json, status, created_at`. No `tool_id` or `workflow_node_id` FK columns — link through edges.
- **Universal edges** table covering all persisted cross-entity relationships (workflows, sessions, entries, tools, artifacts/resources) with a single polymorphic `from_type/from_id → to_type/to_id` model.
- **Edge types**: `instantiated_as`, `contains`, `forked_from`, `forked_at`, `reply_to`, `caused`, `produced`, `used`, `branch`, `merge`.
- **Ordering**: `session --contains(seq_in_parent=N)--> entry` is canonical visible timeline order. `created_at` is timestamp only, not canonical order.
- **Workflows** are reusable definitions; no `workflow_templates` concept. Sessions are runtime containers/runs/branches/workflow executions.
- **Actor set**: `user`, `assistant`, `workflow`, `system` (current code uses `agent` not `assistant`).
- **Entry types**: `message`, `tool_call`, `tool_result`, `workflow_step`, `error`, `system_event`.

The investigation must map the current implementation against this target to identify every gap, risk, and compatibility constraint.

## Problem / Motivation

The `session-graph-ledger-and-chat-rail` GOAL already defines the comprehensive migration to entries + universal edges. However, that goal was written from the VISION definition forward — it prescribes the target without having first systematically audited the current implementation. Several risks make a pre-refactor investigation essential:

1. **The current code already has an `EntryEdgeTable`** with its own set of edge types (`reply`, `tool_call`, `tool_result`, `delegation`, `workflow_step`, `retry`, `fork`, `fan_out`, `fan_in`) and a session-scoped model. This existing schema must be understood, and the migration from it to the universal edges model must be lossless.

2. **The current message model (`MessageTable` + `PartTable` + `MessageV2` types) is deeply embedded** in session write paths (`Session.updateMessage`, `Session.updatePart`), the runtime loop (`SessionPrompt.loop`), the workflow runner (`startNodeToolPart`/`finish`), the server/SDK APIs, and the UI rendering (`message-row.tsx`, `chatbot.tsx`). Every touch point must be catalogued before any migration sequencing can be trusted.

3. **Message ordering is currently implicit** — `MessageV2.stream()` orders by `time_created` descending, `parent_message_id` provides explicit parent linkage, and the existing `EntryEdgeTable.display_order` field exists but its usage is unclear. The move to `seq_in_parent` on `contains` edges is a semantic shift that requires understanding every current ordering assumption.

4. **Fork/delegation/nested-run relationships** are partially captured via `parent_session_id` on sessions, `parent_message_id` on messages, and `reply_to_session_id`. How these translate to the new edge types (`forked_from`, `forked_at`, `contains`, `instantiated_as`) must be traced.

5. **Server/SDK and UI layers** consume session history as `messages[]` arrays with `info` + `parts` shapes. The refactor must either add an entries+edges query path alongside the existing one, or provide a compatibility layer. Both options need the full consumer surface mapped.

Without this investigation, the refactor goal is flying blind — risks around backward compatibility, data migration, ordering semantics, and scope will surface mid-implementation as blockers.

## Vision Alignment

### Relevant product/project context

- **Root `VISION.md`**: Architecture naming (workflows=definitions, sessions=runtime containers, entries=ledger events, edges=relationships). Graph-backed ledger and UI projection are one delivery.
- **Root `VISION.md` boundary rules**: Session is universal execution ledger; storage is only persistence boundary; runtime owns execution orchestration.
- **`packages/session/VISION.md`**: Graph-backed entry ledger ownership, universal typed edges, entry actors/types, intrinsic entry fields, `seq_in_parent` ordering, cross-entity edge types, indexed timeline reads.
- **`packages/storage/VISION.md`**: Single physical edge table for cross-entity relationships; SQLite/relational acceptable for graph model; storage owns persistence, session owns semantics.
- **`packages/workflow/VISION.md`**: Workflows are reusable definitions; Node-as-Tool standard for session visibility; workflow-run linkage to sessions.
- **`packages/runtime/VISION.md`**: Runtime orchestrates; session records; run state goes through storage.
- **Existing `session-graph-ledger-and-chat-rail/GOAL.md`**: The target refactor goal this investigation feeds into. Contains target schema, edge type list, and phased implementation plan.
- **Existing `chat-side-rail/GOAL.md`**: Superseded UI-only goal; retained for UI-phase guidance.
- **`.projectflows/goals/unified-durable-run/GOAL.md`**: Unified Durable Run migration phases — checkpoint contract, checkpoint-driven runner, suspend/resume, unified executor, conversation→workflow projection.
- **`packages/session/MIGRATION.md`**: _(replaced by the unified-durable-run GOAL)_ — session's slice of the UR migration was run state shape, resume replaces reconcile, suspended status, built-in chat workflow.

### Product/non-goal constraints

- Workflows are reusable definitions — no `workflow_templates` concept.
- Sessions are durable run containers that may participate in typed edges.
- No new actor types beyond `user`, `assistant`, `workflow`, `system`.
- No new entry types beyond `message`, `tool_call`, `tool_result`, `workflow_step`, `error`, `system_event`.
- No `tool_id` or `workflow_node_id` FK columns on entries — link through edges.
- Branching inferred from topology, not explicit branch entry types.
- Source of truth is session data (entries + edges), not UI component state.
- Existing behavior must be preserved for linear sessions.

## Convention Constraints

### Relevant technical/project constraints

- Read `AGENTS.md` at each scope before changing code during implementation phase.
- Read `.projectflows/goals/unified-durable-run/GOAL.md` before changing run state, checkpointing, workflow runner, or conversation loop.
- Do not modify source code during this investigation phase.
- Do not introduce new dependencies.
- All findings must be backed by file paths and line references in the investigation report.
- The investigation report should be committed to this goal folder as `FINDINGS.md` or appended to this GOAL.md under Investigation Findings.

### Required patterns for the investigation

- Trace write paths: follow a message from `SessionPrompt.loop` → `Session.updateMessage`/`updatePart` → `MessageTable`/`PartTable` DB writes → bus events → UI consumption.
- Trace workflow tool-call paths: follow a workflow node from `startNodeToolPart` → `finish`/`fail` → `Session.updateMessage`/`updatePart` → storage → UI display.
- Trace read paths: `MessageV2.stream()` → message + parts assembly → `toModelMessages()` → AI SDK → UI `Conversation` component.
- Trace edge creation: `Session.updateMessage` writing to `EntryEdgeTable` → existing backfill from `graph-migration.ts`.
- Map all type definitions and compare against the VISION target types.
- Map all storage adapters and their message/edge persistence.
- Map all server/SDK routes that read or write session history.
- Map all UI components that render messages, parts, tool calls, or edges.

### Forbidden patterns

- Do NOT modify any source code file during this investigation.
- Do NOT run schema migrations or database operations.
- Do NOT change configuration, dependencies, or build files.
- Do NOT add new files outside the `.projectflows/goals/investigate-current-session-ledger-state/` directory (except the investigation report itself).

### Verification commands (for the investigation report, not for running)

- Report contains file references that can be verified to exist.
- Report captures all packages and files listed in scope.
- No working tree changes exist except the new GOAL.md and optionally a FINDINGS.md.

## Scope

Inspect and document (do NOT change):

### 1. packages/session — schema, types, storage adapters, tests

- **Schema**: `session.sql.ts` — `SessionTable`, `MessageTable`, `PartTable`, `EntryEdgeTable` column definitions, indexes, foreign keys. Note: the `EntryEdgeTable` already exists with a `session_id` FK (session-scoped, not universal).
- **Types**: `types.ts` — `Actor`, `EdgeType`, `EntryEdge`, `Message`, `MessagePart`, `SessionMeta`, `SessionType`, `SessionStatus`, `SessionParent`. Compare `EdgeType` values (`reply`, `tool_call`, `tool_result`, `delegation`, `workflow_step`, `retry`, `fork`, `fan_out`, `fan_in`) against target types.
- **MessageV2 types**: `message-v2.ts` — `MessageV2.Info` (User/Assistant), `Part` variants (text, tool, reasoning, step-start, step-finish, etc.), `WithParts`, `stream()`, `filterCompacted()`, `toModelMessages()`. Note: `Actor` here includes `scheduler` kind (not in VISION target).
- **Session write paths**: `session.ts` — `create`, `fork`, `updateMessage`, `updatePart`, `removeMessage`, `setWorkflowRun`, `setParentSessionID`, `reconcileInterruptedToolParts`. Trace how `parentMessageID` flows into `updateMessage` and how edges are written to `EntryEdgeTable`.
- **Session read paths**: `session.ts` — `messages()`, `message()`, `children()`, `stream()`. Note ordering (desc by `time_created`).
- **Storage adapters**: `storage/adapter.ts` — `StorageAdapter` interface. Concrete implementations: `storage/sqlite/index.ts`, `storage/postgres/index.ts`, `storage/jsonl/index.ts`, `storage/drizzle/schema.ts`. Note which support edges.
- **Edge model**: `types.ts` `EntryEdge` (session-scoped with `session_id`, `source_entry_id`, `target_entry_id`, `edge_type`, `display_order`) vs target universal edge model.
- **Graph migration**: `graph-migration.ts` — `migrateSession()` / `migrateAllSessions()` backfill from `parent_message_id` to `EntryEdgeTable`. Note edge type used (`reply`), ordering (`time_created ascending`), idempotency guard.
- **Other**: `prompt.ts` (SessionPrompt.loop), `config.ts`, `processor.ts`, `compaction.ts`, `opendora-storage-adapter.ts`, `skill-tools.ts`.
- **Tests**: `test/session.test.ts`, `test/message-v2.test.ts`, `test/prompt.test.ts`, `test/compaction.test.ts`, `test/retry.test.ts`, `test/structured-output.test.ts`.

### 2. packages/storage — contracts/adapters/migrations

- **Schema**: `storage/src/schema.sql.ts` — `Timestamps` helper used by session.sql.ts.
- **Migrations**: `storage/src/json-migration.ts` — any relevant migration logic.
- **Storage contracts**: `storage/src/schema.ts`, `storage/src/db.ts`, `storage/src/control.ts` / `control.sql.ts` — run state / checkpoint contract if present.
- **Other tables**: `storage/src/schema-tables.sql.ts`, `storage/src/share.sql.ts`, `storage/src/project.sql.ts`, `storage/src/project-directory.sql.ts`, `storage/src/permission-rule.sql.ts`.

### 3. packages/workflow — definitions and run capture/session integration

- **Runner**: `runner.ts` — `runWorkflow()`, `runSubGraph()`, `startNodeToolPart()`, `finish()`, `fail()`. Note how workflow nodes create synthetic assistant messages with `providerID: "workflow"`, `workflowMeta`, the running→completed/error lifecycle, and how output is stringified.
- **Schema**: `schema.ts` — `Workflow`, `WorkflowNode`, `WorkflowEdge` types.
- **Node types**: `node-types.ts` — `NodeTypeId` enum.
- **Storage**: `storage.ts` — workflow definition persistence.
- **Edge routing**: how workflow edges (in the workflow graph sense, not the session edge sense) route execution between nodes. Note: these are different from session `EntryEdge` — document the terminology collision.
- **Tests**: any tests in `packages/workflow/test/`.
- **Durable run goal**: `.projectflows/goals/unified-durable-run/GOAL.md` — checkpoint-driven runner phase (replaced `packages/workflow/MIGRATION.md`).

### 4. packages/runtime — write paths for agent/tool/workflow execution

- **Agent execution**: `runtime/src/agent.ts` — how the agent loop writes to session.
- **Scheduler**: `runtime/src/scheduler.ts` — scheduled workflow runs and session creation.
- **State**: `runtime/src/state.ts` — any runtime state management.
- **Instance**: `runtime/src/instance.ts` — runtime lifecycle.

### 5. Server/SDK session read/write APIs

- Locate API routes that read/write session data, messages, and session history.
- Document the shape of data the SDK returns (likely `messages[]` with `info` + `parts`).
- Document any SSE streaming endpoints for session updates.
- Note: no files found under `server/` — determine where the server API layer lives (likely in an `apps/web` API route or a separate API server).

### 6. apps/web — chat/session rendering and assumptions around messages

- **Message rendering**: `message-row.tsx` — `MessageRowProps`, how it receives `info` (AssistantMessage | UserMessage), `parts`, and renders them. Note the `EntryEdge` import — how edges are used today.
- **Chat orchestration**: `chatbot.tsx` — how messages are fetched, streamed, and passed to `MessageRow`. Note `MessageWithParts`, `formatToolPayload`, `getTimelineSteps`, `toToolState`.
- **Opendora context**: `opendora-context.tsx` — session data access pattern.
- **Web lib types**: `lib/opendora.ts` — `Session`, `UserMessage`, `AssistantMessage`, `Message`, `MessageWithParts`, `EntryEdge`, `EdgeType` types used by UI. Compare against server-side types.
- **UI components**: `components/ai-elements/` — `conversation.tsx`, `message.tsx`, `tool.tsx`, `format-switcher.tsx`, `delegate-tool.tsx`, etc.
- **Agent colors**: `lib/agent-colors.ts`.

### 7. Migration files and tests relevant to session/message history

- **`.projectflows/goals/unified-durable-run/GOAL.md`**: master Unified Durable Run migration goal (replaced root and package MIGRATION.md files).
- **Existing tests**: identify tests that cover session creation, message ordering, forking, edge creation, graph migration, workflow run capture.

## Out of Scope

- Implementing the `entries` table or modifying the `MessageTable`.
- Implementing the universal `edges` table or modifying `EntryEdgeTable`.
- Migrating existing session data.
- Changing any API surface (server routes, SDK methods, session methods).
- Changing UI rendering, layout, or components.
- Changing workflow runner behavior or node-as-tool lifecycle.
- Adding or removing any dependencies (npm, bun, system).
- Editing any VISION.md, CONVENTIONS.md, AGENTS.md, or GOAL.md files (except within the investigation report itself).
- Running database migrations or modifying schema files.
- Writing or modifying test files.
- Modifying configuration or build files.

## Acceptance Criteria

### AC1: Schema and types documented
- Current `session.sql.ts` tables (`SessionTable`, `MessageTable`, `PartTable`, `EntryEdgeTable`) are documented with column names, types, indexes, and foreign keys.
- Current `types.ts` types (`Actor`, `EdgeType`, `EntryEdge`, `Message`, `MessagePart`, `SessionMeta`) are documented.
- Current `MessageV2` types (`Info`, `Part`, `WithParts`, `ToolState`, etc.) are documented.
- Current UI types (`lib/opendora.ts`: `Session`, `UserMessage`, `AssistantMessage`, `MessageWithParts`, `EntryEdge`) are documented.
- Differences between current types and VISION target types are explicitly noted.

### AC2: Write paths documented
- The message write path is traced: from `SessionPrompt.loop` / workflow runner through `Session.updateMessage`/`updatePart` to `MessageTable`/`PartTable` storage.
- The tool-call/tool-result write path is traced from workflow `startNodeToolPart` → `finish`/`fail` through session storage.
- Edge creation in `Session.updateMessage` is documented, including which edge types are written and under what conditions.
- The `graph-migration.ts` backfill path is documented.

### AC3: Read paths and ordering documented
- `MessageV2.stream()` ordering is documented (descending `time_created`, reversed after pagination).
- `parent_message_id` usage for message ordering is documented.
- `EntryEdgeTable.display_order` field usage (or lack thereof) is documented.
- The `filterCompacted()` and `toModelMessages()` conversion paths are documented.
- UI rendering of ordered messages is traced from API response → `chatbot.tsx` → `message-row.tsx`.

### AC4: Session relationship behavior documented
- `parent_session_id` on sessions is documented (used for delegation/worker/child relationships).
- `reply_to_session_id` on sessions is documented.
- `parent_message_id` on messages is documented (within-session parent pointer).
- Fork behavior (`Session.fork`) is documented, including how it copies messages and remaps `parentID`.
- Workflow run tracking (`workflow_run` JSON column on session) is documented.

### AC5: Server/SDK/UI assumptions identified
- All API surfaces that read or write session history are located and documented.
- The shape of data the UI expects (`messages[]` with `info` + `parts`) is documented.
- Any SSE streaming of session/message updates is documented.
- The `EntryEdge` type usage in the UI is documented (what is it used for today?).

### AC6: Migration/test coverage identified
- Existing `graph-migration.ts` is documented: what it migrates, edge types it creates, idempotency strategy.
- Relevant test files are listed with a summary of what they cover.
- Any missing test coverage relevant to the refactor is noted.

### AC7: Gap, risk, and sequencing analysis produced
- A gap list contrasting current implementation with the VISION target is produced, with file references.
- Compatibility risks (backward compatibility, data migration, ordering changes) are documented.
- Performance risks (indexing, query patterns for the new model) are documented.
- A recommended implementation sequence for the later refactor goal is produced, ordered by dependency.
- No source code changes are made during this investigation.

## Judgment Rubric

### Mark done only if:
- All acceptance criteria (AC1–AC7) are satisfied with evidence.
- The investigation report (GOAL.md appended findings or separate FINDINGS.md) contains specific file paths, line numbers, and type definitions for every documented component.
- A comprehensive gap analysis comparing current vs. target exists.
- A sequenced implementation recommendation for the refactor goal is present.
- `git status` shows no changes outside `.projectflows/goals/investigate-current-session-ledger-state/`.

### Continue if:
- Some write paths are documented but edge creation is not fully traced.
- Some types are documented but comparison to VISION target is partial.
- Some API surfaces are identified but UI rendering assumptions are not all mapped.
- Migration coverage is partially documented.
- Risk analysis exists but sequencing recommendation is rough.

### Block and ask if:
- A server/SDK API boundary cannot be located (there is no `server/` directory — the API layer may be embedded in `apps/web` or a different path).
- A storage adapter lacks edge support and migration path is unclear.
- The current `EntryEdgeTable` schema is actively used in ways not captured by the `Session.updateMessage` edge write path.
- The UI's use of `EntryEdge` suggests it already expects graph-like data — determine whether this is a real dependency.

## Implementation Guidance

### Suggested investigation approach

1. **Read VISION targets first** (already done during goal shaping — re-read as needed) to establish the target model.

2. **Trace write paths bottom-up**: Start with the DB schema (`session.sql.ts`), then `Session.updateMessage`/`updatePart`, then the callers (`SessionPrompt.loop`, workflow runner), then the runtime that calls those.

3. **Trace read paths top-down**: Start with the UI components, then the SDK/API layer, then `MessageV2.stream()`, then the DB queries.

4. **Map every type**: Collect all type definitions for Actor, EdgeType, EntryEdge, Message, MessageV2.Info, MessageV2.Part, etc. Create a side-by-side comparison with the VISION target types.

5. **Identify all ordering assumptions**: Every place that sorts messages, orders by `time_created`, uses `parent_message_id`, or relies on `display_order`.

6. **Map all session relationship fields**: `parent_session_id`, `reply_to_session_id`, `parent_message_id`, `parentSessionID`, `parentID` — where each is set, read, and used.

7. **Identify all existing edge usage**: Search for `EntryEdge` and `EntryEdgeTable` across the entire codebase.

8. **Compile findings** into a structured report organized by package/area.

### Report structure suggestion

```
# Investigation Findings: Current Session Ledger State

## 1. Schema and Types
### 1.1 Current Tables (packages/session/src/session.sql.ts)
### 1.2 Current Type Definitions
### 1.3 Current VISION Target Types (for comparison)

## 2. Write Paths
### 2.1 Message Write Path
### 2.2 Part Write Path
### 2.3 Edge Write Path
### 2.4 Workflow Runner Capture

## 3. Read Paths and Ordering
### 3.1 Message Stream / Query
### 3.2 Ordering Semantics
### 3.3 UI Rendering Pipeline

## 4. Session Relationships
### 4.1 Parent/Child Sessions
### 4.2 Delegation and Forking
### 4.3 Workflow Run Linkage

## 5. Server/SDK and UI Assumptions
### 5.1 API Surfaces
### 5.2 UI Type Expectations

## 6. Migration and Test Coverage
### 6.1 Existing Migration Code
### 6.2 Relevant Tests

## 7. Gap Analysis
### 7.1 Schema Gaps
### 7.2 Type Gaps
### 7.3 Ordering Gaps
### 7.4 API Compatibility Gaps

## 8. Risks and Compatibility
### 8.1 Backward Compatibility Risks
### 8.2 Data Migration Risks
### 8.3 Performance Risks

## 9. Recommended Implementation Sequence
### Phase 1: ...
### Phase 2: ...
### ...
```

### Key gaps to look for

1. **Edge type mismatch**: Current `EdgeType` has `reply`, `tool_call`, `tool_result`, `delegation`, `workflow_step`, `retry`, `fork`, `fan_out`, `fan_in`. Target has `instantiated_as`, `contains`, `forked_from`, `forked_at`, `reply_to`, `caused`, `produced`, `used`, `branch`, `merge`. Map how each current type maps to a target type (or multiple).

2. **Scope mismatch**: Current `EntryEdgeTable` is session-scoped (has `session_id` FK). Target universal edges table has no session FK — it uses `from_type/from_id` + `to_type/to_id` polymorphic references.

3. **Entries vs messages**: Current model writes messages to `MessageTable` (with `data` JSON column) and parts to `PartTable`. Target has an `entries` table. Current data must migrate or be reconciled.

4. **Ordering shift**: Current uses `time_created` for chronological order, plus `parent_message_id` for parent chains. Target uses `contains` edge with `seq_in_parent` as canonical order, with `created_at` as timestamp only.

5. **Actor naming**: Current `Actor` kind uses `"agent"` for assistant-type actors. VISION target uses `"assistant"`. `MessageV2.Actor` already uses `"agent"` kind but also includes `"scheduler"`.

6. **EntryEdgeTable usage**: Determine if the existing `EntryEdgeTable` is actively used by the UI (the `message-row.tsx` imports `EntryEdge`) and for what purpose.

7. **Server/SDK location**: No `server/` directory was found. Determine where the API boundary is — it may be in `apps/web` API routes or a separate package.

## Risks / Unknowns

1. **Server/SDK location**: The API boundary that serves session history to the UI was not found in a `server/` directory. It may be in `apps/web/app/api/` routes or served directly from packages. The investigation must locate this.

2. **Existing `EntryEdgeTable` usage**: The `message-row.tsx` already imports `EntryEdge` from `lib/opendora.ts`. If the UI already uses edges for display, the migration must preserve or upgrade that usage pattern.

3. **`Actor` vs `assistant` naming**: The current type system uses `"agent"` as an actor kind; VISION uses `"assistant"`. The investigation must determine whether this is a trivial rename or a semantic difference with downstream impact.

4. **`MessageV2.Actor` includes `scheduler`**: The current `MessageV2.Actor` zod schema includes `"scheduler"` as a valid kind, but VISION limits actors to `user`, `assistant`, `workflow`, `system`. Determine if `scheduler` is actively used and whether it maps to `system` or is a separate concern.

5. **Edge type overlap and conflict**: The current `EdgeType` union and the target edge types overlap in name but differ in semantics (e.g., current `reply` vs target `reply_to`; current `fork` vs target `forked_from`/`forked_at`). The migration must handle this cleanly.

6. **Current ordering is implicit**: `MessageV2.stream()` orders by `time_created` descending and reverses. But messages also have `parent_message_id` and assistant messages have `parentID`. The effective display order is not explicitly tracked — it's inferred. Adding explicit `seq_in_parent` may require recomputing order for every existing session.

7. **Workflow runner tool output is stringified**: `startNodeToolPart.finish()` stores `typeof output === "string" ? output : JSON.stringify(output, null, 2)`. Moving to entries with structured `payload_json` would change this serialization.

8. **Multiple storage backends**: SQLite, Postgres, and JSONL storage adapters all have slightly different schemas and migration paths. The universal edges model must be supported across all of them.

9. **Run state / checkpoint migration**: The `.projectflows/goals/unified-durable-run/GOAL.md` describes a separate but related migration (checkpoint-driven runner, suspend/resume, unified executor). The entries+edges refactor may intersect with these phases — the investigation should flag dependencies.

## Verification Expectations

This goal produces no automated test output. Verification is documentation validation:

1. **File references present**: Every documented schema, type, function, and path includes a file path and line number that can be verified to exist.
2. **No source diffs**: `git diff` (or `git status`) shows no changes to any source file outside `.projectflows/goals/investigate-current-session-ledger-state/`.
3. **Only new files**: The only new files are the GOAL.md (this file) and optionally a FINDINGS.md report.
4. **Report completeness**: The investigation report (whether appended to GOAL.md or as FINDINGS.md) covers all scope areas listed above.
5. **Gap analysis present**: A clear gap list comparing current to VISION target exists.
6. **Sequencing recommendation present**: A phased implementation sequence for the refactor goal exists.

## Attempts

No attempts yet.

## Do Not Repeat

None yet.

## Verification Log

No verification yet.

## Final Outcome

Pending.

## Ready For Execution

- Status: yes
- Reason: The target VISION documents are well-defined. The scope of investigation is clearly bounded (read-only, no source changes). The codebase structure is understood from goal shaping. The required investigation outputs (current-state report, gap analysis, risk assessment, implementation sequencing) are explicitly defined as success criteria. The investigation can proceed independently and the findings will directly feed the subsequent refactor implementation goal.
