---
name: session-graph-ledger-and-chat-rail
title: Migrate session/message/edge/workflow architecture to unified entries and universal edges per vision
description: Synchronize and rework packages/session, packages/storage, packages/workflow, packages/runtime, server/sdk/api, and apps/web consumers from current message-centric model to unified entries + universal edges architecture aligned with the OpenDora vision. Chat side rail UI projection is explicitly downstream/out-of-scope unless needed for data validation.
status: ready
type: migration
scope: packages/session, packages/storage, packages/workflow, packages/runtime, server/sdk/API surfaces, apps/web consumers as needed for consumption alignment, migrations/tests/docs
attempt: 0
max_attempts: 5
last_result: none
next_action: Consume investigate-current-session-ledger-state findings first as Phase 0 prerequisite; then implement phased migration across: (1) target schema/contracts, (2) compatibility layer, (3) write paths, (4) read paths/APIs, (5) performance indexes, (6) verification/backward-compatibility.
success_criteria:
  - Unified entries table with intrinsic event fields (id, type, actor, runner_type, content_text nullable, payload_json nullable, status, created_at) replaces or compatibility-wraps the existing message/part model; no tool_id or workflow_node_id FK columns on entries — those link through edges.
  - Single universal edges table exists for all persisted cross-entity relationships (workflows, sessions, entries, tools, artifacts/resources) — no session-scoped EntryEdgeTable or per-domain edge tables.
  - Workflows table/concept used as reusable definitions; no workflow_templates concept or table introduced.
  - Session contains-order via `contains` edges with `seq_in_parent` is canonical visible timeline order; `created_at` is timestamp only, not display order.
  - Edges cover the approved relationship set: instantiated_as, contains, forked_from, forked_at, reply_to, caused, produced, used, branch, merge — matching the cross-entity edge list from VISION.
  - All existing sessions, messages, parts, and parent pointers migrate or compatibility-read into entries + edges without data loss or display regression for linear sessions.
  - Workflow run → session linkage is aligned: workflow runs create/set sessions, captures entries + edges through runtime write paths, not standalone message writes.
  - Tool-call/tool-result capture uses entries + edges (used, caused) rather than standalone message/part writes.
  - Indexed timeline reads supported (index on from_type, from_id, type, seq_in_parent for contains edges).
  - APIs/SDK/UI consumers remain functional for normal chat: existing session read paths return correct chronological order via compatibility mapping or direct entries+edges query.
  - Typecheck, build, and existing tests pass for all affected packages (packages/session, packages/storage, packages/workflow, packages/runtime).
  - Package boundaries preserved: storage owns physical persistence; session owns session/entry/edge semantics; workflow owns workflow definition semantics; runtime owns execution orchestration.
source: vision
---

# Migrate session/message/edge/workflow architecture to unified entries and universal edges per vision

## Goal

Deliver the canonical implementation and migration that synchronizes and reworks OpenDora's current message/session/storage/workflow/runtime assumptions to align with the approved vision architecture:

- **Entries** are the immutable runtime ledger events (a chat message is one entry type).
- **Edges** are the single universal relationship model connecting all persisted graph entities (workflows, sessions, entries, tools, artifacts/resources).
- **Workflows** are reusable definitions; there is no `workflow_templates` concept. Workflow executions/runs are sessions.
- **Sessions** are runtime containers / runs / branches / workflow executions, owning the graph-backed entry ledger.
- **Ordering** is via `session --contains(seq_in_parent=N)--> entry` for canonical visible timeline order. `created_at` is timestamp only, not display order.

This goal covers the full migration sweep: schema/contracts, compatibility layer, write paths, read paths, API surfaces, performance indexes, and verification. The chat side rail UI projection is explicitly out of scope for this migration goal; it may be delivered as a downstream dependent goal once the entries+edges model is verified to produce correct projection data. UI changes in this goal are limited to what is strictly needed for consuming the renamed/aligned session history shape (type imports, consumer-side compatibility).

The investigation goal at `.projectflows/goals/investigate-current-session-ledger-state/GOAL.md` is the prerequisite Phase 0 — its findings (current-state report, gap analysis, risk assessment, implementation sequencing) directly inform the phased implementation here.

## Source Requirements

Requirements derived from root `VISION.md`, `packages/session/VISION.md`, `packages/storage/VISION.md`, `packages/workflow/VISION.md`, `packages/runtime/VISION.md`, existing codebase analysis, and user clarification:

1. **Workflows are reusable definitions.** There is no `workflow_templates` concept or table. Workflow executions and runs are represented by sessions as runtime containers.

2. **Sessions are durable run containers with edge participation.** Sessions participate in typed edges (instantiation, fork, containment) alongside entries, tools, artifacts, and workflows. Edges are not limited to entry-to-entry within a session.

3. **Entries replace messages as the canonical ledger concept.** "Entries" are the immutable runtime ledger events. A chat message is one entry type (`type=message`). The table is `entries`, not `messages`. Existing message data migrates into the entries model or is accessible through compatibility views.

