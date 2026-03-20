import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { eq, and, desc, type SQL } from "drizzle-orm"
import {
  SqliteSessionsTable as S,
  SqliteMessagesTable as M,
} from "../drizzle/schema.ts"
import * as schema from "../drizzle/schema.ts"
import type { StorageAdapter } from "../adapter.ts"
import type { Message, SessionFilter, SessionMeta } from "../../index.ts"

// ─── Migration ───────────────────────────────────────────────────────────────

const MIGRATION = `
  CREATE TABLE IF NOT EXISTS sessions (
    id                TEXT    PRIMARY KEY,
    type              TEXT    NOT NULL,
    status            TEXT    NOT NULL,
    label             TEXT,
    parent_session_id TEXT,
    parent_message_id TEXT,
    spawn_depth       INTEGER,
    retention         TEXT    NOT NULL,
    send_policy       TEXT,
    agent_id          TEXT,
    default_path      TEXT,
    tool_policy       TEXT,
    system_prompt     TEXT,
    share_url         TEXT,
    compaction_count  INTEGER,
    compacting_at     INTEGER,
    input_tokens      INTEGER,
    output_tokens     INTEGER,
    cache_read_tokens INTEGER,
    cache_write_tokens INTEGER,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    archived_at       INTEGER
  );
  CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions(status);
  CREATE INDEX IF NOT EXISTS sessions_parent_idx ON sessions(parent_session_id);

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT    PRIMARY KEY,
    session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind        TEXT    NOT NULL,
    sender      TEXT    NOT NULL,
    parent      TEXT,
    parts       TEXT    NOT NULL,
    provenance  TEXT,
    token_count INTEGER,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_session_idx ON messages(session_id);
`

// ─── Row → domain mappers ────────────────────────────────────────────────────

function rowToMeta(row: typeof S.$inferSelect): SessionMeta {
  return {
    id:              row.id,
    type:            row.type   as SessionMeta["type"],
    status:          row.status as SessionMeta["status"],
    label:           row.label         ?? undefined,
    parent:          row.parentSessionId
      ? { sessionId: row.parentSessionId, messageId: row.parentMessageId ?? undefined }
      : undefined,
    spawnDepth:      row.spawnDepth      ?? undefined,
    retention:       row.retention       as ReturnType<typeof rowToMeta>["retention"],
    sendPolicy:      row.sendPolicy      ?? undefined,
    agentId:         row.agentId         ?? undefined,
    defaultPath:     row.defaultPath     ?? undefined,
    toolPolicy:      row.toolPolicy      ?? undefined,
    systemPrompt:    row.systemPrompt    ?? undefined,
    share:           row.shareUrl        ? { url: row.shareUrl } : undefined,
    compactionCount:  row.compactionCount  ?? undefined,
    compactingAt:     row.compactingAt     ?? undefined,
    inputTokens:      row.inputTokens      ?? undefined,
    outputTokens:     row.outputTokens     ?? undefined,
    cacheReadTokens:  row.cacheReadTokens  ?? undefined,
    cacheWriteTokens: row.cacheWriteTokens ?? undefined,
    createdAt:        row.createdAt,
    updatedAt:        row.updatedAt,
    archivedAt:       row.archivedAt       ?? undefined,
  }
}

function rowToMessage(row: typeof M.$inferSelect): Message {
  return {
    id:         row.id,
    sessionId:  row.sessionId,
    kind:       row.kind as Message["kind"],
    from:       row.sender as Message["from"],
    parent:     (row.parent ?? null) as Message["parent"],
    parts:      row.parts  as Message["parts"],
    provenance: (row.provenance ?? undefined) as Message["provenance"],
    tokenCount: row.tokenCount ?? undefined,
    timestamp:  row.createdAt,
  }
}

// ─── SqliteAdapter ───────────────────────────────────────────────────────────

export class SqliteAdapter implements StorageAdapter {
  private db: BetterSQLite3Database<typeof schema>

