/**
 * Universal migration: populates entries and edges tables from existing
 * MessageTable/PartTable/entry_edge data.
 *
 * Idempotent — re-running is safe because all inserts use onConflictDoNothing
 * and we check for existing contains edges first.
 *
 * Called at server startup via migrateAllSessions() after storage migrations run.
 */

import { eq, or, asc, and, inArray, sql } from "drizzle-orm"
import { SessionTable, MessageTable, PartTable, EntryEdgeTable, EdgesTable, EntriesTable, GraphMigrationStateTable } from "./session.sql"
import { Identifier } from "@projectflows/util/id"
import { getConfig } from "./config"
import type { EdgeType, EntryType } from "./types"

/**
 * Derives the graph `actor` value from a stored message's `data` blob —
 * shared by the live write path (Session.updateMessage/updatePart) and the
 * backfill path (migrateSession) so both classify actors identically.
 */
export function deriveActor(data: Record<string, unknown> | undefined): string {
  const from = data?.from as Record<string, unknown> | undefined
  const role = data?.role as string | undefined
  if (from?.kind === "agent" || from?.kind === "assistant" || role === "assistant") return "assistant"
  if (from?.kind === "workflow") return "workflow"
  if (from?.kind === "system" || from?.kind === "scheduler") return "system"
  return "user"
}

/**
 * Maps a MessageV2.Part `type` onto one of the fixed EntryType values — no new
 * EntryType values are allowed, so this is a semantic-nearest-fit mapping:
 * generic content parts -> "message", procedural/step markers -> "workflow_step",
 * error-recovery/system bookkeeping -> "system_event". "tool" is handled
 * separately by writeToolPartEntries (tool_call/tool_result).
 */
function mapPartTypeToEntryType(partType: string): EntryType {
  switch (partType) {
    case "compaction":
    case "subtask":
    case "step-start":
    case "step-finish":
      return "workflow_step"
    case "retry":
    case "fallback-switch":
      return "system_event"
    default:
      // text, reasoning, file, snapshot, patch, agent
      return "message"
  }
}

const log = { info: console.log, warn: console.warn, error: console.error }

function mapPartStatusToEntryStatus(status: string): string {
  switch (status) {
    case "completed":
      return "complete"
    case "running":
      return "in_progress"
    case "error":
      return "error"
    default:
      return status
  }
}

/**
 * Writes a `contains` edge from a message-entry to one of its part-entries, with
 * `seq_in_parent` set to the part's position among that message's parts so far —
 * the same ordering mechanism already used for session -> message-entry edges,
 * reusing the edges_contains_idx composite index. Check-then-insert, safe to
 * call repeatedly (idempotent per message/part pair).
 */
export function writePartContainsEdge(
  tx: any,
  input: { messageID: string; partID: string; createdAt: string },
): number {
  const existing = tx
    .select({ id: EdgesTable.id })
    .from(EdgesTable)
    .where(
      and(
        eq(EdgesTable.from_id, input.messageID),
        eq(EdgesTable.to_id, input.partID),
        eq(EdgesTable.type, "contains"),
      ),
    )
    .limit(1)
    .get()
  if (existing) return 0

  const seqResult = tx
    .select({ n: sql<number>`count(*)` })
    .from(EdgesTable)
    .where(
      and(
        eq(EdgesTable.from_type, "entry"),
        eq(EdgesTable.from_id, input.messageID),
        eq(EdgesTable.type, "contains"),
      ),
    )
    .get()

  tx.insert(EdgesTable)
    .values({
      id: Identifier.ascending("edge"),
      from_type: "entry",
      from_id: input.messageID,
      to_type: "entry",
      to_id: input.partID,
      type: "contains",
      seq_in_parent: seqResult?.n ?? 0,
      label: null,
      metadata: null,
      created_at: input.createdAt,
    })
    .onConflictDoNothing()
    .run()
  return 1
}

/**
 * Writes a non-tool part's entry (id=partID, type mapped via
 * mapPartTypeToEntryType) plus its message -> part contains edge. Shared by
 * migrateSession() (backfill) and Session.updatePart() (live writes).
 */
