/**
 * Implements PingPong's StorageAdapter interface backed by Projectflows's Drizzle/bun:sqlite.
 *
 * Session lifecycle (create/archive/close/reopen) is delegated to PingPong's SessionManager,
 * which calls through this adapter. Projectflows-specific fields (project_id, directory, slug,
 * version, permission) are supplied via setCreateContext() before each create call.
 *
 * Message methods translate between PingPong's flat Message format and Projectflows's MessageV2
 * row format.
 */

import type { StorageAdapter } from "./storage/adapter"
import type { SessionMeta, SessionFilter, Message } from "./types"
import { eq, and } from "drizzle-orm"
import { SessionTable } from "./session.sql"
import type { Permission } from "@projectflows/permission"
import type { RetentionPolicy, SendPolicy, SessionType, SessionStatus } from "./types"
import { getConfig } from "./config"

// ─── Projectflows-specific context for session creation ───────────────────────────
// PingPong's SessionMeta doesn't carry project_id, directory, slug, or version.
// We pre-register these before manager.create() so the adapter can use them.

export type CreateContext = {
  projectId: string
  directory: string
  version: string
  slug: string
  permission?: Permission.LegacyRuleset
}

// ─── Row ↔ SessionMeta mapping ───────────────────────────────────────────────

type SessionRow = typeof SessionTable.$inferSelect

export function rowToMeta(row: SessionRow): SessionMeta {
  return {
    id: row.id,
    type: (row.session_type ?? "scope") as SessionType,
    status: (row.session_status ?? (row.time_archived ? "archived" : "active")) as SessionStatus,
    label: row.title,
    parent: row.parent_session_id
      ? { sessionId: row.parent_session_id }
      : undefined,
    spawnDepth: row.spawn_depth ?? undefined,
    retention: row.retention ? (JSON.parse(row.retention) as RetentionPolicy) : { onExpire: "archive" },
    sendPolicy: row.send_policy ? (JSON.parse(row.send_policy) as SendPolicy) : undefined,
    agentId: row.agent_id ?? undefined,
    model: row.model ?? undefined,
    path: row.path ?? undefined,
    readPath: row.read_path ?? undefined,
    cwd: row.cwd ?? undefined,
    share: row.share_url ? { url: row.share_url } : undefined,
    compactionCount: row.compaction_count ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    cacheReadTokens: row.cache_read_tokens ?? undefined,
    cacheWriteTokens: row.cache_write_tokens ?? undefined,
    createdAt: row.time_created,
    updatedAt: row.time_updated,
    archivedAt: row.time_archived ?? undefined,
  }
}

