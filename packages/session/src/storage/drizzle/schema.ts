import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { pgTable, text as pgText, bigint, jsonb, index as pgIndex } from "drizzle-orm/pg-core"
import type { Actor, MessagePart, Parent, RetentionPolicy, SendPolicy } from "../../types.ts"

// ─── SQLite ──────────────────────────────────────────────────────────────────
// Used by SqliteAdapter.
// JSON columns use text({ mode: "json" }) — Drizzle serialises/deserialises automatically.
// Timestamps are stored as millisecond integers (Date.now()).

export const SqliteSessionsTable = sqliteTable(
  "sessions",
  {
    id:               text("id").primaryKey(),
    type:             text("type").notNull(),
    status:           text("status").notNull(),
    label:            text("label"),
    parentSessionId:  text("parent_session_id"),
    parentMessageId:  text("parent_message_id"),
    spawnDepth:       integer("spawn_depth"),
    retention:        text("retention",    { mode: "json" }).notNull().$type<RetentionPolicy>(),
    sendPolicy:       text("send_policy",  { mode: "json" }).$type<SendPolicy>(),
    agentId:          text("agent_id"),
    toolPolicy:       text("tool_policy",  { mode: "json" }).$type<string[]>(),
    systemPrompt:     text("system_prompt"),
    shareUrl:         text("share_url"),
    compactionCount:  integer("compaction_count"),
    compactingAt:     integer("compacting_at"),
    inputTokens:      integer("input_tokens"),
    outputTokens:     integer("output_tokens"),
    cacheReadTokens:  integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    createdAt:        integer("created_at").notNull(),
    updatedAt:        integer("updated_at").notNull(),
    archivedAt:       integer("archived_at"),
  },
  (t) => [
    index("sessions_status_idx").on(t.status),
    index("sessions_parent_idx").on(t.parentSessionId),
  ],
)

export const SqliteMessagesTable = sqliteTable(
  "messages",
  {
    id:          text("id").primaryKey(),
    sessionId:   text("session_id").notNull().references(() => SqliteSessionsTable.id, { onDelete: "cascade" }),
    kind:        text("kind").notNull(),
    sender:      text("sender", { mode: "json" }).notNull().$type<Actor>(),
    parent:      text("parent", { mode: "json" }).$type<Parent | null>(),
    parts:       text("parts",  { mode: "json" }).notNull().$type<MessagePart[]>(),
    provenance:  text("provenance"),
    tokenCount:  integer("token_count"),
    createdAt:   integer("created_at").notNull(),
  },
  (t) => [
    index("messages_session_idx").on(t.sessionId),
  ],
)

// ─── Postgres ─────────────────────────────────────────────────────────────────
// Used by PostgresAdapter.
// Timestamps stored as bigint (ms, Date.now()).
// JSON columns use jsonb.

export const PgSessionsTable = pgTable(
  "sessions",
  {
    id:               pgText("id").primaryKey(),
    type:             pgText("type").notNull(),
    status:           pgText("status").notNull(),
    label:            pgText("label"),
    parentSessionId:  pgText("parent_session_id"),
    parentMessageId:  pgText("parent_message_id"),
    spawnDepth:       bigint("spawn_depth",       { mode: "number" }),
    retention:        jsonb("retention").notNull().$type<RetentionPolicy>(),
    sendPolicy:       jsonb("send_policy").$type<SendPolicy>(),
    agentId:          pgText("agent_id"),
    toolPolicy:       jsonb("tool_policy").$type<string[]>(),
    systemPrompt:     pgText("system_prompt"),
    shareUrl:         pgText("share_url"),
    compactionCount:  bigint("compaction_count",  { mode: "number" }),
    compactingAt:     bigint("compacting_at",     { mode: "number" }),
    inputTokens:      bigint("input_tokens",      { mode: "number" }),
    outputTokens:     bigint("output_tokens",     { mode: "number" }),
    cacheReadTokens:  bigint("cache_read_tokens", { mode: "number" }),
    cacheWriteTokens: bigint("cache_write_tokens",{ mode: "number" }),
    createdAt:        bigint("created_at",        { mode: "number" }).notNull(),
    updatedAt:        bigint("updated_at",        { mode: "number" }).notNull(),
    archivedAt:       bigint("archived_at",       { mode: "number" }),
  },
  (t) => [
    pgIndex("sessions_status_idx").on(t.status),
    pgIndex("sessions_parent_idx").on(t.parentSessionId),
  ],
)

export const PgMessagesTable = pgTable(
  "messages",
  {
    id:          pgText("id").primaryKey(),
    sessionId:   pgText("session_id").notNull().references(() => PgSessionsTable.id, { onDelete: "cascade" }),
    kind:        pgText("kind").notNull(),
    sender:      jsonb("sender").notNull().$type<Actor>(),
    parent:      jsonb("parent").$type<Parent | null>(),
    parts:       jsonb("parts").notNull().$type<MessagePart[]>(),
    provenance:  pgText("provenance"),
    tokenCount:  bigint("token_count", { mode: "number" }),
    createdAt:   bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    pgIndex("messages_session_idx").on(t.sessionId),
  ],
)

export type SqliteSession = typeof SqliteSessionsTable.$inferSelect
export type SqliteMessage = typeof SqliteMessagesTable.$inferSelect
export type PgSession     = typeof PgSessionsTable.$inferSelect
export type PgMessage     = typeof PgMessagesTable.$inferSelect