export function writeGenericPartEntry(
  tx: any,
  input: {
    partID: string
    messageID: string
    partType: string
    payload: Record<string, unknown>
    actor: string
    createdAt: string
  },
): number {
  let created = 0
  const entryType = mapPartTypeToEntryType(input.partType)
  const text = (input.payload as any).text
  const contentText =
    (input.partType === "text" || input.partType === "reasoning") && typeof text === "string"
      ? text.slice(0, 1000)
      : null

  const existingEntry = tx
    .select({ id: EntriesTable.id })
    .from(EntriesTable)
    .where(eq(EntriesTable.id, input.partID))
    .get()
  tx.insert(EntriesTable)
    .values({
      id: input.partID,
      type: entryType,
      actor: input.actor,
      runner_type: input.actor,
      content_text: contentText,
      payload_json: input.payload,
      status: "complete",
      created_at: input.createdAt,
    })
    .onConflictDoUpdate({
      target: EntriesTable.id,
      set: { payload_json: input.payload, content_text: contentText },
    })
    .run()
  if (!existingEntry) created++

  created += writePartContainsEdge(tx, {
    messageID: input.messageID,
    partID: input.partID,
    createdAt: input.createdAt,
  })

  return created
}

/**
 * Writes a tool part's entries/edges (tool_call, and — once terminal — tool_result)
 * into the universal entries+edges model. Shared by migrateSession() (backfill) and
 * Session.updatePart() (live writes) so both paths stay identical.
 */
export function writeToolPartEntries(
  tx: any,
  input: {
    partID: string
    messageID: string
    tool: string
    state: { status: string; output?: unknown; error?: unknown }
    payload: Record<string, unknown>
    actor: string
    createdAt: string
  },
): number {
  let created = 0
  const status = mapPartStatusToEntryStatus(input.state.status)

  const existingCallEntry = tx
    .select({ id: EntriesTable.id })
    .from(EntriesTable)
    .where(eq(EntriesTable.id, input.partID))
    .get()
  tx.insert(EntriesTable)
    .values({
      id: input.partID,
      type: "tool_call",
      actor: input.actor,
      runner_type: input.actor,
      content_text: null,
      payload_json: input.payload,
      status,
      created_at: input.createdAt,
    })
    .onConflictDoUpdate({
      target: EntriesTable.id,
      set: { status, payload_json: input.payload },
    })
    .run()
  if (!existingCallEntry) created++

  const existingUsed = tx
    .select({ id: EdgesTable.id })
    .from(EdgesTable)
    .where(
      and(
        eq(EdgesTable.from_id, input.partID),
        eq(EdgesTable.to_id, input.tool),
        eq(EdgesTable.type, "used"),
      ),
    )
    .limit(1)
    .get()
  if (!existingUsed) {
    tx.insert(EdgesTable)
      .values({
        id: Identifier.ascending("edge"),
        from_type: "entry",
        from_id: input.partID,
        to_type: "tool",
        to_id: input.tool,
        type: "used",
        seq_in_parent: null,
        label: null,
        metadata: null,
        created_at: input.createdAt,
      })
      .onConflictDoNothing()
      .run()
    created++
  }

  if (input.state.status === "completed" || input.state.status === "error") {
    const resultID = `${input.partID}:result`
    const output = input.state.output
    const existingResultEntry = tx
      .select({ id: EntriesTable.id })
      .from(EntriesTable)
      .where(eq(EntriesTable.id, resultID))
      .get()
    tx.insert(EntriesTable)
      .values({
        id: resultID,
        type: "tool_result",
        actor: input.actor,
        runner_type: input.actor,
        content_text: typeof output === "string" ? output.slice(0, 1000) : null,
        payload_json: (input.state.error ?? input.state.output ?? {}) as Record<string, unknown>,
        status,
        created_at: input.createdAt,
      })
      .onConflictDoUpdate({
        target: EntriesTable.id,
        set: {
          status,
          content_text: typeof output === "string" ? output.slice(0, 1000) : null,
          payload_json: (input.state.error ?? input.state.output ?? {}) as Record<string, unknown>,
        },
      })
      .run()
    if (!existingResultEntry) created++

    const existingCaused = tx
      .select({ id: EdgesTable.id })
      .from(EdgesTable)
      .where(
        and(
          eq(EdgesTable.from_id, input.partID),
          eq(EdgesTable.to_id, resultID),
          eq(EdgesTable.type, "caused"),
        ),
      )
      .limit(1)
      .get()
    if (!existingCaused) {
      tx.insert(EdgesTable)
        .values({
          id: Identifier.ascending("edge"),
          from_type: "entry",
          from_id: input.partID,
          to_type: "entry",
          to_id: resultID,
          type: "caused",
          seq_in_parent: null,
          label: null,
          metadata: null,
          created_at: input.createdAt,
        })
        .onConflictDoNothing()
        .run()
      created++
    }
  }

  created += writePartContainsEdge(tx, {
    messageID: input.messageID,
    partID: input.partID,
    createdAt: input.createdAt,
  })

  return created
}