// Maps a Partial<SessionMeta> patch to the subset of SessionTable columns we know about.
function patchToColumns(patch: Partial<SessionMeta>): Partial<typeof SessionTable.$inferInsert> {
  const cols: Partial<typeof SessionTable.$inferInsert> = {}

  if (patch.type !== undefined) cols.session_type = patch.type
  if (patch.status !== undefined) {
    cols.session_status = patch.status
    if (patch.status === "active") cols.time_archived = null as any
  }
  if (patch.archivedAt !== undefined) cols.time_archived = patch.archivedAt
  if (patch.label !== undefined) cols.title = patch.label
  if (patch.agentId !== undefined) cols.agent_id = patch.agentId
  if (patch.model !== undefined) cols.model = patch.model ?? null as any
  if (patch.path !== undefined) cols.path = patch.path ?? null as any
  if (patch.readPath !== undefined) cols.read_path = patch.readPath ?? null as any
  if (patch.cwd !== undefined) cols.cwd = patch.cwd ?? null as any
  if (patch.sendPolicy !== undefined) cols.send_policy = patch.sendPolicy ? JSON.stringify(patch.sendPolicy) : null as any
  if (patch.retention !== undefined) cols.retention = patch.retention ? JSON.stringify(patch.retention) : null as any
  if ("share" in patch) cols.share_url = patch.share?.url ?? null
  if (patch.compactionCount !== undefined) cols.compaction_count = patch.compactionCount
  if (patch.inputTokens !== undefined) cols.input_tokens = patch.inputTokens
  if (patch.outputTokens !== undefined) cols.output_tokens = patch.outputTokens
  if (patch.cacheReadTokens !== undefined) cols.cache_read_tokens = patch.cacheReadTokens
  if (patch.cacheWriteTokens !== undefined) cols.cache_write_tokens = patch.cacheWriteTokens

  // Always bump updatedAt on any patch
  cols.time_updated = Date.now()

  return cols
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class ProjectflowsStorageAdapter implements StorageAdapter {
  private pendingContext = new Map<string, CreateContext>()

  /**
   * Register Projectflows-specific fields for the next createSession call with this id.
   * Must be called before manager.create(id, ...) when the id is known upfront.
   */
  setCreateContext(id: string, ctx: CreateContext): void {
    this.pendingContext.set(id, ctx)
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  async createSession(meta: SessionMeta): Promise<void> {
    const ctx = this.pendingContext.get(meta.id)
    this.pendingContext.delete(meta.id)
    const db = getConfig().db

    // Fallback values — should be set via setCreateContext before calling create
    const projectId = ctx?.projectId ?? "unknown"
    const directory = ctx?.directory ?? process.cwd()
    const version = ctx?.version ?? "0.0.0"
    const slug = ctx?.slug ?? meta.id

    db.insert(SessionTable)
      .values({
        id: meta.id,
        project_id: projectId,
        slug,
        directory,
        title: meta.label ?? meta.id,
        version,
        share_url: meta.share?.url ?? null,
        permission: ctx?.permission ?? null,
        time_created: meta.createdAt,
        time_updated: meta.updatedAt,
        time_archived: meta.archivedAt ?? null,
        session_type: meta.type,
        session_status: meta.status,
        agent_id: meta.agentId ?? null,
        owner_id: null,
        owner_kind: null,
        allowed_agents: null,
        send_policy: meta.sendPolicy ? JSON.stringify(meta.sendPolicy) : null,
        retention: meta.retention ? JSON.stringify(meta.retention) : null,
        path: meta.path ?? null,
        read_path: meta.readPath ?? null,
        cwd: meta.cwd ?? null,
        spawn_depth: meta.spawnDepth ?? null,
        parent_session_id: meta.parent?.sessionId ?? null,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        compaction_count: 0,
      })
      .run()
  }

  async getSession(id: string): Promise<SessionMeta | null> {
    const db = getConfig().db
    const row = db.select().from(SessionTable).where(eq(SessionTable.id, id)).get()
    return row ? rowToMeta(row) : null
  }

  async updateSession(id: string, patch: Partial<SessionMeta>): Promise<void> {
    const cols = patchToColumns(patch)
    if (Object.keys(cols).length === 0) return
    const db = getConfig().db
    db.update(SessionTable).set(cols).where(eq(SessionTable.id, id)).run()
  }

  async listSessions(filter?: SessionFilter): Promise<SessionMeta[]> {
    const db = getConfig().db
    const conditions = []
    if (filter?.type) conditions.push(eq(SessionTable.session_type, filter.type))
    if (filter?.status) conditions.push(eq(SessionTable.session_status, filter.status))
    if (filter?.parentId) conditions.push(eq(SessionTable.parent_session_id, filter.parentId))

    const query = conditions.length > 0
      ? db.select().from(SessionTable).where(and(...conditions))
      : db.select().from(SessionTable)
    return query.all().map(rowToMeta)
  }

  async deleteSession(id: string): Promise<void> {
    const db = getConfig().db
    db.delete(SessionTable).where(eq(SessionTable.id, id)).run()
  }

  // ─── Messages ──────────────────────────────────────────────────────────────
  //
  // Unreachable in practice: nothing in the codebase calls Session.pong()/
  // sessionManager.pong() (the only path that would invoke appendMessage), and
  // nothing calls the adapter's getMessages()/getMessage() directly. Kept as
  // explicit stubs — not deleted — because StorageAdapter requires them and
  // this class's session-lifecycle methods above (createSession..deleteSession,
  // the part of this subsystem that's actually load-bearing) must stay intact.

  async appendMessage(_msg: Message): Promise<void> {
    throw new Error("ProjectflowsStorageAdapter.appendMessage is not implemented (PingPong message persistence is unused)")
  }

  async getMessages(_sessionId: string): Promise<Message[]> {
    return []
  }

  async getMessage(_id: string): Promise<Message | null> {
    return null
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const projectflowsStorageAdapter = new ProjectflowsStorageAdapter()
