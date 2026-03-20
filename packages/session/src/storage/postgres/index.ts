import postgres from "postgres"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { eq, and, desc, type SQL } from "drizzle-orm"
import {
  PgSessionsTable as S,
  PgMessagesTable as M,
} from "../drizzle/schema.ts"
import * as schema from "../drizzle/schema.ts"
import type { StorageAdapter } from "../adapter.ts"
import type { Message, SessionFilter, SessionMeta } from "../../index.ts"

// ─── Connection options ───────────────────────────────────────────────────────

export type PostgresAdapterOptions =
  | { url: string }
  | { host: string; port?: number; user: string; password: string; database: string }

function toConnectionString(opts: PostgresAdapterOptions): string {
  if ("url" in opts) return opts.url
  const port = opts.port ?? 5432
  return `postgres://${opts.user}:${encodeURIComponent(opts.password)}@${opts.host}:${port}/${opts.database}`
}

// ─── Migration ───────────────────────────────────────────────────────────────

const MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
    id                TEXT        PRIMARY KEY,
    type              TEXT        NOT NULL,
    status            TEXT        NOT NULL,
    label             TEXT,
    parent_session_id TEXT,
    parent_message_id TEXT,
    spawn_depth       BIGINT,
    retention         JSONB       NOT NULL,
    send_policy       JSONB,
    agent_id          TEXT,
    default_path      TEXT,
    tool_policy       JSONB,
    system_prompt     TEXT,
    share_url         TEXT,
    compaction_count  BIGINT,
    compacting_at     BIGINT,
    input_tokens      BIGINT,
    output_tokens     BIGINT,
    cache_read_tokens BIGINT,
    cache_write_tokens BIGINT,
    created_at        BIGINT      NOT NULL,
    updated_at        BIGINT      NOT NULL,
    archived_at       BIGINT
  );
  CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions(status);
  CREATE INDEX IF NOT EXISTS sessions_parent_idx ON sessions(parent_session_id);

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT    PRIMARY KEY,
    session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind        TEXT    NOT NULL,
    sender      JSONB   NOT NULL,
    parent      JSONB,
    parts       JSONB   NOT NULL,
    provenance  TEXT,
    token_count BIGINT,
    created_at  BIGINT  NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_session_idx ON messages(session_id);
