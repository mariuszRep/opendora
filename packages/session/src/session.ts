import { Slug } from "@opendora/util/slug"
import { fn } from "@opendora/util/fn"
import { Identifier } from "@opendora/util/id"
import path from "path"
import { Decimal } from "decimal.js"
import z from "zod"
import { type ProviderMetadata } from "ai"
import { getConfig } from "./config.ts"
import type { SQL } from "drizzle-orm"
import { SessionTable, MessageTable, PartTable, ProjectTable } from "./session.sql.ts"
import { eq, and, gte, isNull, desc, like, inArray, lt, sql } from "drizzle-orm"
import { MessageV2 } from "./message-v2.ts"
import { SessionEvents } from "./events.ts"
import { fromRow } from "./from-row.ts"
import { openDoraStorageAdapter } from "./opendora-storage-adapter.ts"
import { SessionManager } from "./session-manager"
import { RetentionDaemon } from "./daemon"
import type { SessionType, RetentionPolicy, SendPolicy, CreateSessionOptions, PongOptions } from "./types"

// Inline NotFoundError
class NotFoundError extends Error {
  constructor(public readonly data: { message: string }) {
    super(data.message)
    this.name = "NotFoundError"
  }
  static isInstance(e: unknown): e is NotFoundError {
    return e instanceof NotFoundError
  }
}

// Inline iife utility
function iife<T>(fn: () => T): T {
  return fn()
}

const log = { info: console.log, error: console.error, warn: console.warn }

// ─── PingPong SessionManager singleton ───────────────────────────────────────

export const sessionManager = new SessionManager(openDoraStorageAdapter)
export const retentionDaemon = new RetentionDaemon()

export namespace Session {
  const parentTitlePrefix = "New session - "
  const childTitlePrefix = "Child session - "

  function createDefaultTitle(isChild = false) {
    return (isChild ? childTitlePrefix : parentTitlePrefix) + new Date().toISOString()
  }

  export function isDefaultTitle(title: string) {
    return new RegExp(
      `^(${parentTitlePrefix}|${childTitlePrefix})\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`,
    ).test(title)
  }

  async function resolveAgentDefaultPath(agentID?: string): Promise<string | undefined> {
    if (!agentID) return undefined
    const agent = await getConfig().agent?.get?.(agentID)
    return agent?.config?.defaultPaths?.[0] ?? undefined
  }

  export async function effectiveDefaultPath(session: string | Info, seen = new Set<string>()): Promise<string> {
    const info = typeof session === "string" ? await get(session) : session
    if (info.path) return info.path
    if (seen.has(info.id)) return info.directory
    seen.add(info.id)

    const parentID = info.parentSessionID
    if (parentID) {
      const parent = await get(parentID).catch(() => undefined)
      if (parent) return effectiveDefaultPath(parent, seen)
    }

    return (await resolveAgentDefaultPath(info.agentID)) ?? info.directory
  }

  /**
   * Resolve the path and readPath a new child session should inherit from its parent.
   * The parent's stored values are already the effective (narrowed) values,
   * so children simply copy them. Any caller-supplied narrowing is validated
   * to be a sub-path of the parent's value before being used.
   */
  async function resolveInheritedPaths(
    parentSessionID: string | undefined,
    agentID: string | undefined,
    requestedPath: string | undefined,
    requestedReadPath: string | undefined,
  ): Promise<{ path: string | undefined; readPath: string | undefined }> {
    let basePath: string | undefined
    let baseReadPath: string | undefined

    if (parentSessionID) {
      const parent = await get(parentSessionID).catch(() => undefined)
      basePath = parent?.path
      baseReadPath = parent?.readPath
    } else if (agentID) {
      const agent = await getConfig().agent?.get?.(agentID)
      basePath = agent?.config?.defaultPaths?.[0]
    }

    const isSubPath = (candidate: string, base: string) =>
      candidate === base || candidate.startsWith(base + path.sep)

    const resolvedPath = (() => {
      if (!requestedPath) return basePath
      if (!basePath) return requestedPath
      if (!isSubPath(requestedPath, basePath))
        throw new Error(`Requested path "${requestedPath}" is outside the parent scope "${basePath}"`)
      return requestedPath
    })()

    const resolvedReadPath = (() => {
      if (!requestedReadPath) return baseReadPath
      if (!baseReadPath) return requestedReadPath
      if (!isSubPath(requestedReadPath, baseReadPath))
        throw new Error(`Requested readPath "${requestedReadPath}" is outside the parent readPath "${baseReadPath}"`)
      return requestedReadPath
    })()

    return { path: resolvedPath, readPath: resolvedReadPath }
  }

