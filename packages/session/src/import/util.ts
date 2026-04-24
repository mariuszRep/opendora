/**
 * Shared helpers for vendor importers: JSONL streaming, row construction,
 * and direct writes to the MessageV2 tables.
 *
 * Importers bypass `Session.updateMessage` / `Session.updatePart` on purpose
 * — they perform a bulk backfill of existing conversations and must not fire
 * runtime bus events or touch retention counters.
 */

import fs from "fs"
import readline from "readline"
import { Identifier } from "@opendora/util/id"
import { getConfig } from "../config"
import { SessionTable, MessageTable, PartTable } from "../session.sql"
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
  db.insert(MessageTable)
    .values({
      id,
      session_id: input.sessionID,
      time_created: timeCreated,
      time_updated: timeCreated,
      parent_message_id: input.parentMessageID ?? null,
      data: data as any,
      native_id: input.nativeID ?? null,
      vendor_raw: (input.vendorRaw ?? null) as any,
    })
    .onConflictDoNothing()
    .run()
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
  db.insert(PartTable)
    .values({
      id,
      message_id: input.messageID,
      session_id: input.sessionID,
      time_created: timeCreated,
      time_updated: timeCreated,
      data: data as any,
      native_id: input.nativeID ?? null,
      vendor_raw: (input.vendorRaw ?? null) as any,
    })
    .onConflictDoNothing()
    .run()
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