/**
 * Deletes an entry and every edge touching it (as either endpoint) from the
 * universal entries+edges model. Used to keep EntriesTable/EdgesTable in sync
 * with legacy MessageTable/PartTable deletes (removeMessage/removePart/revert).
 */
export function deleteEntryGraph(db: any, entryId: string): void {
  db.delete(EdgesTable)
    .where(or(eq(EdgesTable.from_id, entryId), eq(EdgesTable.to_id, entryId)))
    .run()
  db.delete(EntriesTable).where(eq(EntriesTable.id, entryId)).run()
}

/**
 * Deletes a tool part's own entry/edges plus its ":result" entry/edges, if any.
 * Safe to call for non-tool parts — the ":result" delete is then a no-op.
 */
export function deleteToolPartGraph(db: any, partId: string): void {
  deleteEntryGraph(db, partId)
  deleteEntryGraph(db, `${partId}:result`)
}

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

  // Idempotent guard: message/contains/reply_to backfill only needs to run once per
  // session. Tool-part backfill runs every call regardless — it was added after some
  // sessions already had contains edges, so it can't rely on the same guard, and its
  // own inserts are independently idempotent (checked below).
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
  const skipMessages = !!existingContains

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

  const partRows = db
    .select({
      id: PartTable.id,
      message_id: PartTable.message_id,
      time_created: PartTable.time_created,
      data: PartTable.data,
    })
    .from(PartTable)
    .where(eq(PartTable.session_id, sessionId))
    .orderBy(asc(PartTable.id))
    .all()

  if (msgRows.length === 0 && partRows.length === 0) return 0

  // Migrate legacy entry_edge rows — read before entering the transaction
  const legacyEdges = skipMessages
    ? []
    : db
        .select()
        .from(EntryEdgeTable)
        .where(eq(EntryEdgeTable.session_id, sessionId))
        .all()

  return db.transaction((tx: any) => {
    let created = 0
    const messageActor = new Map<string, string>()

    for (let i = 0; i < msgRows.length; i++) {
      const row = msgRows[i]!

      // Determine actor from message data — needed for the part loop below
      // even when the message/edge writes themselves are skipped.
      const data = row.data as Record<string, unknown>
      const actor = deriveActor(data)
      messageActor.set(row.id, actor)

      if (skipMessages) continue

      const createdAt = new Date(row.time_created).toISOString()

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

    for (const partRow of partRows) {
      const data = partRow.data as Record<string, unknown>
      const partType = data?.type as string | undefined
      if (!partType) continue
      const actor = messageActor.get(partRow.message_id) ?? "assistant"
      const createdAt = new Date(partRow.time_created).toISOString()

      if (partType === "tool") {
        const state = data.state as { status: string; output?: unknown; error?: unknown } | undefined
        const tool = data.tool as string | undefined
        if (!state || !tool) continue
        created += writeToolPartEntries(tx, {
          partID: partRow.id,
          messageID: partRow.message_id,
          tool,
          state,
          payload: data,
          actor,
          createdAt,
        })
      } else {
        created += writeGenericPartEntry(tx, {
          partID: partRow.id,
          messageID: partRow.message_id,
          partType,
          payload: data,
          actor,
          createdAt,
        })
      }
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

  // Check for a global completion marker — if present and it already reflects
  // tool-part backfill and full part backfill, skip the full scan. Installations
  // whose marker predates either feature (missing the corresponding flag) get
  // exactly one more full scan to catch up, since migrateSession()'s per-session
  // contains-edge guard means those sessions would otherwise never be revisited.
  const marker = db
    .select({ id: GraphMigrationStateTable.id, metadata: GraphMigrationStateTable.metadata })
    .from(GraphMigrationStateTable)
    .where(eq(GraphMigrationStateTable.id, "graph-migration-complete"))
    .get()
  const meta = marker?.metadata as { toolPartsBackfilled?: boolean; allPartsBackfilled?: boolean } | undefined
  if (marker && meta?.toolPartsBackfilled && meta?.allPartsBackfilled) return

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

  // Write (or update) the completion marker so subsequent calls skip the full scan.
  db.insert(GraphMigrationStateTable)
    .values({
      id: "graph-migration-complete",
      completed_at: new Date().toISOString(),
      metadata: { total, migrated, toolPartsBackfilled: true, allPartsBackfilled: true },
    })
    .onConflictDoUpdate({
      target: GraphMigrationStateTable.id,
      set: {
        completed_at: new Date().toISOString(),
        metadata: { total, migrated, toolPartsBackfilled: true, allPartsBackfilled: true },
      },
    })
    .run()

  if (total > 0) {
    log.info(
      `[graph-migration] migrated ${migrated} sessions (${total} rows) to universal entries+edges`,
    )
  }
}

export type SessionMismatch = {
  sessionId: string
  legacyMessageCount: number
  containsEdgeCount: number
  legacyPartCount: number
  issues: string[]
}

export type VerificationReport = {
  sessionsChecked: number
  sessionsClean: number
  mismatches: SessionMismatch[]
}

/**
 * Compares legacy MessageTable/PartTable data against the universal entries+edges
 * model for one session (or every session) and reports any mismatch. This is the
 * artifact that must show zero mismatches before the legacy tables can be deleted.
 */
export function verifyMigration(sessionId?: string): VerificationReport {
  const db = getConfig().db
  const sessionRows = sessionId
    ? [{ id: sessionId }]
    : db.select({ id: SessionTable.id }).from(SessionTable).all()

  const mismatches: SessionMismatch[] = []

  for (const { id } of sessionRows) {
    const issues: string[] = []

    const legacyMessages = db
      .select({ id: MessageTable.id })
      .from(MessageTable)
      .where(eq(MessageTable.session_id, id))
      .all()

    const containsEdgeCount = db
      .select({ id: EdgesTable.id })
      .from(EdgesTable)
      .where(
        and(
          eq(EdgesTable.from_type, "session"),
          eq(EdgesTable.from_id, id),
          eq(EdgesTable.type, "contains"),
        ),
      )
      .all().length
    if (containsEdgeCount !== legacyMessages.length) {
      issues.push(`expected ${legacyMessages.length} contains edge(s), found ${containsEdgeCount}`)
    }

    for (const msg of legacyMessages) {
      const entry = db.select({ id: EntriesTable.id }).from(EntriesTable).where(eq(EntriesTable.id, msg.id)).get()
      if (!entry) issues.push(`message ${msg.id} has no matching entry`)
    }

    const legacyParts = db
      .select({ id: PartTable.id, message_id: PartTable.message_id, data: PartTable.data })
      .from(PartTable)
      .where(eq(PartTable.session_id, id))
      .all()

    for (const part of legacyParts) {
      const partType = (part.data as any)?.type
      if (!partType) continue

      if (partType === "tool") {
        const entry = db.select({ type: EntriesTable.type }).from(EntriesTable).where(eq(EntriesTable.id, part.id)).get()
        if (!entry || entry.type !== "tool_call") {
          issues.push(`tool part ${part.id} missing tool_call entry`)
        }
        const state = (part.data as any)?.state
        if (state?.status === "completed" || state?.status === "error") {
          const resultEntry = db
            .select({ type: EntriesTable.type })
            .from(EntriesTable)
            .where(eq(EntriesTable.id, `${part.id}:result`))
            .get()
          if (!resultEntry || resultEntry.type !== "tool_result") {
            issues.push(`tool part ${part.id} missing tool_result entry`)
          }
        }
      } else {
        const entry = db.select({ id: EntriesTable.id }).from(EntriesTable).where(eq(EntriesTable.id, part.id)).get()
        if (!entry) issues.push(`${partType} part ${part.id} missing entry`)
      }

      const containsEdge = db
        .select({ id: EdgesTable.id })
        .from(EdgesTable)
        .where(
          and(
            eq(EdgesTable.from_id, part.message_id),
            eq(EdgesTable.to_id, part.id),
            eq(EdgesTable.type, "contains"),
          ),
        )
        .limit(1)
        .get()
      if (!containsEdge) issues.push(`part ${part.id} missing contains edge from message ${part.message_id}`)
    }

    if (issues.length > 0) {
      mismatches.push({
        sessionId: id,
        legacyMessageCount: legacyMessages.length,
        containsEdgeCount,
        legacyPartCount: legacyParts.length,
        issues,
      })
    }
  }

  return {
    sessionsChecked: sessionRows.length,
    sessionsClean: sessionRows.length - mismatches.length,
    mismatches,
  }
}
