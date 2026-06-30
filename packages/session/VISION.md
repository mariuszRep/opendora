# VISION.md — packages/session

> Owner: human. Approved intent only.

## Intent

Session owns the universal execution ledger and session state for conversations, threads, entries, attached context, and executable run history. Session is not the execution engine. The ledger within a session is graph-backed with typed edges connecting entries as immutable runtime events; sessions themselves are durable run containers that may participate in typed edges (instantiation, fork, containment) for provenance and display relationships.

## Owns

- Session records and metadata.
- Entries (immutable runtime ledger events) and event history.
- A graph-backed entry ledger for chat, workflow run, scheduled run, or hybrid execution, where entries are connected by typed edges preserving lineage, sequence, causality, tool results, retries, workflow fan-out, and workflow fan-in/merge. Edges are stored in a single universal edge table covering all cross-entity relationships (workflows, sessions, entries, tools, artifacts/resources).
- Entry actor definitions: user, assistant, workflow, system.
- Entry type definitions: message, tool_call, tool_result, workflow_step, error, system_event.
- Current attached context: active agent, loaded skills, effective tools derived from those skills, workflow context, schedule context, and provider/model metadata.
- Canonical capture for normal agent conversations, workflow runs, schedule-triggered workflow runs, skill loading, tool availability, tool-call traces, and other executable work.
- Mixed ledgers where normal agent conversation and nested workflow execution coexist in one session history.
- Parent-session relationships for nested workflow runs.
- Session lifecycle and status, including suspended/resumable run status.
- Run linkage, run metadata, summaries, compaction, and token usage where session-scoped.
- The run state shape: the durable cursor, context, and step journal that capture where a run is and what it has completed, persisted through storage's run-state/checkpoint contract.

## Does Not Own

- Public API boundary.
- Agent/skill/tool/workflow/schedule/provider definitions.
- Identity or authorization policy.
- Physical persistence backend choice.
- Permission state or approval/permission entry types. Permission lifecycle is owned by the permission package; session may display permission state by resolving/joining references but does not own permission state.
- Execution orchestration, provider/tool invocation, scheduling decisions, workflow advancement, or agent run control.

## Depends On

- storage for persisted session state.
- permission when session access checks are needed.

## Used By

- runtime
- server
- workflow
- schedule
- agent
- tools that inspect or manage sessions

## Boundary Rules

- Session owns the state shape, ledger shape, and lifecycle for a run.
- Agent conversations, workflow runs, and schedule-triggered workflow runs are represented as sessions or session-linked run records in one consistent format.
- A run is one durable, resumable, event-sourced execution; a normal conversation is the simplest workflow (a single assistant-turn loop), and any conversation may be transformed into a reusable workflow over the same ledger.
- Session defines the durable run state shape (cursor, context, step journal, status) and records it; runtime decides when to checkpoint, suspend, resume, or replay; storage decides where and how it is persisted.
- A schedule run creates or resumes a parent session; the triggered workflow run is nested within that parent session.
- Workflow execution and normal agent conversation may be mixed in the same session ledger when the product flow requires it.
- Runtime causes context changes; session records those changes as current state and event history.
- Runtime may load agents, skills, tools, workflows, schedules, and providers; session records what was attached, made available, invoked, and produced.
- Session does not decide how work executes.
- Loading a skill adds that skill's declared tools to the session's effective available tool set by default, unless restricted by permission or runtime policy.
- Session records which skills are loaded and which tools are effectively available for a run, supporting replay, debugging, resume, and UI display.
- Skill-to-tool definitions are owned by skills and tools domains; session records loaded skill references and resolved/effective tool availability without owning either definition domain.
- Runtime resolves tool identities and executes tool calls; permission gates tool access; session records the attached capability context and tool-call history.
- Storage decides where and how that state is persisted.
- Session is the durable container for run history. Sessions are durable run containers and may participate in typed edges for parent/child, fork, membership, instantiation, and related provenance/display relationships.
- Session owns a graph-backed entry ledger where entries are connected by typed edges preserving lineage, sequence, causality, tool results, retries, workflow fan-out, and workflow fan-in/merge behavior. Edges use a single universal edge table shared across all graph entities (workflows, sessions, entries, tools, artifacts/resources). Edge semantics are domain-owned: session owns session/entry/edge semantics, workflow owns workflow definition semantics, storage owns physical persistence.
- Entries are the primary stored session events. A chat message is one entry type; entries may represent more than text chat.
- Entry actor defines who/what produced the entry. The actor set is limited to: user, assistant, workflow, system.
- Entry type defines what kind of entry it is. The type set is limited to: message, tool_call, tool_result, workflow_step, error, system_event. A message entry is one concrete type of entry — the canonical concept is entries, not messages.
- Minimal entry fields are intrinsic event fields only:
  ```
  entries (id, type, actor, runner_type, content_text nullable, payload_json nullable, status, created_at)
  ```
  Do not put `tool_id` or `workflow_node_id` as canonical foreign key columns on entries when those are graph entities — link them through edges instead. `payload_json` stores runtime details such as toolCallId, inputs, outputs, render hints, snapshots, provider metadata, and errors.