4. **Minimal entry fields** — intrinsic event fields only:
   ```
   entries (id, type, actor, runner_type, content_text nullable, payload_json nullable, status, created_at)
   ```
   Do not place `tool_id` or `workflow_node_id` as foreign key columns on entries — link through edges. `payload_json` stores runtime details (toolCallId, inputs, outputs, render hints, snapshots, provider metadata, errors, etc.).

5. **Universal single edge table.** One physical edge table covers relationships between all persisted graph entities: workflows, sessions, entries, tools, artifacts/resources. Edges use polymorphic `from_type/from_id → to_type/to_id` references. Edge semantics are domain-owned (session owns session/entry/edge semantics; workflow owns workflow definition semantics; storage owns physical persistence).

6. **Required edge types** covering the approved cross-entity relationship set:
   - `workflow --instantiated_as--> session`
   - `session --contains(seq_in_parent)--> entry`
   - `session --forked_from--> session`
   - `session --forked_at--> entry`
   - `entry --reply_to--> entry`
   - `entry --caused--> entry`
   - `entry --produced--> entry/artifact`
   - `entry --used--> tool/artifact/resource`
   - `entry --branch(label=...)--> entry`
   - `entry --merge--> entry`

7. **`seq_in_parent` ordering.** `session --contains(seq_in_parent=N)--> entry` — the `contains` edge with `seq_in_parent` is canonical visible timeline/message order. Entry-to-entry edges are causal/topological order. `created_at` is timestamp only, not canonical display order.

8. **Preserve existing behavior.** All existing chronological chat display must continue to work exactly as before for linear sessions. The migration must be backward-compatible.

9. **Entry actors** remain limited to: `user`, `assistant`, `workflow`, `system`. (Current code uses `agent` kind — migration must handle this rename).

10. **Entry types** remain limited to: `message`, `tool_call`, `tool_result`, `workflow_step`, `error`, `system_event`. No new entry types. A `message` entry is one concrete entry type — the canonical concept is entries, not messages.

11. **Delegation** is represented as `tool_call` with metadata — not a separate entry type.

12. **Summaries** are not separate entry types. User-visible summaries = `message` entries; workflow summaries = `workflow_step` entries; compaction/injection/internal = `system_event` entries.

13. **No branch_start/branch_end entry types.** Branching is inferred from topology (one source → multiple outgoing edges = fan-out; multiple sources → one target = fan-in/merge).

14. **Runner type** (`user | agent | workflow | system`) remains useful for describing the execution mechanism and is captured in the `runner_type` field on entries.

15. **Edge semantics are domain-owned.** Storage owns physical persistence. Session owns session/entry/edge semantics, ordering, and lifecycle. Workflow owns workflow definition semantics. Runtime owns execution orchestration and writes execution artifacts into session.

16. **Storage:** SQLite/relational indexed structures remain acceptable. Storage does not own actor/type/edge semantics — those belong to session. Graph behavior uses normal storage contracts and indexed relational structures.

17. **Default timeline reads** must be supported by indexed contains edges (e.g. index on `from_type, from_id, type, seq_in_parent` filtered to `type='contains'`). Deep graph traversal is explicit/debug, not default chat render.

18. **Loaded skills** must be recorded in session-attached context. Loading a skill derives effective available tools by default unless restricted by permission/runtime policy.

19. **Runtime** resolves/executes tools; permission gates access; session records attached capability context and tool-call history. Runtime writes entries and edges into session consistently during execution.

20. **Existing message and part tables** may remain (data not deleted); migration adds a universal `edges` table and an `entries` table/view for the new ledger model. Existing message data is migrated or accessible through compatibility views/read paths.

## Problem / Motivation

The current session message model stores messages as a flat list with a single `parent_message_id` foreign key, plus separate `PartTable` for message parts. This model cannot represent:

- **Fan-out**: When one message triggers multiple parallel agent/tool/workflow paths (branches).
- **Fan-in/merge**: When multiple parallel paths converge on a single subsequent message.
- **Typed causality**: Distinguishing tool_call→tool_result, delegation, retry, workflow_step, or error lineage.
- **Display order vs. causal order**: Supporting timeline display by event time while preserving causal edge structure for debugging and expanded graph views.
- **Cross-entity relationships**: Workflow → session instantiation, session → session forking, entry → tool usage currently have no unified model.
- **Universal graph traversal**: No single query path can trace relationships across workflows, sessions, entries, tools, and artifacts.

As OpenDora evolves toward a unified durable execution model where conversations and workflows share the same run ledger, and where all graph entities participate in typed relationships, the flat message/part/parent-pointer model becomes a bottleneck. Workflow execution, delegation, agent switching, parallel tool calls, permission flows, skill-loading traces, and session forking all need typed topology that the current model cannot express.

Additionally, the existing `EntryEdgeTable` in `packages/session` is session-scoped and uses a different edge type set than the vision target. This existing schema must be migrated to the universal edge model.

The VISION documents already define the target state. This goal delivers the migration — the schema/contracts, compatibility layer, write paths, read paths, API surfaces, performance indexes, and verification needed to make the transition safe and complete.

### Prerequisite: Investigation Phase (Phase 0)