  export function toRow(info: Info) {
    return {
      id: info.id,
      project_id: info.projectID,
      slug: info.slug,
      directory: info.directory,
      title: info.title,
      version: info.version,
      share_url: info.share?.url,
      summary_additions: info.summary?.additions,
      summary_deletions: info.summary?.deletions,
      summary_files: info.summary?.files,
      summary_diffs: info.summary?.diffs,
      revert: info.revert ?? null,
      permission: info.permission,
      time_created: info.time.created,
      time_updated: info.time.updated,
      time_compacting: info.time.compacting,
      time_archived: info.time.archived,
      // PingPong fields
      session_type: info.sessionType,
      session_status: info.sessionStatus,
      agent_id: info.agentID,
      owner_id: info.ownerID,
      owner_kind: info.ownerKind,
      allowed_agents: info.allowedAgents ? JSON.stringify(info.allowedAgents) : undefined,
      send_policy: info.sendPolicy ? JSON.stringify(info.sendPolicy) : undefined,
      retention: info.retention ? JSON.stringify(info.retention) : undefined,
      path: info.path ?? undefined,
      read_path: info.readPath ?? undefined,
      spawn_depth: info.spawnDepth,
      parent_session_id: info.parentSessionID,
      reply_to_session_id: info.replyToSessionID,
      input_tokens: info.tokens?.input,
      output_tokens: info.tokens?.output,
      cache_read_tokens: info.tokens?.cacheRead,
      cache_write_tokens: info.tokens?.cacheWrite,
      compaction_count: info.tokens?.compactionCount,
    }
  }

