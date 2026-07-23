/**
 * Shared helpers for vendor importers: JSONL streaming, row construction,
 * and direct writes to the universal entries+edges model.
 *
 * Importers bypass `Session.updateMessage` / `Session.updatePart` on purpose
 * — they perform a bulk backfill of existing conversations and must not fire
 * runtime bus events or touch retention counters. They write EntriesTable/
 * EdgesTable directly via the same helpers Session.updateMessage/updatePart
 * use internally, which don't publish bus events themselves.
 */

import fs from "fs"
import readline from "readline"
import { Identifier } from "@projectflows/util/id"
import { getConfig } from "../config"
import { SessionTable, EdgesTable, EntriesTable } from "../session.sql"
import { eq, and } from "drizzle-orm"
import { deriveActor, writeContainsEdge, writeGenericPartEntry, writeToolPartEntries } from "../graph-writes"
import type { MessageV2 } from "../message-v2"
import type { Vendor } from "./types"

// ─── JSONL streaming ──────────────────────────────────────────────────────────

/** Yield one parsed JSON value per non-empty line. Invalid lines are skipped. */
export async function* readJsonl<T = unknown>(path: string): AsyncGenerator<T> {
  const stream = fs.createReadStream(path, { encoding: "utf-8" })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      yield JSON.parse(trimmed) as T
    } catch {
      // skip malformed lines — importers count them via the caller
    }
  }
}

// ─── Session row construction ────────────────────────────────────────────────

export interface SessionRowInput {
  id: string
  projectID: string
  vendor: Vendor
  nativeID: string | null
  title: string
  slug: string
  directory: string
  timeCreated: number
  timeUpdated: number
  vendorRawHeader: unknown
}

export function insertSessionRow(input: SessionRowInput): void {
  const db = getConfig().db
  db.insert(SessionTable)
    .values({
      id: input.id,
      project_id: input.projectID,
      slug: input.slug,
      directory: input.directory,
      title: input.title,
      version: "0.0.0-import",
      share_url: null,
      permission: null,
      time_created: input.timeCreated,
      time_updated: input.timeUpdated,
      time_archived: null,
      session_type: "scope",
      session_status: "archived",
      agent_id: null,
      owner_id: null,
      owner_kind: null,
      allowed_agents: null,
      send_policy: null,
      retention: null,
      path: null,
      read_path: null,
      spawn_depth: null,
      parent_session_id: null,
      reply_to_session_id: null,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      compaction_count: 0,
      vendor: input.vendor,
      native_id: input.nativeID,
      vendor_raw_header: input.vendorRawHeader as any,
    })
    .onConflictDoNothing()
    .run()
}

// ─── Message + part writes ────────────────────────────────────────────────────

export interface MessageRowInput {
  sessionID: string
  info: MessageV2.Info
  /** Optional native id (Claude uuid, Codex item id). */
  nativeID?: string | null
  /** Original source record preserved verbatim. */
  vendorRaw?: unknown
  /** Parent message id within the session. */
  parentMessageID?: string | null
}

export function insertMessageRow(input: MessageRowInput): void {
  const db = getConfig().db
  const { id, sessionID: _omitSessionID, ...data } = input.info
  const timeCreated = input.info.time.created
  const createdAt = new Date(timeCreated).toISOString()
  const actor = deriveActor(data as Record<string, unknown>)
  const payload = {
    ...(data as Record<string, unknown>),
    ...(input.nativeID ? { _native_id: input.nativeID } : {}),
    ...(input.vendorRaw ? { _vendor_raw: input.vendorRaw } : {}),
  }

  db.insert(EntriesTable)
    .values({
      id,
      type: "message",
      actor,
      runner_type: actor,
      content_text: null,
      payload_json: payload,
      status: "complete",
      created_at: createdAt,
    })
    .onConflictDoUpdate({ target: EntriesTable.id, set: { payload_json: payload } })
    .run()

  writeContainsEdge(db, { fromType: "session", fromID: input.sessionID, toID: id, createdAt })

  if (input.parentMessageID) {
    const parentSessionEdge = db
      .select({ from_id: EdgesTable.from_id })
      .from(EdgesTable)
      .where(
        and(
          eq(EdgesTable.from_type, "session"),
          eq(EdgesTable.to_id, input.parentMessageID),
          eq(EdgesTable.type, "contains"),
        ),
      )
      .get()
    const parentSessionID = parentSessionEdge?.from_id
    const isDelegation = !!parentSessionID && parentSessionID !== input.sessionID

    const existingReply = db
      .select({ id: EdgesTable.id })
      .from(EdgesTable)
      .where(
        and(
          eq(EdgesTable.from_id, input.parentMessageID),
          eq(EdgesTable.to_id, id),
          eq(EdgesTable.type, "reply_to"),
        ),
      )
      .limit(1)
      .get()
    if (!existingReply) {
      db.insert(EdgesTable)
        .values({
          id: Identifier.ascending("edge"),
          from_type: "entry",
          from_id: input.parentMessageID,
          to_type: "entry",
          to_id: id,
          type: "reply_to",
          seq_in_parent: null,
          label: null,
          metadata: isDelegation ? { delegation: true } : null,
          created_at: createdAt,
        })
        .onConflictDoNothing()
        .run()
    }
  }
}

export interface PartRowInput {
  sessionID: string
  messageID: string
  part: MessageV2.Part
  nativeID?: string | null
  vendorRaw?: unknown
  timeCreated?: number
}

export function insertPartRow(input: PartRowInput): void {
  const db = getConfig().db
  const { id, messageID: _m, sessionID: _s, ...data } = input.part
  const timeCreated = input.timeCreated ?? Date.now()
  const createdAt = new Date(timeCreated).toISOString()
  const payload = {
    ...(data as Record<string, unknown>),
    ...(input.nativeID ? { _native_id: input.nativeID } : {}),
    ...(input.vendorRaw ? { _vendor_raw: input.vendorRaw } : {}),
  }

  const msgEntry = db
    .select({ payload_json: EntriesTable.payload_json })
    .from(EntriesTable)
    .where(eq(EntriesTable.id, input.messageID))
    .get()
  const actor = deriveActor(msgEntry?.payload_json as Record<string, unknown> | undefined)
  const partType = (data as any).type as string

  if (partType === "tool") {
    writeToolPartEntries(db, {
      partID: id,
      messageID: input.messageID,
      tool: (data as any).tool,
      state: (data as any).state,
      payload,
      actor,
      createdAt,
    })
  } else {
    writeGenericPartEntry(db, {
      partID: id,
      messageID: input.messageID,
      partType,
      payload,
      actor,
      createdAt,
    })
  }
}

// ─── Id helpers ──────────────────────────────────────────────────────────────

export function newSessionID(): string {
  return Identifier.ascending("session")
}
export function newMessageID(): string {
  return Identifier.ascending("message")
}
export function newPartID(): string {
  return Identifier.ascending("part")
}
