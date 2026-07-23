import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core"
import type { SessionType, SessionStatus, RetentionPolicy, SendPolicy, EdgeType, EntryType } from "./types"

// Inlined from @/storage/schema.sql — 2-line helper
const Timestamps = {
  time_created: integer()
    .notNull()
    .$default(() => Date.now()),
  time_updated: integer()
    .notNull()
    .$onUpdate(() => Date.now()),
}

// Minimal ProjectTable reference — only the id column is needed for the FK
// The full ProjectTable lives in opencode/src/project/project.sql.ts
export const ProjectTable = sqliteTable("project", {
  id: text().primaryKey(),
  worktree: text().notNull(),
  vcs: text(),
  name: text(),
  icon_url: text(),
  icon_color: text(),
  ...Timestamps,
  time_initialized: integer(),
  sandboxes: text({ mode: "json" }).notNull().$type<string[]>(),
  commands: text({ mode: "json" }).$type<{ start?: string }>(),
})

// Snapshot.FileDiff is only used as a JSON column — use unknown[] to avoid importing snapshot
type FileDiff = unknown

export const SessionTable = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    project_id: text()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    directory: text().notNull(),
    title: text().notNull(),
    version: text().notNull(),
    share_url: text(),
    summary_additions: integer(),
    summary_deletions: integer(),
    summary_files: integer(),
    summary_diffs: text({ mode: "json" }).$type<FileDiff[]>(),
    revert: text({ mode: "json" }).$type<{ messageID: string; partID?: string; snapshot?: string; diff?: string }>(),
    ...Timestamps,
    time_compacting: integer(),
    time_archived: integer(),
    // PingPong session model fields
    session_type: text().$type<SessionType>(),
    session_status: text().$type<SessionStatus>(),
    agent_id: text(),
    owner_id: text(),
    owner_kind: text().$type<"user" | "agent" | "workflow">(),
    allowed_agents: text().$type<string>(), // stored as JSON string, parsed manually in fromRow
    send_policy: text().$type<string>(),    // stored as JSON string, parsed manually in fromRow
    retention: text().$type<string>(),      // stored as JSON string, parsed manually in fromRow
    path: text(),
    read_path: text(),
    cwd: text(),
    spawn_depth: integer(),
    parent_session_id: text(),
    reply_to_session_id: text(),
    input_tokens: integer(),
    output_tokens: integer(),
    cache_read_tokens: integer(),
    cache_write_tokens: integer(),
    compaction_count: integer(),
    // Tools unlocked for this session via skill_load (skill.json's tools array).
    // Persisted so the allowlist survives server restarts without forcing the model
    // to re-invoke skill_load. Stored as a JSON array of tool IDs.
    unlocked_tools: text({ mode: "json" }).$type<string[]>(),
    // Set when a workflow is running in this session; cleared on completion
    workflow_run: text({ mode: "json" }).$type<{ workflowID: string; workflowRunID: string; startedAt: number } | null>(),
    // Vendor import — origin of sessions that were brought in from other agents
    // (Claude Code, Codex, Antigravity, Windsurf). NULL on Projectflows-native sessions.
    vendor: text().$type<"claude" | "codex" | "antigravity" | "windsurf">(),
    native_id: text(),
    vendor_raw_header: text({ mode: "json" }).$type<unknown>(),
    // Model override for this session (providerID:modelID or fallback:groupID)
    model: text(),
  },
  (table) => [
    index("session_project_idx").on(table.project_id),
    index("session_parent_session_idx").on(table.parent_session_id),
    index("session_type_idx").on(table.session_type),
    index("session_agent_idx").on(table.agent_id),
    index("session_owner_idx").on(table.owner_id),
    index("session_vendor_native_idx").on(table.vendor, table.native_id),
  ],
)

export const TodoTable = sqliteTable(
  "todo",
  {
    session_id: text()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    content: text().notNull(),
    status: text().notNull(),
    priority: text().notNull(),
    position: integer().notNull(),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.session_id, table.position] }),
    index("todo_session_idx").on(table.session_id),
  ],
)

// ─── Workflow run checkpoint ──────────────────────────────────────────────────

export const WorkflowRunCheckpointTable = sqliteTable(
  "workflow_run_checkpoint",
  {
    run_id: text()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    checkpoint_id: text().notNull(),
    workflow_id: text().notNull(),
    status: text().notNull().$type<"running" | "suspended" | "done" | "error">().default("running"),
    cursor: text({ mode: "json" }).$type<{ nodeId: string } | null>(),
    ctx: text({ mode: "json" }).notNull().$type<Record<string, unknown>>().default({}),
    step_journal: text({ mode: "json" }).notNull().$type<Array<{ stepId: string; nodeId: string; nodeType: string; completedAt: number }>>().default([]),
    error: text(),
    created_at: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.run_id, table.checkpoint_id] }),
    index("idx_wrc_run_status").on(table.run_id, table.status),
  ],
)

// ─── Universal entries ledger ─────────────────────────────────────────────────

export const EntriesTable = sqliteTable("entries", {
  id: text().primaryKey(),
  type: text().notNull().$type<EntryType>(),
  actor: text().notNull(),
  runner_type: text().notNull(),
  content_text: text(),
  payload_json: text({ mode: "json" }).$type<Record<string, unknown>>(),
  status: text().notNull(),
  created_at: text().notNull(),
})

// ─── Universal edges table ────────────────────────────────────────────────────

export const GraphMigrationStateTable = sqliteTable("graph_migration_state", {
  id: text().primaryKey(),
  completed_at: text().notNull(),
  metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
})

export const EdgesTable = sqliteTable(
  "edges",
  {
    id: text().primaryKey(),
    from_type: text().notNull(),
    from_id: text().notNull(),
    to_type: text().notNull(),
    to_id: text().notNull(),
    type: text().notNull().$type<EdgeType>(),
    seq_in_parent: integer(),
    label: text(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    created_at: text().notNull(),
  },
  (t) => [
    index("edges_from_idx").on(t.from_type, t.from_id),
    index("edges_to_idx").on(t.to_type, t.to_id),
    index("edges_type_idx").on(t.type),
    index("edges_contains_idx").on(t.from_type, t.from_id, t.type, t.seq_in_parent),
  ],
)