The investigation goal at `.projectflows/goals/investigate-current-session-ledger-state/GOAL.md` must complete first. It produces the current-state report, gap analysis, risk assessment, and implementation sequencing that directly informs this migration. Key risks the investigation must resolve include:

1. The existing `EntryEdgeTable` with session-scoped edges and its own edge type set (`reply`, `tool_call`, `tool_result`, `delegation`, `workflow_step`, `retry`, `fork`, `fan_out`, `fan_in`) — how it maps to the universal edge model.
2. The existing `MessageTable` + `PartTable` deeply embedded in session write paths, runtime loop, workflow runner, server/SDK APIs, and UI rendering — exact touchpoint catalogue needed.
3. Message ordering currently implicit (`MessageV2.stream()` orders by `time_created` descending, `parent_message_id` provides parent linkage, `EntryEdgeTable.display_order` exists but usage unclear).
4. Fork/delegation/nested-run relationships via `parent_session_id`, `parent_message_id`, `reply_to_session_id` — how they translate to new edge types.
5. Server/SDK and UI consumer surface map for `messages[]` arrays with `info` + `parts` shapes.
6. Actor kind rename from `agent` to `assistant` — scope and downstream impact.

## Vision Alignment

### Relevant product/project context

- **Root `VISION.md`**: Architecture naming (workflows=definitions, sessions=runtime containers, entries=ledger events, edges=relationships); graph-backed ledger and UI projection are one delivery; no workflow_templates.
- **`packages/session/VISION.md`**: Graph-backed entry ledger ownership, universal typed edges, entry actors/types, intrinsic entry fields, seq_in_parent ordering, cross-entity edge types, indexed timeline reads, skill/tool recording, permission boundary.
- **`packages/storage/VISION.md`**: Storage is the exclusive persistence abstraction; session graph persists through stable storage contracts; single physical edge table for all cross-entity relationships; SQLite/relational tables acceptable; indexed contains-edge support.
- **`packages/workflow/VISION.md`**: Workflows are reusable definitions; no workflow_templates; workflow run/session linkage; Node-as-Tool standard; workflow-run capture through session.
- **`packages/runtime/VISION.md`**: Runtime orchestrates execution; session records the ledger and state; runtime writes execution context, events, and output into session.
- **`AGENTS.md`**: Repository rules, boundary preservation, migration awareness via `.projectflows/goals/unified-durable-run/GOAL.md`.
- **Existing `investigate-current-session-ledger-state/GOAL.md`**: Phase 0 prerequisite — its findings drive this migration's sequencing.
- **Existing `chat-side-rail/GOAL.md`**: Superseded UI-only goal; retained for UI-phase implementation guidance if a downstream chat rail goal is created.
- **`.projectflows/goals/unified-durable-run/GOAL.md`**: Unified Durable Run migration phases (checkpoint contract, suspend/resume, unified executor).
- **`packages/session/MIGRATION.md`**: _(replaced by the unified-durable-run GOAL)_ — session's slice of migration was run state shape.

### Product/non-goal constraints

- Workflows are reusable definitions — no separate `workflow_templates` concept or table.
- Sessions are durable run containers and may participate in typed edges.
- No new actor types beyond: `user`, `assistant`, `workflow`, `system`.
- No new entry types beyond: `message`, `tool_call`, `tool_result`, `workflow_step`, `error`, `system_event`.
- No `tool_id` or `workflow_node_id` as foreign key columns on entries — link through edges.
- No `branch_start`/`branch_end` entry types — branching inferred from topology.
- Permissions remain owned by permission package; session does not own permission lifecycle.
- No graph database required — SQLite/relational is acceptable.
- Source of truth is session data (entries + edges), not UI component state.
- Existing behavior must be preserved for linear sessions.

## Convention Constraints

### Relevant technical/project constraints

- Read `AGENTS.md` at each scope before changing code.
- Read `.projectflows/goals/unified-durable-run/GOAL.md` before changing run state, checkpointing, workflow runner, or conversation loop.
- Keep changes scoped to the package or app being edited.
- Do not silently contradict parent scope documents.
- Preserve existing behavior unless the task explicitly changes it.
- Do not introduce in-memory-only run state as a source of truth.
- Storage is the only persistence boundary — all durable data goes through storage contracts.
- Session owns the state shape, ledger shape, and lifecycle for a run.
- The existing `message` and `part` tables remain (data not deleted); migration adds a universal `edges` table and an `entries` table/view for the new ledger model. Existing message data is migrated or accessible through compatibility views/read paths.
- The existing `EntryEdgeTable` must be migrated to the universal edges model without data loss.
- All storage backends (SQLite, Postgres, JSONL) must support the universal edge model.

### Required stack/patterns

- TypeScript, zod for runtime validation.
- Drizzle ORM with SQLite (existing pattern in `session.sql.ts`).
- Existing storage adapter interface (`packages/session/src/storage/adapter.ts`) extended for edges/entries as needed.
- Session data currently arrives as flat `messages` array with `info` and `parts`; this shape must remain functional during and after migration (via entries+edges compatibility layer or direct query).

