/**
 * Universal entries+edges write helpers — shared by Session.updateMessage/
 * updatePart/removeMessage/removePart (live writes), revert.ts (cascade
 * deletes), and the vendor/CLI import bypass writers (bulk backfill), so
 * every write path stays identical.
 */

import { eq, or, and, sql } from "drizzle-orm"
import { EdgesTable, EntriesTable } from "./session.sql"
import { Identifier } from "@projectflows/util/id"
import type { EntryType } from "./types"

/**
 * Derives the graph `actor` value from a stored message's `data` blob —
 * shared by every write path so they all classify actors identically.
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
 * Writes a `contains` edge from a session or message entry to an entry it
 * contains (a message or a part), with `seq_in_parent` set to the child's
 * position among its parent's existing children — reusing the
 * edges_contains_idx composite index either way. Check-then-insert, safe to
 * call repeatedly (idempotent per parent/child pair).
 *
 * seq_in_parent is enforced unique per (from_type, from_id, type) by the
 * edges_contains_seq_unique partial index (session.sql.ts). A concurrent
 * writer touching the same parent from a different connection/process (e.g.
 * a nested workflow's child session) can race the max-read below, so on a
 * unique-constraint failure this retries with a freshly recomputed seq
 * instead of silently producing a duplicate or crashing the caller.
 */
function isUniqueConstraintError(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code
  if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT") return true
  const message = err instanceof Error ? err.message : String(err)
  return message.includes("UNIQUE constraint failed")
}

export function writeContainsEdge(
  tx: any,
  input: { fromType: "session" | "entry"; fromID: string; toID: string; createdAt: string },
): number {
  const existing = tx
    .select({ id: EdgesTable.id })
    .from(EdgesTable)
    .where(
      and(
        eq(EdgesTable.from_id, input.fromID),
        eq(EdgesTable.to_id, input.toID),
        eq(EdgesTable.type, "contains"),
      ),
    )
    .limit(1)
    .get()
  if (existing) return 0

  const MAX_ATTEMPTS = 5
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const seqResult = tx
      .select({ n: sql<number>`coalesce(max(seq_in_parent), -1) + 1` })
      .from(EdgesTable)
      .where(
        and(
          eq(EdgesTable.from_type, input.fromType),
          eq(EdgesTable.from_id, input.fromID),
          eq(EdgesTable.type, "contains"),
        ),
      )
      .get()

    try {
      tx.insert(EdgesTable)
        .values({
          id: Identifier.ascending("edge"),
          from_type: input.fromType,
          from_id: input.fromID,
          to_type: "entry",
          to_id: input.toID,
          type: "contains",
          seq_in_parent: seqResult?.n ?? 0,
          label: null,
          metadata: null,
          created_at: input.createdAt,
        })
        .run()
      return 1
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt === MAX_ATTEMPTS - 1) throw err
      // Another writer took this seq_in_parent — loop and retry with a fresh max.
    }
  }
  return 0
}

/**
 * Writes a non-tool part's entry (id=partID, type mapped via
 * mapPartTypeToEntryType) plus its message -> part contains edge.
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

  created += writeContainsEdge(tx, {
    fromType: "entry",
    fromID: input.messageID,
    toID: input.partID,
    createdAt: input.createdAt,
  })

  return created
}

/**
 * Writes a tool part's entries/edges (tool_call, and — once terminal — tool_result)
 * into the universal entries+edges model.
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

  created += writeContainsEdge(tx, {
    fromType: "entry",
    fromID: input.messageID,
    toID: input.partID,
    createdAt: input.createdAt,
  })

  return created
}

/**
 * Deletes an entry and every edge touching it (as either endpoint) from the
 * universal entries+edges model. Used to keep EntriesTable/EdgesTable in sync
 * with message/part removal (removeMessage/removePart/revert).
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
