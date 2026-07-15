/**
 * Universal migration: populates entries and edges tables from existing
 * MessageTable/PartTable/entry_edge data.
 *
 * Idempotent — re-running is safe because all inserts use onConflictDoNothing
 * and we check for existing contains edges first.
 *
 * Called at server startup via migrateAllSessions() after storage migrations run.
 */

import { eq, asc, and, inArray } from "drizzle-orm"
import { SessionTable, MessageTable, EntryEdgeTable, EdgesTable, EntriesTable, GraphMigrationStateTable } from "./session.sql.ts"
import { Identifier } from "@projectflows/util/id"
import { getConfig } from "./config.ts"
import type { EdgeType } from "./types.ts"

const log = { info: console.log, warn: console.warn, error: console.error }

// Map legacy entry_edge types to universal edge types
const EDGE_TYPE_MAP: Record<string, EdgeType> = {
  reply: "reply_to",
  tool_call: "used",
  tool_result: "caused",
  delegation: "reply_to",   // delegation is a cross-session reply_to; metadata preserved
  workflow_step: "contains",
  retry: "caused",
  fork: "forked_from",
  fan_out: "branch",
  fan_in: "merge",
}

/**
 * Migrate one session to the universal entries + edges model.
 * Returns number of new rows created (entries + edges combined).
 */
export async function migrateSession(sessionId: string): Promise<number> {
  const db = getConfig().db

  // Idempotent guard: skip if contains edges already exist for this session
  const existingContains = db
    .select({ id: EdgesTable.id })
    .from(EdgesTable)
    .where(
      and(
        eq(EdgesTable.from_type, "session"),
        eq(EdgesTable.from_id, sessionId),
        eq(EdgesTable.type, "contains"),
      ),
    )
    .limit(1)
    .get()
  if (existingContains) return 0

  // Load messages ordered chronologically
  const msgRows = db
    .select({
      id: MessageTable.id,
      session_id: MessageTable.session_id,
      parent_message_id: MessageTable.parent_message_id,
      time_created: MessageTable.time_created,
      data: MessageTable.data,
    })
    .from(MessageTable)
    .where(eq(MessageTable.session_id, sessionId))
    .orderBy(asc(MessageTable.time_created))
    .all()

  if (msgRows.length === 0) return 0

  // Migrate legacy entry_edge rows — read before entering the transaction
  const legacyEdges = db
    .select()
    .from(EntryEdgeTable)
    .where(eq(EntryEdgeTable.session_id, sessionId))
    .all()

  return db.transaction((tx: any) => {
    let created = 0

    for (let i = 0; i < msgRows.length; i++) {
      const row = msgRows[i]!
      const createdAt = new Date(row.time_created).toISOString()

      // Determine actor from message data
      const data = row.data as Record<string, unknown>
      const from = data?.from as Record<string, unknown> | undefined
      const role = data?.role as string | undefined
      let actor = "user"
      if (from?.kind === "agent" || from?.kind === "assistant" || role === "assistant") {
        actor = "assistant"
      } else if (from?.kind === "workflow") {
        actor = "workflow"
      } else if (from?.kind === "system" || from?.kind === "scheduler") {
        actor = "system"
      }

      // Extract first text content for content_text
      const parts = (data?.parts as Array<Record<string, unknown>> | undefined) ?? []
      const firstText = parts.find(p => p.type === "text")
      const content_text = typeof firstText?.text === "string" ? firstText.text.slice(0, 1000) : undefined

      // Migrate message → entry
      tx.insert(EntriesTable)
        .values({
          id: row.id,
          type: "message",
          actor,
          runner_type: actor,
          content_text: content_text ?? null,
          payload_json: data as Record<string, unknown>,
          status: "complete",
          created_at: createdAt,
        })
        .onConflictDoNothing()
        .run()
      created++

      // Create contains edge: session → entry with seq_in_parent = i
      tx.insert(EdgesTable)
        .values({
          id: Identifier.ascending("edge"),
          from_type: "session",
          from_id: sessionId,
          to_type: "entry",
          to_id: row.id,
          type: "contains",
          seq_in_parent: i,
          label: null,
          metadata: null,
          created_at: createdAt,
        })
        .onConflictDoNothing()
        .run()
      created++

      // Create reply_to edge from parent_message_id chain
      if (row.parent_message_id) {
        // Detect cross-session delegation by checking parent's session
        const parentRow = db
          .select({ session_id: MessageTable.session_id })
          .from(MessageTable)
          .where(eq(MessageTable.id, row.parent_message_id))
          .get()
        const isDelegation = parentRow && parentRow.session_id !== sessionId

        tx.insert(EdgesTable)
          .values({
            id: Identifier.ascending("edge"),
            from_type: "entry",
            from_id: row.parent_message_id,
            to_type: "entry",
            to_id: row.id,
            type: "reply_to",
            seq_in_parent: null,
            label: null,
            metadata: isDelegation ? { delegation: true } : null,
            created_at: createdAt,
          })
          .onConflictDoNothing()
          .run()
        created++
      }
    }

    for (const le of legacyEdges) {
      const newType = EDGE_TYPE_MAP[le.edge_type] ?? "reply_to"
      const meta = le.metadata
        ? { ...(le.metadata as Record<string, unknown>), _migrated_from: le.edge_type }
        : { _migrated_from: le.edge_type }

      tx.insert(EdgesTable)
        .values({
          id: Identifier.ascending("edge"),
          from_type: "entry",
          from_id: le.source_entry_id,
          to_type: "entry",
          to_id: le.target_entry_id,
          type: newType,
          seq_in_parent: le.display_order ?? null,
          label: null,
          metadata: meta,
          created_at: new Date(le.time_created).toISOString(),
        })
        .onConflictDoNothing()
        .run()
      created++
    }

    return created
  })
}

/**
 * Migrate all sessions to the universal entries + edges model.
 * Idempotent — safe to call on every server start.
 * Cost: one SELECT per session (contains-edge check).
 */
export async function migrateAllSessions(): Promise<void> {
  const db = getConfig().db

  // Check for a global completion marker — if present, skip the full scan.
  // Individual migrateSession() calls still work per-session.
  const marker = db
    .select({ id: GraphMigrationStateTable.id })
    .from(GraphMigrationStateTable)
    .limit(1)
    .get()
  if (marker) return

  const sessions = db
    .select({ id: SessionTable.id })
    .from(SessionTable)
    .all()

  let total = 0
  let migrated = 0
  for (const session of sessions) {
    const n = await migrateSession(session.id)
    total += n
    if (n > 0) migrated++
  }

  // Write a completion marker so subsequent calls skip the full scan.
  db.insert(GraphMigrationStateTable)
    .values({
      id: "graph-migration-complete",
      completed_at: new Date().toISOString(),
      metadata: { total, migrated },
    })
    .run()

  if (total > 0) {
    log.info(
      `[graph-migration] migrated ${migrated} sessions (${total} rows) to universal entries+edges`,
    )
  }
}