### Forbidden patterns/libraries

- Do NOT introduce a `workflow_templates` concept or table.
- Do NOT add `tool_id` or `workflow_node_id` as FK columns on entries — link through edges.
- Do NOT introduce new actor types or entry types.
- Do NOT introduce a graph database — SQLite/relational remains.
- Do NOT move permission ownership into session.
- Do NOT introduce `branch_start`/`branch_end` or similar synthetic entry types.
- Do NOT build the chat side rail UI projection as a success criterion of this goal (use a downstream goal).

### Verification commands

- `bun run typecheck` in `packages/session`
- `bun run typecheck` in `packages/storage`
- `bun run typecheck` in `packages/workflow`
- `bun run typecheck` in `packages/runtime`
- `bun run typecheck` in `apps/web`
- `bun run build` (or relevant compile step) in each affected package/app
- Existing test suites pass in `packages/session/test/`, `packages/storage/test/`, `packages/workflow/test/`
- `bun run dev` in `apps/web` for manual chat verification

## Scope

This comprehensive migration covers the full delivery unit. It should be planned and split into sequenced implementation phases. The scope includes packages, contracts, write paths, read paths, API surfaces, and verification — but NOT the chat side rail UI projection.

### 1. Target schema/contracts: entries and universal edges (packages/session, packages/storage)

- Add a universal `edges` table covering all persisted graph entities (workflows, sessions, entries, tools, artifacts/resources):
  - `from_type`, `from_id` — polymorphic source entity reference
  - `to_type`, `to_id` — polymorphic target entity reference
  - `type` — typed string identifying the relationship (see edge types below)
  - `seq_in_parent` — canonical visible timeline order for `contains` edges
  - `label` — optional human-readable label (e.g. branch labels)
  - `metadata` — optional JSON for edge-specific data
  - `created_at` — timestamp only, NOT canonical display order
- Add an `entries` table with intrinsic event fields only:
  - `id`, `type`, `actor`, `runner_type`, `content_text` (nullable), `payload_json` (nullable), `status`, `created_at`
  - No `tool_id` or `workflow_node_id` foreign key columns — link through edges
- Define typed edge type constants/union in `packages/session/src/types.ts` covering the approved set: `instantiated_as`, `contains`, `forked_from`, `forked_at`, `reply_to`, `caused`, `produced`, `used`, `branch`, `merge`.
- Remove or migrate the existing session-scoped `EntryEdgeTable` and its edge types to the universal model.
- Define storage contract support for persisting and querying universal edges through existing storage adapter patterns.
- Define session-level graph query API: get entries with their `contains` edges ordered by `seq_in_parent`, plus incoming/outgoing typed edges for graph traversal.

### 2. Compatibility layer and migration (packages/session, packages/storage)

- Provide a data migration path for existing sessions/messages/parts with `parent_message_id` pointers to reconstruct equivalent `contains` and `reply_to` edges in the universal edges table.
- Provide a data migration path for existing message/part data into the new `entries` table preserving all content, metadata, actors, and types.
- Provide a compatibility layer so existing consumers that read `messages[]` with `info` + `parts` shape continue to work (either via direct entries+edges query mapped to old shape, or via a compatibility view).
- Ensure existing chronological chat behavior is preserved exactly for linear sessions.
- The migration must be lossless for existing display fidelity (no duplicate entries, no missing messages).
- Handle actor kind rename (`agent` → `assistant`) in the compatibility/migration layer.
- Existing `message` and `part` tables can remain or be deprecated; the `entries` table and universal `edges` table are the source of truth going forward.

### 3. Write path updates (packages/session, packages/workflow, packages/runtime)

- **packages/session**: Update `Session.updateMessage`, `Session.updatePart`, edge creation in `Session.updateMessage` to write entries + edges instead of (or in addition to) messages/parts.
- **packages/workflow**: Update workflow runner (`startNodeToolPart`, `finish`, `fail`) to create entries + edges for workflow node execution, tool calls, and results. Ensure workflow run → session linkage uses `instantiated_as` edge.
- **packages/runtime**: Ensure agent/tool/workflow execution writes entries and edges consistently through session contracts. Tool-call/tool-result capture uses `used` and `caused` edges.
- **Edge creation**: Ensure all runtime write paths create appropriate edges (contains, caused, used, reply_to, instantiated_as, etc.) for the artifacts they produce.

### 4. Read path and API surface updates (packages/session, server/sdk, apps/web consumers)

- **packages/session**: Update `Session.messages()`, `Session.stream()`, `MessageV2.stream()` to read from entries + edges (via compatibility mapping or direct query) while preserving chronological order.
- **Server/SDK**: Update API routes and SDK methods that return session history to return entries+edges data where applicable, while maintaining backward compatibility for existing message-shaped consumers.
- **apps/web**: Update UI type imports and consumer code to accept renamed/aligned session history shape. Minimum changes — keep existing rendering functional.
- Ensure default chat timeline queries return entries ordered by `contains` edge `seq_in_parent`, not `created_at`.

### 5. Indexes and performance (packages/session, packages/storage)