`

// ─── Row → domain mappers ────────────────────────────────────────────────────

function rowToMeta(row: typeof S.$inferSelect): SessionMeta {
  return {
    id:              row.id,
    type:            row.type as SessionMeta["type"],
    status:          row.status as SessionMeta["status"],
    label:           row.label ?? undefined,
    parent:          row.parentSessionId
      ? { sessionId: row.parentSessionId, messageId: row.parentMessageId ?? undefined }
      : undefined,
    spawnDepth:      row.spawnDepth      != null ? Number(row.spawnDepth)      : undefined,
    retention:       row.retention,
    sendPolicy:      row.sendPolicy      ?? undefined,
    agentId:         row.agentId         ?? undefined,
    defaultPath:     row.defaultPath     ?? undefined,
    toolPolicy:      (row.toolPolicy as string[] | null) ?? undefined,
    systemPrompt:    row.systemPrompt    ?? undefined,
    share:           row.shareUrl        ? { url: row.shareUrl } : undefined,
    compactionCount:  row.compactionCount  != null ? Number(row.compactionCount)  : undefined,
    compactingAt:     row.compactingAt     != null ? Number(row.compactingAt)     : undefined,
    inputTokens:      row.inputTokens      != null ? Number(row.inputTokens)      : undefined,
    outputTokens:     row.outputTokens     != null ? Number(row.outputTokens)     : undefined,
    cacheReadTokens:  row.cacheReadTokens  != null ? Number(row.cacheReadTokens)  : undefined,
    cacheWriteTokens: row.cacheWriteTokens != null ? Number(row.cacheWriteTokens) : undefined,
    createdAt:        Number(row.createdAt),
    updatedAt:        Number(row.updatedAt),
    archivedAt:       row.archivedAt       != null ? Number(row.archivedAt)       : undefined,
  }
}

function rowToMessage(row: typeof M.$inferSelect): Message {
  return {
    id:         row.id,
    sessionId:  row.sessionId,
    kind:       row.kind as Message["kind"],
    from:       row.sender,
    parent:     row.parent ?? null,
    parts:      row.parts,
    provenance: (row.provenance ?? undefined) as Message["provenance"],
    tokenCount: row.tokenCount != null ? Number(row.tokenCount) : undefined,
    timestamp:  Number(row.createdAt),
  }
}

// ─── PostgresAdapter ─────────────────────────────────────────────────────────

export class PostgresAdapter implements StorageAdapter {
  private client: postgres.Sql
  private db: PostgresJsDatabase<typeof schema>
  private ready: Promise<void>

  constructor(opts: PostgresAdapterOptions) {
    this.client = postgres(toConnectionString(opts))
    this.db = drizzle(this.client, { schema })
    this.ready = this.client.unsafe(MIGRATION_SQL).then(() => undefined)
  }

  /** Close the underlying connection pool. Call when shutting down. */
  async end(): Promise<void> {
    await this.client.end()
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  async createSession(meta: SessionMeta): Promise<void> {
    await this.ready
    await this.db.insert(S).values({
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
    })
  }

  async getSession(id: string): Promise<SessionMeta | null> {
    await this.ready
    const [row] = await this.db.select().from(S).where(eq(S.id, id)).limit(1)
    return row ? rowToMeta(row) : null
  }

  async updateSession(id: string, patch: Partial<SessionMeta>): Promise<void> {
    await this.ready
    const update: Record<string, unknown> = { updatedAt: Date.now() }
    if (patch.status          !== undefined) update.status          = patch.status
    if (patch.label           !== undefined) update.label           = patch.label
    if (patch.retention       !== undefined) update.retention       = patch.retention
    if (patch.sendPolicy      !== undefined) update.sendPolicy      = patch.sendPolicy
    if ("defaultPath" in patch)             update.defaultPath     = patch.defaultPath ?? null
    if (patch.archivedAt      !== undefined) update.archivedAt      = patch.archivedAt
    if (patch.spawnDepth      !== undefined) update.spawnDepth      = patch.spawnDepth
    if (patch.compactionCount  !== undefined) update.compactionCount  = patch.compactionCount
    if ("compactingAt" in patch)              update.compactingAt     = patch.compactingAt ?? null
    if ("share" in patch)                     update.shareUrl         = patch.share?.url ?? null
    if (patch.inputTokens      !== undefined) update.inputTokens      = patch.inputTokens
    if (patch.outputTokens     !== undefined) update.outputTokens     = patch.outputTokens
    if (patch.cacheReadTokens  !== undefined) update.cacheReadTokens  = patch.cacheReadTokens
    if (patch.cacheWriteTokens !== undefined) update.cacheWriteTokens = patch.cacheWriteTokens
    await this.db.update(S).set(update).where(eq(S.id, id))
  }

  async listSessions(filter?: SessionFilter): Promise<SessionMeta[]> {
    await this.ready
    const conditions: SQL[] = []
    if (filter?.status)   conditions.push(eq(S.status, filter.status))
    if (filter?.type)     conditions.push(eq(S.type, filter.type))
    if (filter?.parentId) conditions.push(eq(S.parentSessionId, filter.parentId))

    const rows = await (conditions.length
      ? this.db.select().from(S).where(and(...conditions))
      : this.db.select().from(S)
    ).orderBy(desc(S.updatedAt))

    return rows.map(rowToMeta)
  }

  async deleteSession(id: string): Promise<void> {
    await this.ready
    await this.db.delete(S).where(eq(S.id, id))
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  async appendMessage(msg: Message): Promise<void> {
    await this.ready
    await this.db.insert(M).values({
      id:         msg.id,
      sessionId:  msg.sessionId,
      kind:       msg.kind,
      sender:     msg.from,
      parent:     msg.parent,
      parts:      msg.parts,
      provenance: msg.provenance,
      tokenCount: msg.tokenCount,
      createdAt:  msg.timestamp,
    })
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    await this.ready
    const rows = await this.db.select().from(M)
      .where(eq(M.sessionId, sessionId))
      .orderBy(M.createdAt)
    return rows.map(rowToMessage)
  }

  async getMessage(id: string): Promise<Message | null> {
    await this.ready
    const [row] = await this.db.select().from(M).where(eq(M.id, id)).limit(1)
    return row ? rowToMessage(row) : null
  }
}