- Runner type (user | agent | workflow | system) remains useful for describing the execution mechanism.
- **Ordering rule.** `session --contains(seq_in_parent=N)--> entry` — the `contains` edge with `seq_in_parent` is the canonical visible timeline/message order within a session. Entry-to-entry edges are causal/topological order. `created_at` is timestamp only and not canonical display order.
- Delegation is not a separate entry type. Agent/sub-agent delegation is represented as tool_call with metadata.
- Summary is not a separate entry type. User-visible summaries are message entries; workflow summaries are workflow_step entries; context compaction, injection, and internal summarization are system_event entries.
- Approvals/permissions are not session entry types. Permission lifecycle is owned by the permission package and references relevant session objects, entries, tool calls, or workflow steps. Session may display permission state by resolving/joining references but does not own permission state.
- There are no branch_start or branch_end entry types. Branching is inferred by topology: one source with multiple outgoing edges = fan-out; multiple sources pointing to one target = fan-in/merge.
- Normal chat renders as a continuous chronological timeline. Branch visualization appears only when workflow/agent execution creates multiple outgoing edges from one node.
- The default session UI remains a familiar chat/timeline. The graph-backed model is projected into that view, not a replacement canvas. Each visible entry may show a compact Git-style side rail: continuous for normal chat, branching only for fan-out paths.
- The model supports both graph lineage and timeline display order. Parallel branches may complete in any order; the chat timeline displays by event time or explicit display order while edges preserve causal structure.
- Session exposes typed edges, entry actors, and display order as the graph topology data apps need for rail rendering. Rendering approach and library choice are app-layer concerns.
- **Edges cover relationships between all persisted graph entities**, including:
  ```
  workflow --instantiated_as--> session
  session  --contains(seq_in_parent)--> entry
  session  --forked_from--> session
  session  --forked_at--> entry
  entry    --reply_to--> entry
  entry    --caused--> entry
  entry    --produced--> entry/artifact
  entry    --used--> tool/artifact/resource
  entry    --branch(label=...)--> entry
  entry    --merge--> entry
  ```
- **Performance/product constraint.** Default timeline reads must be supported by indexed contains edges, e.g. index on `(from_type, from_id, type, seq_in_parent)` filtered to `type='contains'`. Deep graph traversal is explicit/debug, not default chat render.
- Storage owns physical persistence; session owns session/entry/edge semantics; workflow owns workflow definition semantics.

## Canonical Operations

Session management tools, SDK routes, runtime flows, workflow runs, schedule-triggered runs, and package integrations must use the package-owned session operations for create, read, update, append, search, state tracking, run linkage, nesting, and lifecycle behavior.