- Add index on `(from_type, from_id, type, seq_in_parent)` filtered to `type='contains'` for performant default timeline reads.
- Ensure deep graph traversal queries are supported but not used in the default chat render path.
- Verify query performance for linear sessions with hundreds of entries.

### 6. Verification, typecheck, build, and test compliance

- Typecheck and build pass for packages/session, packages/storage, packages/workflow, packages/runtime, apps/web.
- Existing test suites pass in packages/session/test/, packages/storage/test/, packages/workflow/test/.
- Migration test: create session with known messages/parts/parent pointers, run migration, verify entries table and edges table have correct data.
- Edge round-trip test: create entries with edges across entity types, read back, verify topology matches.
- Timeline order test: create entries out of timestamp order, verify contains edges with seq_in_parent produce correct display order.
- Index performance test: verify timeline queries use contains edge index.
- Backward compatibility test: existing API consumers return correct data for linear sessions.
- No changes outside scope of this goal (e.g., no workflow authoring semantics changes, no permission ownership changes).

## Out of Scope

- Building the chat side rail UI projection as a core requirement of this goal. The chat side rail is a downstream dependent UI goal that may consume entries+edges data once migration is verified.
- Changing workflow authoring semantics unrelated to execution capture.
- Introducing a graph database — SQLite/relational remains.
- Introducing a `workflow_templates` concept or table.
- Moving permission ownership into session.
- Adding new actor types beyond: user, assistant, workflow, system.
- Adding new entry types beyond: message, tool_call, tool_result, workflow_step, error, system_event.
- Deleting or replacing React Flow in expanded workflow/canvas views.
- Replacing the existing message rendering system wholesale in apps/web.
- Refactoring or rewriting existing UI components beyond type/shape consumer updates.
- Implementing expanded/full graph views in apps/web — React Flow already handles those.
- Supporting drag, zoom, pan, or interactive graph manipulation in chat views.

## Acceptance Criteria

### AC1: Universal entries and edges schema defined
- A single universal `edges` table exists covering all persisted graph entities (workflows, sessions, entries, tools, artifacts/resources) using polymorphic `from_type/from_id → to_type/to_id` references.
- Edge types are defined as a union/const enum with at minimum: `instantiated_as`, `contains`, `forked_from`, `forked_at`, `reply_to`, `caused`, `produced`, `used`, `branch`, `merge`.
- An `entries` table exists with intrinsic event fields: `id`, `type`, `actor`, `runner_type`, `content_text` (nullable), `payload_json` (nullable), `status`, `created_at`. No `tool_id` or `workflow_node_id` FK columns.
- The existing session-scoped `EntryEdgeTable` is migrated to the universal edges model or compatibility-mapped without data loss.

### AC2: contains edge order with indexed reads
- `session --contains(seq_in_parent=N)--> entry` is the canonical visible timeline order.
- `created_at` is timestamp only and not used for canonical display order.
- An index on `(from_type, from_id, type, seq_in_parent)` filtered to `type='contains'` supports performant default timeline reads.
- Deep graph traversal (causal, branching) is explicit/debug and does not use the default chat render path.

### AC3: Graph topology query API
- Session exposes a method to retrieve entries with their associated `contains` edges ordered by `seq_in_parent`.
- The returned data structure includes enough information for UI consumers to render session history: entries with actors, typed edges, seq_in_parent.
- The existing `Session.messages()` query (or equivalent) remains backward-compatible for linear sessions via compatibility mapping from entries+edges.

### AC4: Migration of existing data complete
- Existing sessions with `parent_message_id` pointers can be migrated to populate equivalent `contains` and `reply_to` edges in the universal edges table.
- Existing message/part data can be migrated into the `entries` table preserving all content, metadata, actors, and types.
- After migration, linear sessions display identically to before (same chronological order, no phantom branches, no missing data).
- No data loss: all existing messages, parts, and metadata survive migration.
- Actor kind rename (`agent` → `assistant`) is handled in migration/compatibility layer.

### AC5: Write paths updated to produce entries and edges
- `Session.updateMessage` / `Session.updatePart` write to entries + edges (not just MessageTable/PartTable) or write both during transition.
- Workflow runner (`startNodeToolPart`, `finish`, `fail`) creates entries + edges for workflow node execution, including `instantiated_as` edges linking workflow → session.
- Runtime agent/tool execution writes entries + edges consistently, with tool-call/tool-result using `used` and `caused` edges.
- All required edge types (at minimum: `contains`, `reply_to`, `used`, `caused`, `instantiated_as`) are created by the appropriate write paths.

### AC6: Read paths and APIs consume entries + edges
- `Session.messages()` / `MessageV2.stream()` / equivalent read paths return correct chronological order via entries+edges with contains.seq_in_parent.
- Existing API surfaces remain functional for linear sessions (backward-compatible shape or compatibility mapping).
- apps/web consumers accept the updated session history shape with minimal changes; existing chat rendering works.

### AC7: No workflow_templates concept introduced
- Workflows table is the single reusable definition concept. No separate `workflow_templates` table or concept exists anywhere in the codebase.
- Workflow runs are correctly linked to sessions via `instantiated_as` edges.