  function getForkedTitle(title: string): string {
    const match = title.match(/^(.+) \(fork #(\d+)\)$/)
    if (match) {
      const base = match[1]
      const num = parseInt(match[2], 10)
      return `${base} (fork #${num + 1})`
    }
    return `${title} (fork #1)`
  }

  const SessionTypeSchema = z.enum(["role", "scope", "worker", "scratchpad"])
  const SessionStatusSchema = z.enum(["active", "archived", "closed"])

  export const Info = z
    .object({
      id: Identifier.schema("session"),
      slug: z.string(),
      projectID: z.string(),
      directory: z.string(),
      summary: z
        .object({
          additions: z.number(),
          deletions: z.number(),
          files: z.number(),
          diffs: z.any().array().optional(),
        })
        .optional(),
      share: z
        .object({
          url: z.string(),
        })
        .optional(),
      title: z.string(),
      version: z.string(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
        compacting: z.number().optional(),
        archived: z.number().optional(),
      }),
      permission: z.any().optional(),
      revert: z
        .object({
          messageID: z.string(),
          partID: z.string().optional(),
          snapshot: z.string().optional(),
          diff: z.string().optional(),
        })
        .optional(),
      // ─── PingPong fields ─────────────────────────────────────────────────
      sessionType: SessionTypeSchema.optional(),
      sessionStatus: SessionStatusSchema.optional(),
      agentID: z.string().optional(),
      ownerID: z.string().optional(),
      ownerKind: z.enum(["user", "agent", "service"]).optional(),
      allowedAgents: z.array(z.string()).optional(),
      sendPolicy: z.object({ allow: z.array(z.string()), deny: z.array(z.string()) }).optional(),
      retention: z
        .object({
          autoArchive: z.boolean().optional(),
          autoDelete: z.boolean().optional(),
          ttlMs: z.number().optional(),
          maxMessages: z.number().optional(),
          maxAgeDays: z.number().optional(),
          onExpire: z.enum(["archive", "close", "delete"]).optional(),
        })
        .optional(),
      path: z.string().optional(),
      readPath: z.string().optional(),
      spawnDepth: z.number().optional(),
      parentSessionID: z.string().optional(),
      replyToSessionID: z.string().optional(),
      tokens: z
        .object({
          input: z.number(),
          output: z.number(),
          cacheRead: z.number(),
          cacheWrite: z.number(),
          compactionCount: z.number(),
        })
        .optional(),
    })
    .meta({
      ref: "Session",
    })
  export type Info = z.output<typeof Info>

  export const ProjectInfo = z
    .object({
      id: z.string(),
      name: z.string().optional(),
      worktree: z.string(),
    })
    .meta({
      ref: "ProjectSummary",
    })
  export type ProjectInfo = z.output<typeof ProjectInfo>

  export const GlobalInfo = Info.extend({
    project: ProjectInfo.nullable(),
  }).meta({
    ref: "GlobalSession",
  })
  export type GlobalInfo = z.output<typeof GlobalInfo>

  // Session bus events
  export const Event = SessionEvents

  export const create = fn(
    z
      .object({
        title: z.string().optional(),
        directory: z.string().optional(),
        permission: Info.shape.permission,
        sessionType: Info.shape.sessionType,
        agentID: Info.shape.agentID,
        ownerID: Info.shape.ownerID,
        ownerKind: Info.shape.ownerKind,
        retention: Info.shape.retention,
        sendPolicy: Info.shape.sendPolicy,
        spawnDepth: Info.shape.spawnDepth,
        parentSessionID: Info.shape.parentSessionID,
        replyToSessionID: Info.shape.replyToSessionID,
        path: Info.shape.path,
        readPath: Info.shape.readPath,
      })
      .optional(),
    async (input) => {
      const cfg = getConfig()
      const { path: resolvedPath, readPath: resolvedReadPath } = await resolveInheritedPaths(
        input?.parentSessionID,
        input?.agentID,
        input?.path,
        input?.readPath,
      )
      const directory = input?.directory ?? resolvedPath ?? cfg.instance?.directory ?? process.cwd()
      return createNext({
        directory,
        title: input?.title,
        permission: input?.permission,
        sessionType: input?.sessionType,
        agentID: input?.agentID,
        ownerID: input?.ownerID,
        ownerKind: input?.ownerKind,
        retention: input?.retention,
        sendPolicy: input?.sendPolicy,
        spawnDepth: input?.spawnDepth,
        parentSessionID: input?.parentSessionID,
        replyToSessionID: input?.replyToSessionID,
        path: resolvedPath,
        readPath: resolvedReadPath,
      })
    },
  )

  export const fork = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message").optional(),
    }),
    async (input) => {
      const original = await get(input.sessionID)
      if (!original) throw new Error("session not found")
      const title = getForkedTitle(original.title)
      const session = await createNext({
        directory: await effectiveDefaultPath(original).catch(() => original.directory),
        title,
      })
      const msgs = await messages({ sessionID: input.sessionID })
      const idMap = new Map<string, string>()

      for (const msg of msgs) {
        if (input.messageID && msg.info.id >= input.messageID) break
        const newID = Identifier.ascending("message")
        idMap.set(msg.info.id, newID)

        const parentID = msg.info.role === "assistant" && msg.info.parentID ? idMap.get(msg.info.parentID) : undefined
        const cloned = await updateMessage({
          ...msg.info,
          sessionID: session.id,
          id: newID,
          ...(parentID && { parentID }),
        })

        for (const part of msg.parts) {
          await updatePart({
            ...part,
            id: Identifier.ascending("part"),
            messageID: cloned.id,
            sessionID: session.id,
          })
        }
      }
      return session
    },
  )

  export const touch = fn(Identifier.schema("session"), async (sessionID) => {
    await sessionManager.update(sessionID, { updatedAt: Date.now() })
  })

  export async function createNext(input: {
    id?: string
    title?: string
    directory: string
    permission?: any
    sessionType?: SessionType
    agentID?: string
    ownerID?: string
    ownerKind?: "user" | "agent" | "service"
    retention?: Partial<RetentionPolicy>
    sendPolicy?: SendPolicy
    spawnDepth?: number
    parentSessionID?: string
    replyToSessionID?: string
    path?: string
    readPath?: string
  }) {
    const cfg = getConfig()
    const id = Identifier.descending("session", input.id)
    const slug = Slug.create()
    const sessionType: SessionType = input.sessionType ?? (input.parentSessionID ? "worker" : "scope")
    const title = input.title ?? createDefaultTitle(!!input.parentSessionID)

    // Pre-register OpenDora-specific fields
    openDoraStorageAdapter.setCreateContext(id, {
      projectId: cfg.instance?.project?.id ?? "unknown",
      directory: input.directory,
      version: cfg.installationVersion ?? "local",
      slug,
      permission: input.permission,
    })

    const ppOpts: CreateSessionOptions = {
      type: sessionType,
      label: title,
      spawnDepth: input.spawnDepth,
      retention: input.retention,
      sendPolicy: input.sendPolicy,
      agentId: input.agentID,
      ...(input.parentSessionID && {
        parent: { sessionId: input.parentSessionID },
      }),
      path: input.path,
      readPath: input.readPath,
    }

    await sessionManager.create(id, ppOpts)

    const db = cfg.db
    const row = db.select().from(SessionTable).where(eq(SessionTable.id, id)).get()
    if (!row) throw new Error(`Session not found after create: ${id}`)
    const result = fromRow(row)

    log.info("[session] created", id, sessionType, title)

    // Apply owner + reply_to fields
    const extraFields: Record<string, any> = {}
    if (input.ownerID) {
      extraFields.owner_id = input.ownerID
      extraFields.owner_kind = input.ownerKind ?? "user"
    }
    if (input.replyToSessionID) {
      extraFields.reply_to_session_id = input.replyToSessionID
    }
    if (Object.keys(extraFields).length > 0) {
      db.update(SessionTable).set(extraFields).where(eq(SessionTable.id, id)).run()
    }

    const config = await cfg.config?.get() ?? {}
    if (!input.parentID && (process.env.OPENCODE_AUTO_SHARE || config.share === "auto"))
      share(id).catch(() => {})

    return result
  }

  export function plan(input: { slug: string; time: { created: number } }) {
    const cfg = getConfig()
    const instance = cfg.instance
    if (instance?.project?.vcs) {
      return path.join(instance.worktree, ".opencode", "plans", [input.time.created, input.slug].join("-") + ".md")
    }
    return path.join(cfg.dataPath, "plans", [input.time.created, input.slug].join("-") + ".md")
  }

  export const get = fn(Identifier.schema("session"), async (id) => {
    const db = getConfig().db
    const row = db.select().from(SessionTable).where(eq(SessionTable.id, id)).get()
    if (!row) throw new NotFoundError({ message: `Session not found: ${id}` })
    return fromRow(row)
  })

  export const share = fn(Identifier.schema("session"), async (id) => {
    const cfg = getConfig()
    const config = await cfg.config?.get() ?? {}
    if (config.share === "disabled") {
      throw new Error("Sharing is disabled in configuration")
    }
    const { ShareNext } = await import("@/share/share-next")
    const s = await ShareNext.create(id)
    const db = cfg.db
    const row = db.update(SessionTable).set({ share_url: s.url }).where(eq(SessionTable.id, id)).returning().get()
    if (!row) throw new NotFoundError({ message: `Session not found: ${id}` })
    const info = fromRow(row)
    cfg.bus?.publish(Event.Updated, { info })
    return s
  })

  export const unshare = fn(Identifier.schema("session"), async (id) => {
    const cfg = getConfig()
    const { ShareNext } = await import("@/share/share-next")
    await ShareNext.remove(id)
    const db = cfg.db
    const row = db.update(SessionTable).set({ share_url: null }).where(eq(SessionTable.id, id)).returning().get()
    if (!row) throw new NotFoundError({ message: `Session not found: ${id}` })
    const info = fromRow(row)
    cfg.bus?.publish(Event.Updated, { info })
  })

  export const setTitle = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      title: z.string(),
    }),
    async (input) => {
      const db = getConfig().db
      const row = db
        .update(SessionTable)
        .set({ title: input.title })
        .where(eq(SessionTable.id, input.sessionID))
        .returning()
        .get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      const info = fromRow(row)
      getConfig().bus?.publish(Event.Updated, { info })
      return info
    },
  )

  export const setReplyToSessionID = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      replyToSessionID: z.string(),
    }),
    async (input) => {
      const db = getConfig().db
      const row = db
        .update(SessionTable)
        .set({ reply_to_session_id: input.replyToSessionID })
        .where(eq(SessionTable.id, input.sessionID))
        .returning()
        .get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      const info = fromRow(row)
      getConfig().bus?.publish(Event.Updated, { info })
      return info
    },
  )

  export const setArchived = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      time: z.number().optional(),
    }),
    async (input) => {
      if (input.time) {
        await sessionManager.archive(input.sessionID)
      } else {
        await sessionManager.reopen(input.sessionID)
      }
      const db = getConfig().db
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  export const close = fn(Identifier.schema("session"), async (sessionID) => {
    await sessionManager.close(sessionID)
    const db = getConfig().db
    const row = db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get()
    if (!row) throw new NotFoundError({ message: `Session not found: ${sessionID}` })
    return fromRow(row)
  })

  export const reopen = fn(Identifier.schema("session"), async (sessionID) => {
    await sessionManager.reopen(sessionID)
    const db = getConfig().db
    const row = db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get()
    if (!row) throw new NotFoundError({ message: `Session not found: ${sessionID}` })
    return fromRow(row)
  })

  export const setPermission = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      permission: z.any(),
    }),
    async (input) => {
      const db = getConfig().db
      const row = db
        .update(SessionTable)
        .set({ permission: input.permission, time_updated: Date.now() })
        .where(eq(SessionTable.id, input.sessionID))
        .returning()
        .get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      const info = fromRow(row)
      getConfig().bus?.publish(Event.Updated, { info })
      return info
    },
  )

  export const setRevert = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      revert: Info.shape.revert,
      summary: Info.shape.summary,
    }),
    async (input) => {
      const db = getConfig().db
      const row = db
        .update(SessionTable)
        .set({
          revert: input.revert ?? null,
          summary_additions: input.summary?.additions,
          summary_deletions: input.summary?.deletions,
          summary_files: input.summary?.files,
          time_updated: Date.now(),
        })
        .where(eq(SessionTable.id, input.sessionID))
        .returning()
        .get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      const info = fromRow(row)
      getConfig().bus?.publish(Event.Updated, { info })
      return info
    },
  )

  export const clearRevert = fn(Identifier.schema("session"), async (sessionID) => {
    const db = getConfig().db
    const row = db
      .update(SessionTable)
      .set({
        revert: null,
        time_updated: Date.now(),
      })
      .where(eq(SessionTable.id, sessionID))
      .returning()
      .get()
    if (!row) throw new NotFoundError({ message: `Session not found: ${sessionID}` })
    const info = fromRow(row)
    getConfig().bus?.publish(Event.Updated, { info })
    return info
  })

  export const setSummary = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      summary: Info.shape.summary,
    }),
    async (input) => {
      const db = getConfig().db
      const row = db
        .update(SessionTable)
        .set({
          summary_additions: input.summary?.additions,
          summary_deletions: input.summary?.deletions,
          summary_files: input.summary?.files,
          time_updated: Date.now(),
        })
        .where(eq(SessionTable.id, input.sessionID))
        .returning()
        .get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      const info = fromRow(row)
      getConfig().bus?.publish(Event.Updated, { info })
      return info
    },
  )

  export const diff = fn(Identifier.schema("session"), async (sessionID) => {
    try {
      return await getConfig().storage?.read<any[]>(["session_diff", sessionID]) ?? []
    } catch {
      return []
    }
  })

  export const messages = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      limit: z.number().optional(),
    }),
    async (input) => {
      const result = [] as MessageV2.WithParts[]
      for await (const msg of MessageV2.stream(input.sessionID)) {
        if (input.limit && result.length >= input.limit) break
        result.push(msg)
      }
      result.reverse()
      return result
    },
  )

  /** Look up a message by its ID alone — returns the message row including its session_id. */
  export const getMessage = fn(
    Identifier.schema("message"),
    async (messageID) => {
      const cfg = getConfig()
      const db = cfg.db
      const row = db
        .select()
        .from(MessageTable)
        .where(eq(MessageTable.id, messageID))
        .get()
      return row ?? null
    },
  )

  export function* list(input?: {
    directory?: string
    roots?: boolean
    start?: number
    search?: string
    limit?: number
  }) {
    const cfg = getConfig()
    const project = cfg.instance?.project
    const conditions: any[] = project ? [eq(SessionTable.project_id, project.id)] : []

    if (input?.directory) {
      conditions.push(eq(SessionTable.directory, input.directory))
    }
    if (input?.roots) {
      conditions.push(isNull(SessionTable.parent_session_id))
    }
    if (input?.start) {
      conditions.push(gte(SessionTable.time_updated, input.start))
    }
    if (input?.search) {
      conditions.push(like(SessionTable.title, `%${input.search}%`))
    }

    const limit = input?.limit ?? 100

    const db = cfg.db
    const rows = db
      .select()
      .from(SessionTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(SessionTable.time_updated))
      .limit(limit)
      .all()
    for (const row of rows) {
      yield fromRow(row)
    }
  }

  export function* listGlobal(input?: {
    directory?: string
    roots?: boolean
    start?: number
    cursor?: number
    search?: string
    limit?: number
    archived?: boolean
  }) {
    const cfg = getConfig()
    const conditions: SQL[] = []

    if (input?.directory) {
      conditions.push(eq(SessionTable.directory, input.directory))
    }
    if (input?.roots) {
      conditions.push(isNull(SessionTable.parent_session_id))
    }
    if (input?.start) {
      conditions.push(gte(SessionTable.time_updated, input.start))
    }
    if (input?.cursor) {
      conditions.push(lt(SessionTable.time_updated, input.cursor))
    }
    if (input?.search) {
      conditions.push(like(SessionTable.title, `%${input.search}%`))
    }
    if (!input?.archived) {
      conditions.push(isNull(SessionTable.time_archived))
    }

    const limit = input?.limit ?? 100

    const db = cfg.db
    const rows = db
      .select()
      .from(SessionTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(SessionTable.time_updated), desc(SessionTable.id))
      .limit(limit)
      .all()

    const ids = [...new Set(rows.map((row: any) => row.project_id))]
    const projects = new Map<string, ProjectInfo>()

    if (ids.length > 0) {
      const items = db
        .select({ id: ProjectTable.id, name: ProjectTable.name, worktree: ProjectTable.worktree })
        .from(ProjectTable)
        .where(inArray(ProjectTable.id, ids as string[]))
        .all()
      for (const item of items) {
        projects.set(item.id, {
          id: item.id,
          name: item.name ?? undefined,
          worktree: item.worktree,
        })
      }
    }

    for (const row of rows) {
      const project = projects.get((row as any).project_id) ?? null
      yield { ...fromRow(row), project }
    }
  }

  export const children = fn(Identifier.schema("session"), async (parentID) => {
    const cfg = getConfig()
    const project = cfg.instance?.project
    const db = cfg.db
    const conditions: any[] = [eq(SessionTable.parent_session_id, parentID)]
    if (project) conditions.unshift(eq(SessionTable.project_id, project.id))
    const rows = db
      .select()
      .from(SessionTable)
      .where(and(...conditions))
      .all()
    return rows.map(fromRow)
  })

  export const remove = fn(Identifier.schema("session"), async (sessionID) => {
    try {
      await get(sessionID)
      for (const child of (await children(sessionID)) as Info[]) {
        await remove(child.id)
      }
      await unshare(sessionID).catch(() => {})
      await sessionManager.delete(sessionID)
    } catch (e) {
      log.error("[session] remove error:", e)
    }
  })

  export const setAgentID = fn(
    z.object({ sessionID: Identifier.schema("session"), agentID: z.string() }),
    async (input) => {
      await sessionManager.update(input.sessionID, { agentId: input.agentID })
      const db = getConfig().db
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  export const setOwner = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      ownerID: z.string(),
      ownerKind: z.enum(["user", "agent", "service"]).default("user"),
    }),
    async (input) => {
      const db = getConfig().db
      const row = db
        .update(SessionTable)
        .set({ owner_id: input.ownerID, owner_kind: input.ownerKind, time_updated: Date.now() })
        .where(eq(SessionTable.id, input.sessionID))
        .returning()
        .get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      const info = fromRow(row)
      getConfig().bus?.publish(Event.Updated, { info })
      return info
    },
  )

  export const setAllowedAgents = fn(
    z.object({ sessionID: Identifier.schema("session"), agents: z.array(z.string()) }),
    async (input) => {
      const db = getConfig().db
      const row = db
        .update(SessionTable)
        .set({ allowed_agents: JSON.stringify(input.agents), time_updated: Date.now() })
        .where(eq(SessionTable.id, input.sessionID))
        .returning()
        .get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      const info = fromRow(row)
      getConfig().bus?.publish(Event.Updated, { info })
      return info
    },
  )

  export const setSendPolicy = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      policy: z.object({ allow: z.array(z.string()), deny: z.array(z.string()) }),
    }),
    async (input) => {
      await sessionManager.update(input.sessionID, { sendPolicy: input.policy as SendPolicy })
      const db = getConfig().db
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  export const setRetention = fn(
    z.object({ sessionID: Identifier.schema("session"), retention: Info.shape.retention.unwrap() }),
    async (input) => {
      await sessionManager.update(input.sessionID, { retention: input.retention as RetentionPolicy })
      const db = getConfig().db
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  export const setSessionType = fn(
    z.object({ sessionID: Identifier.schema("session"), sessionType: z.enum(["role", "scope", "worker", "scratchpad"]) }),
    async (input) => {
      await sessionManager.update(input.sessionID, { type: input.sessionType as SessionType })
      const db = getConfig().db
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  export const setSessionStatus = fn(
    z.object({ 
      sessionID: Identifier.schema("session"), 
      status: z.enum(["active", "archived", "closed", "waiting"])
    }),
    async (input) => {
      await sessionManager.update(input.sessionID, { status: input.status as SessionStatus })
      const db = getConfig().db
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      const info = fromRow(row)
      getConfig().bus?.publish(Event.Updated, { info })
      return info
    },
  )

  export const setSystemPrompt = fn(
    z.object({ sessionID: Identifier.schema("session"), systemPrompt: z.string() }),
    async (input) => {
      await sessionManager.update(input.sessionID, { systemPrompt: input.systemPrompt })
      const db = getConfig().db
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  export const setPath = fn(
    z.object({ sessionID: Identifier.schema("session"), path: z.string().nullable() }),
    async (input) => {
      await sessionManager.update(input.sessionID, { path: input.path ?? undefined })
      const db = getConfig().db
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  export const setReadPath = fn(
    z.object({ sessionID: Identifier.schema("session"), readPath: z.string().nullable() }),
    async (input) => {
      await sessionManager.update(input.sessionID, { readPath: input.readPath ?? undefined })
      const db = getConfig().db
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  export const incrementTokens = fn(
    z.object({
      sessionID: z.string(),
      input: z.number().default(0),
      output: z.number().default(0),
      cacheRead: z.number().default(0),
      cacheWrite: z.number().default(0),
    }),
    async (delta) => {
      const db = getConfig().db
      db.update(SessionTable)
        .set({
          input_tokens: sql`COALESCE(${SessionTable.input_tokens}, 0) + ${delta.input}`,
          output_tokens: sql`COALESCE(${SessionTable.output_tokens}, 0) + ${delta.output}`,
          cache_read_tokens: sql`COALESCE(${SessionTable.cache_read_tokens}, 0) + ${delta.cacheRead}`,
          cache_write_tokens: sql`COALESCE(${SessionTable.cache_write_tokens}, 0) + ${delta.cacheWrite}`,
          time_updated: Date.now(),
        })
        .where(eq(SessionTable.id, delta.sessionID))
        .run()
    },
  )

  export const promoteToMain = fn(
    z.object({ sessionID: Identifier.schema("session"), agentID: z.string() }),
    async (input) => {
      const cfg = getConfig()
      const project = cfg.instance?.project
      const db = cfg.db
      if (project) {
        db.update(SessionTable)
          .set({ session_type: "scope", time_updated: Date.now() })
          .where(
            and(
              eq(SessionTable.project_id, project.id),
              eq(SessionTable.session_type, "role"),
              eq(SessionTable.agent_id, input.agentID),
            ),
          )
          .run()
      }
      db.update(SessionTable)
        .set({ session_type: "role", agent_id: input.agentID, time_updated: Date.now() })
        .where(eq(SessionTable.id, input.sessionID))
        .run()
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  export async function ensureMainSession(agentID: string): Promise<Info> {
    const cfg = getConfig()
    const project = cfg.instance?.project
    const db = cfg.db
    if (project) {
      const row = db
        .select()
        .from(SessionTable)
        .where(
          and(
            eq(SessionTable.project_id, project.id),
            eq(SessionTable.session_type, "role"),
            eq(SessionTable.agent_id, agentID),
            isNull(SessionTable.parent_session_id),
          ),
        )
        .get()
      if (row) return fromRow(row)
    }

    const agentDefaultPath = await resolveAgentDefaultPath(agentID)
    return createNext({
      directory: agentDefaultPath ?? cfg.instance?.directory ?? process.cwd(),
      title: `${agentID} (main)`,
      sessionType: "role",
      agentID,
      retention: { onExpire: "archive" },
    })
  }

  export async function pong(sessionID: string, opts: PongOptions): Promise<void> {
    await sessionManager.pong(sessionID, opts)
  }

  export const reply = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      agentID: z.string(),
      message: z.string(),
      parentMessageID: Identifier.schema("message").optional(),
    }),
    async (input) => {
      const cfg = getConfig()
      const agent = await cfg.agent?.get?.(input.agentID)
      const fallbackAgent = input.sessionID ? await get(input.sessionID).catch(() => undefined) : undefined
      const fallbackModel =
        fallbackAgent?.agentID ? await cfg.agent?.get?.(fallbackAgent.agentID).then((x: any) => x?.model).catch(() => undefined) : undefined
      const model = agent?.model ?? fallbackModel ?? { providerID: "system", modelID: "reply" }
      const now = Date.now()
      const cwd = await effectiveDefaultPath(input.sessionID)
      const root = cfg.instance?.worktree ?? process.cwd()

      const msg: MessageV2.Assistant = {
        id: Identifier.ascending("message"),
        sessionID: input.sessionID,
        parentID: input.parentMessageID,
        role: "assistant",
        from: { kind: "agent", id: input.agentID },
        mode: input.agentID,
        agent: input.agentID,
        path: {
          cwd,
          root,
        },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        modelID: model.modelID,
        providerID: model.providerID,
        time: {
          created: now,
          completed: now,
        },
      }

      await updateMessage(msg, input.parentMessageID)
      await updatePart({
        type: "text",
        id: Identifier.ascending("part"),
        messageID: msg.id,
        sessionID: input.sessionID,
        text: input.message,
      })
      await touch(input.sessionID)
      return msg
    },
  )

  export async function updateMessage(msg: MessageV2.Info, parentMessageID?: string): Promise<MessageV2.Info> {
    const cfg = getConfig()
    const db = cfg.db
    const { id, sessionID, ...data } = msg
    const time_created = msg.time.created
    const parent_message_id = parentMessageID ?? null
    db.insert(MessageTable)
      .values({
        id,
        session_id: sessionID,
        time_created,
        parent_message_id,
        data,
      })
      .onConflictDoUpdate({ target: MessageTable.id, set: { data } })
      .run()
    // Re-attach parentMessageID and parentSessionID for SSE consumers so the UI can show
    // delegation attribution and the "Back to source" link without a round-trip.
    let infoForBus: MessageV2.Info = msg
    if (parent_message_id) {
      const parentRow = db
        .select({ session_id: MessageTable.session_id })
        .from(MessageTable)
        .where(eq(MessageTable.id, parent_message_id))
        .get()
      infoForBus = {
        ...msg,
        parentMessageID: parent_message_id,
        ...(parentRow ? { parentSessionID: parentRow.session_id } : {}),
      } as MessageV2.Info
    }
    cfg.bus?.publish(MessageV2.Event.Updated, { info: infoForBus })
    return msg
  }

  export const removeMessage = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      const cfg = getConfig()
      const db = cfg.db
      db.delete(MessageTable)
        .where(and(eq(MessageTable.id, input.messageID), eq(MessageTable.session_id, input.sessionID)))
        .run()
      cfg.bus?.publish(MessageV2.Event.Removed, {
        sessionID: input.sessionID,
        messageID: input.messageID,
      })
      return input.messageID
    },
  )

  export const removePart = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
      partID: Identifier.schema("part"),
    }),
    async (input) => {
      const cfg = getConfig()
      const db = cfg.db
      db.delete(PartTable)
        .where(and(eq(PartTable.id, input.partID), eq(PartTable.session_id, input.sessionID)))
        .run()
      cfg.bus?.publish(MessageV2.Event.PartRemoved, {
        sessionID: input.sessionID,
        messageID: input.messageID,
        partID: input.partID,
      })
      return input.partID
    },
  )

  const UpdatePartInput = MessageV2.Part

  export const updatePart = fn(UpdatePartInput, async (part) => {
    const cfg = getConfig()
    const db = cfg.db
    const { id, messageID, sessionID, ...data } = part
    const time = Date.now()
    db.insert(PartTable)
      .values({
        id,
        message_id: messageID,
        session_id: sessionID,
        time_created: time,
        data,
      })
      .onConflictDoUpdate({ target: PartTable.id, set: { data } })
      .run()
    cfg.bus?.publish(MessageV2.Event.PartUpdated, { part })
    return part
  })

  /**
   * Reconcile tool parts left in "pending" or "running" state from a prior
   * process that was terminated mid-stream (server restart, crash, kill).
   * These orphaned parts would otherwise block the UI indefinitely — the user
   * sees a tool card stuck on "Pending" / "Running" with no way to approve,
   * dismiss, or retry, because no stream is active to emit further events.
   *
   * Marks each orphaned tool part as "error" and publishes PartUpdated so any
   * connected clients refresh their view. Idempotent: safe to call on every
   * server start.
   */
  export async function reconcileInterruptedToolParts(): Promise<number> {
    const cfg = getConfig()
    const db = cfg.db
    if (!db) return 0

    // json_extract is SQLite-native; Drizzle exposes it through sql``.
    const rows = db
      .select()
      .from(PartTable)
      .where(
        and(
          sql`json_extract(${PartTable.data}, '$.type') = 'tool'`,
          inArray(
            sql`json_extract(${PartTable.data}, '$.state.status')`,
            ["pending", "running"],
          ),
        ),
      )
      .all()

    if (rows.length === 0) return 0

    const now = Date.now()
    let count = 0
    for (const row of rows) {
      const data = row.data as any
      if (!data || data.type !== "tool") continue
      const prevState = data.state ?? {}
      const startTime =
        (prevState.time && typeof prevState.time.start === "number")
          ? prevState.time.start
          : now
      const next = {
        id: row.id,
        messageID: row.message_id,
        sessionID: row.session_id,
        type: "tool" as const,
        callID: data.callID,
        tool: data.tool,
        metadata: data.metadata,
        state: {
          status: "error" as const,
          input: prevState.input ?? {},
          error: "Tool execution interrupted (server restarted)",
          time: { start: startTime, end: now },
        },
      }
      try {
        await updatePart(next as any)
        count++
      } catch (err) {
        log.warn("reconcileInterruptedToolParts: failed to update part", {
          id: row.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    if (count > 0) log.info(`reconcileInterruptedToolParts: recovered ${count} orphaned tool part(s)`)
    return count
  }

  export const updatePartDelta = fn(
    z.object({
      sessionID: z.string(),
      messageID: z.string(),
      partID: z.string(),
      field: z.string(),
      delta: z.string(),
    }),
    async (input) => {
      getConfig().bus?.publish(MessageV2.Event.PartDelta, input)
    },
  )

  export const getUsage = fn(
    z.object({
      model: z.custom<any>(),
      usage: z.custom<any>(),
      metadata: z.custom<ProviderMetadata>().optional(),
    }),
    (input) => {
      const safe = (value: number) => {
        if (!Number.isFinite(value)) return 0
        return value
      }
      const inputTokens = safe(input.usage.inputTokens ?? 0)
      const outputTokens = safe(input.usage.outputTokens ?? 0)
      const reasoningTokens = safe(input.usage.reasoningTokens ?? 0)

      const cacheReadInputTokens = safe(input.usage.cachedInputTokens ?? 0)
      const cacheWriteInputTokens = safe(
        (input.metadata?.["anthropic"]?.["cacheCreationInputTokens"] ??
          // @ts-expect-error
          input.metadata?.["bedrock"]?.["usage"]?.["cacheWriteInputTokens"] ??
          // @ts-expect-error
          input.metadata?.["venice"]?.["usage"]?.["cacheCreationInputTokens"] ??
          0) as number,
      )

      const excludesCachedTokens = !!(input.metadata?.["anthropic"] || input.metadata?.["bedrock"])
      const adjustedInputTokens = safe(
        excludesCachedTokens ? inputTokens : inputTokens - cacheReadInputTokens - cacheWriteInputTokens,
      )

      const total = iife(() => {
        if (
          input.model.api.npm === "@ai-sdk/anthropic" ||
          input.model.api.npm === "@ai-sdk/amazon-bedrock" ||
          input.model.api.npm === "@ai-sdk/google-vertex/anthropic"
        ) {
          return adjustedInputTokens + outputTokens + cacheReadInputTokens + cacheWriteInputTokens
        }
        return input.usage.totalTokens
      })

      const tokens = {
        total,
        input: adjustedInputTokens,
        output: outputTokens,
        reasoning: reasoningTokens,
        cache: {
          write: cacheWriteInputTokens,
          read: cacheReadInputTokens,
        },
      }

      const costInfo =
        input.model.cost?.experimentalOver200K && tokens.input + tokens.cache.read > 200_000
          ? input.model.cost.experimentalOver200K
          : input.model.cost
      return {
        cost: safe(
          new Decimal(0)
            .add(new Decimal(tokens.input).mul(costInfo?.input ?? 0).div(1_000_000))
            .add(new Decimal(tokens.output).mul(costInfo?.output ?? 0).div(1_000_000))
            .add(new Decimal(tokens.cache.read).mul(costInfo?.cache?.read ?? 0).div(1_000_000))
            .add(new Decimal(tokens.cache.write).mul(costInfo?.cache?.write ?? 0).div(1_000_000))
            .add(new Decimal(tokens.reasoning).mul(costInfo?.output ?? 0).div(1_000_000))
            .toNumber(),
        ),
        tokens,
      }
    },
  )

  export class BusyError extends Error {
    constructor(public readonly sessionID: string) {
      super(`Session ${sessionID} is busy`)
    }
  }

  export const initialize = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      modelID: z.string(),
      providerID: z.string(),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      const cfg = getConfig()
      await cfg.sessionPrompt?.command({
        sessionID: input.sessionID,
        messageID: input.messageID,
        model: input.providerID + "/" + input.modelID,
        command: cfg.commandInit ?? "init",
        arguments: "",
      })
    },
  )
}