  constructor(filePath: string) {
    const client = new Database(filePath)
    client.pragma("journal_mode = WAL")
    client.pragma("foreign_keys = ON")
    client.exec(MIGRATION)
    this.db = drizzle(client, { schema })
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async createSession(meta: SessionMeta): Promise<void> {
    this.db.insert(S).values({
      id:              meta.id,
      type:            meta.type,
      status:          meta.status,
      label:           meta.label,
      parentSessionId: meta.parent?.sessionId,
      parentMessageId: meta.parent?.messageId,
      spawnDepth:      meta.spawnDepth,
      retention:       meta.retention,
      sendPolicy:      meta.sendPolicy,
      agentId:         meta.agentId,
      defaultPath:     meta.defaultPath,
      toolPolicy:      meta.toolPolicy,
      systemPrompt:    meta.systemPrompt,
      shareUrl:        meta.share?.url,
      compactionCount:  meta.compactionCount,
      compactingAt:     meta.compactingAt,
      inputTokens:      meta.inputTokens,
      outputTokens:     meta.outputTokens,
      cacheReadTokens:  meta.cacheReadTokens,
      cacheWriteTokens: meta.cacheWriteTokens,
      createdAt:        meta.createdAt,
      updatedAt:        meta.updatedAt,
      archivedAt:       meta.archivedAt,
    }).run()
  }

  async getSession(id: string): Promise<SessionMeta | null> {
    const row = this.db.select().from(S).where(eq(S.id, id)).get()
    return row ? rowToMeta(row) : null
  }

  async updateSession(id: string, patch: Partial<SessionMeta>): Promise<void> {
    const values: Record<string, unknown> = { updatedAt: Date.now() }
    if (patch.status          !== undefined) values.status          = patch.status
    if (patch.label           !== undefined) values.label           = patch.label
    if (patch.retention       !== undefined) values.retention       = patch.retention
    if (patch.sendPolicy      !== undefined) values.sendPolicy      = patch.sendPolicy
    if ("defaultPath" in patch)             values.defaultPath     = patch.defaultPath ?? null
    if (patch.archivedAt      !== undefined) values.archivedAt      = patch.archivedAt
    if (patch.spawnDepth      !== undefined) values.spawnDepth      = patch.spawnDepth
    if (patch.compactionCount  !== undefined) values.compactionCount  = patch.compactionCount
    if ("compactingAt" in patch)              values.compactingAt     = patch.compactingAt ?? null
    if ("share" in patch)                     values.shareUrl         = patch.share?.url ?? null
    if (patch.inputTokens      !== undefined) values.inputTokens      = patch.inputTokens
    if (patch.outputTokens     !== undefined) values.outputTokens     = patch.outputTokens
    if (patch.cacheReadTokens  !== undefined) values.cacheReadTokens  = patch.cacheReadTokens
    if (patch.cacheWriteTokens !== undefined) values.cacheWriteTokens = patch.cacheWriteTokens
    this.db.update(S).set(values).where(eq(S.id, id)).run()
  }

  async listSessions(filter?: SessionFilter): Promise<SessionMeta[]> {
    const conditions: SQL[] = []
    if (filter?.status)   conditions.push(eq(S.status, filter.status))
    if (filter?.type)     conditions.push(eq(S.type, filter.type))
    if (filter?.parentId) conditions.push(eq(S.parentSessionId, filter.parentId))

    const rows = (conditions.length
      ? this.db.select().from(S).where(and(...conditions))
      : this.db.select().from(S)
    ).orderBy(desc(S.updatedAt)).all()

    return rows.map(rowToMeta)
  }

  async deleteSession(id: string): Promise<void> {
    this.db.delete(S).where(eq(S.id, id)).run()
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  async appendMessage(msg: Message): Promise<void> {
    this.db.insert(M).values({
      id:         msg.id,
      sessionId:  msg.sessionId,
      kind:       msg.kind,
      sender:     msg.from,
      parent:     msg.parent,
      parts:      msg.parts,
      provenance: msg.provenance,
      tokenCount: msg.tokenCount,
      createdAt:  msg.timestamp,
    }).run()
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const rows = this.db.select().from(M)
      .where(eq(M.sessionId, sessionId))
      .orderBy(M.createdAt)
      .all()
    return rows.map(rowToMessage)
  }

  async getMessage(id: string): Promise<Message | null> {
    const row = this.db.select().from(M).where(eq(M.id, id)).get()
    return row ? rowToMessage(row) : null
  }
}