### AC8: Package boundaries preserved
- Storage owns physical persistence (edges table schema, indexes, storage adapter contracts).
- Session owns session/entry/edge semantics (edge type definitions, entry actor/types, ordering, lifecycle).
- Workflow owns workflow definition semantics.
- Runtime owns execution orchestration and writes execution artifacts into session.

### AC9: Typecheck, build, and test pass
- `bun run typecheck` passes in packages/session, packages/storage, packages/workflow, packages/runtime, apps/web.
- Build/compile succeeds for all affected packages.
- Existing test suites pass.

## Judgment Rubric

### Mark done only if:
- Universal `edges` table exists with polymorphic from/to references supporting all approved edge types.
- `entries` table exists with intrinsic event fields and no `tool_id`/`workflow_node_id` FK columns.
- `contains` edges with `seq_in_parent` are the canonical timeline order — verified by querying entries ordered by seq_in_parent.
- Index on contains edges exists for performant default timeline reads.
- Migration path for existing sessions/messages/parts is verified with real session data (no data loss).
- Write paths create entries + edges for session updates, workflow runs, and tool-call/tool-result capture.
- Read paths return correct chronological order via entries+edges; existing API consumers remain functional for linear sessions.
- No `workflow_templates` concept or table exists.
- Typecheck and build pass for all affected packages.
- Package boundaries verified: storage owns persistence, session owns entry/edge semantics, workflow owns definition semantics, runtime owns orchestration.

### Continue if:
- Universal edges table exists but not all edge types are implemented yet (start with `contains`, `reply_to`, `used`, `instantiated_as`, add others iteratively).
- `entries` table exists but backward-compat mapping from old message shape is still rough.
- `contains` index exists but query performance not yet validated at scale.
- Write paths updated for session but workflow runner and runtime capture still on old message model.
- Read paths return entries+edges data but compatibility layer for old message shape has rough edges.
- Migration path exists but hasn't been verified against all session types (role, scope, worker, scratchpad).
- Actor kind rename (`agent` → `assistant`) is handled in new types but backward-compat mapping not yet exhaustive.

### Block and ask if:
- The universal edge schema design (polymorphic from_type+from_id pattern) conflicts with existing storage contracts or would require a breaking change to storage adapter interface that cannot be backward-compatible.
- The entries table design requires changes to existing query surfaces that cannot be made backward-compatible.
- The migration path for existing sessions would cause data loss or display regression for any existing session type.
- The existing `EntryEdgeTable` is actively consumed in ways that cannot be transparently migrated to the universal edges model.
- There are unresolved conflicts between the edge type union and existing code that relies on the current `EdgeType` values.

## Implementation Guidance

### Phasing approach

This is a large delivery unit. It is expected to be split into sequenced implementation phases ordered by dependency. The investigation goal at `.projectflows/goals/investigate-current-session-ledger-state/GOAL.md` is the prerequisite.

#### Phase 0 — Current-state investigation (prerequisite)

Complete the `investigate-current-session-ledger-state` goal. Its deliverables (current-state report, gap analysis, risk assessment, implementation sequencing) directly inform the phases below. This phase produces no source code changes.

#### Phase 1 — Target schema and contracts

- Define the universal `edges` table Drizzle schema in `packages/session/src/session.sql.ts` (or appropriate location).
- Define the `entries` table Drizzle schema alongside it.
- Define `EdgeType` union/const enum in `packages/session/src/types.ts` with the approved edge type set.
- Define `Entry` type in `packages/session/src/types.ts` with intrinsic fields.
- Add storage adapter interface methods for edges/entries persistence in `packages/storage` if needed.
- Add Drizzle migrations for the new tables.
- No UI or write-path changes yet.

#### Phase 2 — Compatibility layer and data migration

- Implement migration logic that reads existing `message`/`part`/`parent_message_id` relationships, migrates into `entries` table, and creates equivalent `contains` and `reply_to` edges.
- Migrate existing `EntryEdgeTable` data to the universal edges table.
- Build a compatibility mapping layer so existing `Session.messages()` / `MessageV2.stream()` consumers see correct data from entries+edges.
- Handle actor kind rename (`agent` → `assistant`) in the compatibility layer.
- Verify linear sessions display identically after migration.

#### Phase 3 — Write path updates

- Update `Session.updateMessage` / `Session.updatePart` to write entries + edges in addition to (or instead of) MessageTable/PartTable writes.
- Update workflow runner (`startNodeToolPart`, `finish`, `fail`) to create entries + edges for workflow node execution, tool calls, and results. Add `instantiated_as` edge for workflow → session linkage.
- Update runtime agent/tool write paths to create entries + edges with appropriate edge types (`used`, `caused`, `contains`).
- Update any remaining write paths to ensure consistent entry+edge creation.

#### Phase 4 — Read path and API updates

- Update `Session.messages()`, `MessageV2.stream()`, and related read paths to query entries via contains edges ordered by seq_in_parent, with compatibility fallback for existing consumers.
- Update server/SDK API surfaces that return session history to expose entries+edges data where applicable.
- Update apps/web consumer code (type imports, shape expectations) to accept the aligned session history shape while preserving existing rendering behavior.
- Ensure backward compatibility: existing chat functionality continues to work unchanged.

#### Phase 5 — Indexes, performance, and verification

- Add database indexes for timeline reads (index on `from_type, from_id, type, seq_in_parent` filtered to `type='contains'`).
- Verify query performance for linear sessions with hundreds of entries.
- Run typecheck, build, and test suites across all affected packages.
- Run migration verification against real session data.
- Verify edge round-trip across entity types.
- Verify backward compatibility with existing API consumers.

### Edge schema reference

Edges use a single universal table covering all persisted graph entities:

```typescript
// Single universal edge table (owned by storage, semantics by domain)
export const EdgesTable = sqliteTable("edges", {
  id: text().primaryKey(),
  from_type: text().notNull(),            // entity type: "workflow" | "session" | "entry" | "tool" | "artifact"
  from_id: text().notNull(),              // FK to the source entity
  to_type: text().notNull(),              // entity type: "workflow" | "session" | "entry" | "tool" | "artifact"
  to_id: text().notNull(),                // FK to the target entity
  type: text().notNull().$type<EdgeType>(),  // relationship type
  seq_in_parent: integer(),               // canonical visible timeline order for contains edges
  label: text(),                          // optional human-readable label (e.g. branch labels)
  metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
  created_at: text().notNull(),           // timestamp, NOT canonical display order
});
```

Edge types covering the approved cross-entity relationship set:
```typescript
export type EdgeType =
  | "instantiated_as"  // workflow --instantiated_as--> session (run)
  | "contains"         // session --contains(seq_in_parent)--> entry; canonical timeline order
  | "forked_from"      // session --forked_from--> session (parent session)
  | "forked_at"        // session --forked_at--> entry (point of fork)
  | "reply_to"         // entry --reply_to--> entry (sequential chat response)
  | "caused"           // entry --caused--> entry (causal relationship)
  | "produced"         // entry --produced--> entry/artifact
  | "used"             // entry --used--> tool/artifact/resource
  | "branch"           // entry --branch(label=...)--> entry (named branch)
  | "merge"            // entry --merge--> entry (convergence)
```

### Entry schema reference

```typescript
export const EntriesTable = sqliteTable("entries", {
  id: text().primaryKey(),
  type: text().notNull().$type<EntryType>(),  // message | tool_call | tool_result | workflow_step | error | system_event
  actor: text().notNull().$type<Actor>(),     // user | assistant | workflow | system
  runner_type: text().notNull().$type<RunnerType>(),  // user | agent | workflow | system
  content_text: text(),                       // nullable — only message entries have text content
  payload_json: text({ mode: "json" }).$type<Record<string, unknown>>(),  // runtime details
  status: text().notNull().$type<EntryStatus>(),
  created_at: text().notNull(),
});
```

### Existing EntryEdgeTable migration

The current `EntryEdgeTable` in `packages/session/src/session.sql.ts` has:
- Session-scoped FK (`session_id`)
- `source_entry_id`, `target_entry_id`, `edge_type`, `display_order`
- Edge types: `reply`, `tool_call`, `tool_result`, `delegation`, `workflow_step`, `retry`, `fork`, `fan_out`, `fan_in`

Migration approach:
- Map each existing edge to a universal edge: `session_id` → `from_type="session", from_id=<session_id>`, `source_entry_id` → map to appropriate `from_type`/`from_id`, `target_entry_id` → map to appropriate `to_type`/`to_id`.
- Map edge types: `reply` → `reply_to`, `tool_call`/`tool_result` → `used`/`caused`, `delegation` → `used` with metadata, `workflow_step` → `contains` + `caused`, `retry` → `caused`, `fork` → `forked_from`/`forked_at`, `fan_out` → `branch`, `fan_in` → `merge`.
- Preserve `display_order` as `seq_in_parent` on `contains` edges.

### Graph node/edge alignment in VISION.md

The updated `packages/session/VISION.md` defines:
- "Session owns a graph-backed entry ledger where entries are connected by typed edges preserving lineage, sequence, causality, tool results, retries, workflow fan-out, and workflow fan-in/merge behavior. Edges use a single universal edge table shared across all graph entities."
- "There are no branch_start or branch_end entry types. Branching is inferred by topology."
- "Sessions are durable run containers and may participate in typed edges for parent/child, fork, membership, instantiation, and related provenance/display relationships."
- "session --contains(seq_in_parent=N)--> entry is the canonical visible timeline/message order within a session. Entry-to-entry edges are causal/topological order."
- "Session exposes typed edges, entry actors, and seq_in_parent as the graph topology data apps need for rail rendering."

### Verification scenarios

Prepare test sessions with:
- **Linear**: 5+ user/assistant exchanges — verify contains edges with correct seq_in_parent order.
- **Branching/delegation**: Multi-agent session with delegation — verify branch/caused edges at delegation point.
- **Workflow**: Workflow execution with tool calls and workflow_step entries — verify instantiated_as, contains, used edges.
- **Fan-out/fan-in**: Parallel tool calls or parallel agent outputs — verify branch and merge edges.
- **Cross-entity**: Workflow → session instantiation, session → session fork, entry → tool usage — verify correct edge types across entity boundaries.
- **Migration**: Existing session with messages/parts/parent pointers — verify no data loss after migration, identical display output.
- **Backward compatibility**: Existing API consumer receives correct chronological order for linear sessions via compatibility layer.

## Risks / Unknowns

1. **Universal edge schema design**: The exact edge type mapping from current `EntryEdgeTable` types to the approved union needs careful validation. Polymorphic from/to references must work across all storage backends.

2. **Backward compatibility**: The existing `MessageTable` with `parent_message_id` must continue to work or be migrated without breaking existing consumers. Code that reads `parent_message_id` must be updated or compatibility-wrapped.

3. **Migration of non-linear sessions**: Sessions with delegation/fork patterns via `parentSessionID` and `parent_message_id` need careful migration to reconstruct correct typed edges.

4. **Actor rename**: Current code uses `"agent"` as an actor kind; VISION uses `"assistant"`. This rename touches types, storage, write paths, and UI consumers. Ensure backward compatibility during migration.

5. **Storage adapter changes**: If `StorageAdapter` interface needs new methods for edges/entries, all storage backends (SQLite, Postgres, JSONL) must implement them.

6. **Timeline vs. causal order**: The split between `seq_in_parent` (timeline) and edge order (causal) must be clearly defined and consistently applied. Parallel branches that complete out of order need correct seq_in_parent to render correctly.

7. **Cross-session edges**: Delegation creates entries in different sessions. The edge model must support cross-session references or session-level queries must be able to resolve them.

8. **Workflow runner output serialization**: Current `startNodeToolPart.finish()` stores `typeof output === "string" ? output : JSON.stringify(output, null, 2)`. Moving to entries with structured `payload_json` changes this serialization.

9. **Runtime write path changes**: The runtime loop (`SessionPrompt.loop`) currently writes messages/parts directly. Updating to write entries+edges requires careful sequencing to avoid breaking live execution.

10. **Existing `parent_message_id` usage in server/API/SDK**: Code that queries or displays messages using the old parent pointer must be updated to use the new edge model or a compatibility layer.

11. **Multiple storage backends**: SQLite, Postgres, and JSONL storage adapters all have different schemas and migration paths. The universal edges model must be supported across all of them.

12. **Run state/checkpoint migration intersection**: The `.projectflows/goals/unified-durable-run/GOAL.md` describes a separate but related migration (checkpoint-driven runner, suspend/resume, unified executor). The entries+edges refactor may intersect with these phases.

## Verification Expectations

### Automated verification

- `bun run typecheck` passes in `packages/session`, `packages/storage`, `packages/workflow`, `packages/runtime`, `apps/web`.
- Existing test suites in `packages/session/test/`, `packages/storage/test/`, `packages/workflow/test/` pass.
- Migration test: create session with known messages/parts/parent pointers, run migration, verify `entries` table has correct data, verify `edges` table with `contains` edges has correct seq_in_parent order, verify `Session.messages()` returns same chronological order via compatibility mapping.
- Edge round-trip test: create entries with edges across entity types (workflow→session, session→entry, entry→entry, entry→tool), read back, verify topology matches.
- Timeline order test: create entries out of timestamp order, verify `contains` edges with seq_in_parent produce correct display order independent of created_at.
- Index performance test: verify timeline queries use `contains` edge index (via EXPLAIN QUERY PLAN or equivalent).
- Backward compatibility test: existing API consumers (like `MessageV2.stream()`) still return correct data for linear sessions post-migration.
- No workflow_templates test: grep for `workflow_templates` across codebase returns no results.
- No FK leak test: `tool_id` and `workflow_node_id` are not FK columns on entries table — verified by schema inspection.

### Manual verification

- **Linear session**: Open a normal chat session with 5+ user/assistant exchanges. Verify timeline renders in correct chronological order, same as before migration.
- **Branching/delegation**: Session with delegation — verify data integrity, no phantom branches, correct edge types present.
- **Workflow session**: Session with workflow execution — verify instantiated_as edge exists linking workflow definition to session, workflow_step entries present with correct edges.
- **Existing chat behavior**: Verify within-message timeline, thinking spinner, message actions, scroll anchoring all work unchanged.
- **Package boundary verification**: Confirm no cross-boundary entity access violations — grep for session entity manipulation outside session package, storage bypasses, etc.

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
- Reason: All requirements are specified in updated VISION documents (root, session, storage, workflow, runtime). The investigation prerequisite (`investigate-current-session-ledger-state`) is defined with clear deliverables that feed directly into this migration. The delivery splits naturally into phases with clear dependency ordering. The universal edge model, entries schema, seq_in_parent ordering, and cross-entity relationship types are clearly bounded. Risks are documented with fallbacks. Architecture naming (workflows=definitions, entries=ledger events, edges=relationships) is aligned across all documents. Execution must begin with Phase 0 (investigation consumption), not with direct implementation.
