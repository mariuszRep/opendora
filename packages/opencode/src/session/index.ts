import { Slug } from "@opencode-ai/util/slug"
import path from "path"
import { Bus } from "@/bus"
import { Decimal } from "decimal.js"
import z from "zod"
import { type ProviderMetadata } from "ai"
import { Config } from "../config/config"
import { Flag } from "../flag/flag"
import { Identifier } from "../id/id"
import { Installation } from "../installation"

import { Database, NotFoundError, eq, and, gte, isNull, desc, like, inArray, lt, sql } from "../storage/db"
import type { SQL } from "../storage/db"
import { SessionTable, MessageTable, PartTable } from "./session.sql"
import { ProjectTable } from "../project/project.sql"
import { Storage } from "@/storage/storage"
import { Log } from "../util/log"
import { MessageV2 } from "./message-v2"
import { Instance } from "../project/instance"
import { SessionPrompt } from "./prompt"
import { fn } from "@/util/fn"
import { Command } from "../command"
import { Snapshot } from "@/snapshot"

import type { Provider } from "@/provider/provider"
import { PermissionNext } from "@/permission/next"
import { Global } from "@/global"
import type { LanguageModelV2Usage } from "@ai-sdk/provider"
import { iife } from "@/util/iife"

import { SessionManager, RetentionDaemon } from "@opendora/session"
import type { SessionType, SessionStatus, RetentionPolicy, SendPolicy, CreateSessionOptions } from "@opendora/session"
import { openDoraStorageAdapter } from "./opendora-storage-adapter"
import { fromRow } from "./from-row"
import { SessionEvents } from "./events"
import { BusBridge } from "./bus-bridge"

// ─── PingPong SessionManager singleton ───────────────────────────────────────

export const sessionManager = new SessionManager(openDoraStorageAdapter)
export const retentionDaemon = new RetentionDaemon()

export namespace Session {
  const log = Log.create({ service: "session" })

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

  export function toRow(info: Info) {
    return {
      id: info.id,
      project_id: info.projectID,
      parent_id: info.parentID,
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
      spawn_depth: info.spawnDepth,
      spawn_parent_session_id: info.spawnParentSessionID,
      spawn_parent_message_id: info.spawnParentMessageID,
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
      parentID: Identifier.schema("session").optional(),
      summary: z
        .object({
          additions: z.number(),
          deletions: z.number(),
          files: z.number(),
          diffs: Snapshot.FileDiff.array().optional(),
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
      permission: PermissionNext.Ruleset.optional(),
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
      spawnDepth: z.number().optional(),
      spawnParentSessionID: z.string().optional(),
      spawnParentMessageID: z.string().optional(),
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

  // Session bus events — sourced from events.ts to avoid circular deps with bus-bridge.ts.
  export const Event = SessionEvents

  export const create = fn(
    z
      .object({
        parentID: Identifier.schema("session").optional(),
        title: z.string().optional(),
        permission: Info.shape.permission,
        sessionType: Info.shape.sessionType,
        agentID: Info.shape.agentID,
        ownerID: Info.shape.ownerID,
        ownerKind: Info.shape.ownerKind,
        retention: Info.shape.retention,
        sendPolicy: Info.shape.sendPolicy,
        spawnDepth: Info.shape.spawnDepth,
        spawnParentSessionID: Info.shape.spawnParentSessionID,
        spawnParentMessageID: Info.shape.spawnParentMessageID,
      })
      .optional(),
    async (input) => {
      return createNext({
        parentID: input?.parentID,
        directory: Instance.directory,
        title: input?.title,
        permission: input?.permission,
        sessionType: input?.sessionType,
        agentID: input?.agentID,
        ownerID: input?.ownerID,
        ownerKind: input?.ownerKind,
        retention: input?.retention,
        sendPolicy: input?.sendPolicy,
        spawnDepth: input?.spawnDepth,
        spawnParentSessionID: input?.spawnParentSessionID,
        spawnParentMessageID: input?.spawnParentMessageID,
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
        directory: Instance.directory,
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
    parentID?: string
    directory: string
    permission?: PermissionNext.Ruleset
    sessionType?: SessionType
    agentID?: string
    ownerID?: string
    ownerKind?: "user" | "agent" | "service"
    retention?: Partial<RetentionPolicy>
    sendPolicy?: SendPolicy
    spawnDepth?: number
    spawnParentSessionID?: string
    spawnParentMessageID?: string
  }) {
    const id = Identifier.descending("session", input.id)
    const slug = Slug.create()
    const now = Date.now()
    const sessionType: SessionType = input.sessionType ?? (input.parentID ? "worker" : "scope")
    const title = input.title ?? createDefaultTitle(!!input.parentID)

    // Pre-register OpenDora-specific fields so the adapter can use them in createSession()
    openDoraStorageAdapter.setCreateContext(id, {
      projectId: Instance.project.id,
      directory: input.directory,
      version: Installation.VERSION,
      slug,
      parentId: input.parentID,
      permission: input.permission,
    })

    const ppOpts: CreateSessionOptions = {
      type: sessionType,
      label: title,
      spawnDepth: input.spawnDepth,
      retention: input.retention,
      sendPolicy: input.sendPolicy,
      agentId: input.agentID,
      ...(input.spawnParentSessionID && {
        parent: { sessionId: input.spawnParentSessionID, messageId: input.spawnParentMessageID },
      }),
    }

    await sessionManager.create(id, ppOpts)
    // SessionManager → adapter.createSession() → DB insert
    // SessionManager → PPBus.publish("session.created") → BusBridge → OpenDora Bus.publish(SessionEvents.Created)

    // Fetch the full row so we return a complete Session.Info (including OpenDora fields)
    const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get())
    if (!row) throw new Error(`Session not found after create: ${id}`)
    const result = fromRow(row)

    log.info("created", { id, sessionType, title })

    // Apply owner fields (not in PingPong's SessionMeta — update directly)
    if (input.ownerID) {
      Database.use((db) => {
        db.update(SessionTable)
          .set({ owner_id: input.ownerID, owner_kind: input.ownerKind ?? "user" })
          .where(eq(SessionTable.id, id))
          .run()
      })
    }

    const cfg = await Config.get()
    if (!input.parentID && (Flag.OPENCODE_AUTO_SHARE || cfg.share === "auto"))
      share(id).catch(() => {})

    return result
  }

  export function plan(input: { slug: string; time: { created: number } }) {
    const base = Instance.project.vcs
      ? path.join(Instance.worktree, ".opencode", "plans")
      : path.join(Global.Path.data, "plans")
    return path.join(base, [input.time.created, input.slug].join("-") + ".md")
  }

  export const get = fn(Identifier.schema("session"), async (id) => {
    const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `Session not found: ${id}` })
    return fromRow(row)
  })

  export const share = fn(Identifier.schema("session"), async (id) => {
    const cfg = await Config.get()
    if (cfg.share === "disabled") {
      throw new Error("Sharing is disabled in configuration")
    }
    const { ShareNext } = await import("@/share/share-next")
    const share = await ShareNext.create(id)
    Database.use((db) => {
      const row = db.update(SessionTable).set({ share_url: share.url }).where(eq(SessionTable.id, id)).returning().get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${id}` })
      const info = fromRow(row)
      Database.effect(() => Bus.publish(Event.Updated, { info }))
    })
    return share
  })

  export const unshare = fn(Identifier.schema("session"), async (id) => {
    // Use ShareNext to remove the share (same as share function uses ShareNext to create)
    const { ShareNext } = await import("@/share/share-next")
    await ShareNext.remove(id)
    Database.use((db) => {
      const row = db.update(SessionTable).set({ share_url: null }).where(eq(SessionTable.id, id)).returning().get()
      if (!row) throw new NotFoundError({ message: `Session not found: ${id}` })
      const info = fromRow(row)
      Database.effect(() => Bus.publish(Event.Updated, { info }))
    })
  })

  export const setTitle = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      title: z.string(),
    }),
    async (input) => {
      return Database.use((db) => {
        const row = db
          .update(SessionTable)
          .set({ title: input.title })
          .where(eq(SessionTable.id, input.sessionID))
          .returning()
          .get()
        if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
        const info = fromRow(row)
        Database.effect(() => Bus.publish(Event.Updated, { info }))
        return info
      })
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
        // Unarchive — reopen brings status back to active
        await sessionManager.reopen(input.sessionID)
      }
      const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get())
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  /** Close a session (PingPong "closed" status — different from archived). */
  export const close = fn(Identifier.schema("session"), async (sessionID) => {
    await sessionManager.close(sessionID)
    const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get())
    if (!row) throw new NotFoundError({ message: `Session not found: ${sessionID}` })
    return fromRow(row)
  })

  /** Reopen a closed or archived session. */
  export const reopen = fn(Identifier.schema("session"), async (sessionID) => {
    await sessionManager.reopen(sessionID)
    const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get())
    if (!row) throw new NotFoundError({ message: `Session not found: ${sessionID}` })
    return fromRow(row)
  })

  export const setPermission = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      permission: PermissionNext.Ruleset,
    }),
    async (input) => {
      return Database.use((db) => {
        const row = db
          .update(SessionTable)
          .set({ permission: input.permission, time_updated: Date.now() })
          .where(eq(SessionTable.id, input.sessionID))
          .returning()
          .get()
        if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
        const info = fromRow(row)
        Database.effect(() => Bus.publish(Event.Updated, { info }))
        return info
      })
    },
  )

  export const setRevert = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      revert: Info.shape.revert,
      summary: Info.shape.summary,
    }),
    async (input) => {
      return Database.use((db) => {
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
        Database.effect(() => Bus.publish(Event.Updated, { info }))
        return info
      })
    },
  )

  export const clearRevert = fn(Identifier.schema("session"), async (sessionID) => {
    return Database.use((db) => {
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
      Database.effect(() => Bus.publish(Event.Updated, { info }))
      return info
    })
  })

  export const setSummary = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      summary: Info.shape.summary,
    }),
    async (input) => {
      return Database.use((db) => {
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
        Database.effect(() => Bus.publish(Event.Updated, { info }))
        return info
      })
    },
  )

  export const diff = fn(Identifier.schema("session"), async (sessionID) => {
    try {
      return await Storage.read<Snapshot.FileDiff[]>(["session_diff", sessionID])
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

  export function* list(input?: {
    directory?: string
    roots?: boolean
    start?: number
    search?: string
    limit?: number
  }) {
    const project = Instance.project
    const conditions = [eq(SessionTable.project_id, project.id)]

    if (input?.directory) {
      conditions.push(eq(SessionTable.directory, input.directory))
    }
    if (input?.roots) {
      conditions.push(isNull(SessionTable.parent_id))
    }
    if (input?.start) {
      conditions.push(gte(SessionTable.time_updated, input.start))
    }
    if (input?.search) {
      conditions.push(like(SessionTable.title, `%${input.search}%`))
    }

    const limit = input?.limit ?? 100

    const rows = Database.use((db) =>
      db
        .select()
        .from(SessionTable)
        .where(and(...conditions))
        .orderBy(desc(SessionTable.time_updated))
        .limit(limit)
        .all(),
    )
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
    const conditions: SQL[] = []

    if (input?.directory) {
      conditions.push(eq(SessionTable.directory, input.directory))
    }
    if (input?.roots) {
      conditions.push(isNull(SessionTable.parent_id))
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

    const rows = Database.use((db) => {
      const query =
        conditions.length > 0
          ? db
              .select()
              .from(SessionTable)
              .where(and(...conditions))
          : db.select().from(SessionTable)
      return query.orderBy(desc(SessionTable.time_updated), desc(SessionTable.id)).limit(limit).all()
    })

    const ids = [...new Set(rows.map((row) => row.project_id))]
    const projects = new Map<string, ProjectInfo>()

    if (ids.length > 0) {
      const items = Database.use((db) =>
        db
          .select({ id: ProjectTable.id, name: ProjectTable.name, worktree: ProjectTable.worktree })
          .from(ProjectTable)
          .where(inArray(ProjectTable.id, ids))
          .all(),
      )
      for (const item of items) {
        projects.set(item.id, {
          id: item.id,
          name: item.name ?? undefined,
          worktree: item.worktree,
        })
      }
    }

    for (const row of rows) {
      const project = projects.get(row.project_id) ?? null
      yield { ...fromRow(row), project }
    }
  }

  export const children = fn(Identifier.schema("session"), async (parentID) => {
    const project = Instance.project
    const rows = Database.use((db) =>
      db
        .select()
        .from(SessionTable)
        .where(and(eq(SessionTable.project_id, project.id), eq(SessionTable.parent_id, parentID)))
        .all(),
    )
    return rows.map(fromRow)
  })

  export const remove = fn(Identifier.schema("session"), async (sessionID) => {
    try {
      const session = await get(sessionID)
      // Recursively remove OpenDora fork-children (parent_id FK, not spawn parent)
      for (const child of (await children(sessionID)) as Info[]) {
        await remove(child.id)
      }
      await unshare(sessionID).catch(() => {})
      // sessionManager.delete() handles DB delete + PingPong Bus event
      // (BusBridge then fires OpenDora Bus.Deleted)
      await sessionManager.delete(sessionID)
    } catch (e) {
      log.error(e)
    }
  })

  // ─── New PingPong-backed helpers ───────────────────────────────────────────

  /** Set the primary responding agent for this session. */
  export const setAgentID = fn(
    z.object({ sessionID: Identifier.schema("session"), agentID: z.string() }),
    async (input) => {
      await sessionManager.update(input.sessionID, { agentId: input.agentID })
      const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get())
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  /** Set the session owner (user or agent). */
  export const setOwner = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      ownerID: z.string(),
      ownerKind: z.enum(["user", "agent", "service"]).default("user"),
    }),
    async (input) => {
      return Database.use((db) => {
        const row = db
          .update(SessionTable)
          .set({ owner_id: input.ownerID, owner_kind: input.ownerKind, time_updated: Date.now() })
          .where(eq(SessionTable.id, input.sessionID))
          .returning()
          .get()
        if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
        const info = fromRow(row)
        Database.effect(() => Bus.publish(Event.Updated, { info }))
        return info
      })
    },
  )

  /** Set the list of agents allowed to participate in this session. */
  export const setAllowedAgents = fn(
    z.object({ sessionID: Identifier.schema("session"), agents: z.array(z.string()) }),
    async (input) => {
      return Database.use((db) => {
        const row = db
          .update(SessionTable)
          .set({ allowed_agents: JSON.stringify(input.agents), time_updated: Date.now() })
          .where(eq(SessionTable.id, input.sessionID))
          .returning()
          .get()
        if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
        const info = fromRow(row)
        Database.effect(() => Bus.publish(Event.Updated, { info }))
        return info
      })
    },
  )

  /** Set actor-level access control for this session. */
  export const setSendPolicy = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      policy: z.object({ allow: z.array(z.string()), deny: z.array(z.string()) }),
    }),
    async (input) => {
      await sessionManager.update(input.sessionID, { sendPolicy: input.policy as SendPolicy })
      const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get())
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  /** Set the retention policy for this session. */
  export const setRetention = fn(
    z.object({ sessionID: Identifier.schema("session"), retention: Info.shape.retention.unwrap() }),
    async (input) => {
      await sessionManager.update(input.sessionID, { retention: input.retention as RetentionPolicy })
      const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get())
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  /** Set the session type (role, scope, worker, scratchpad). */
  export const setSessionType = fn(
    z.object({ sessionID: Identifier.schema("session"), sessionType: z.enum(["role", "scope", "worker", "scratchpad"]) }),
    async (input) => {
      await sessionManager.update(input.sessionID, { type: input.sessionType as SessionType })
      const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get())
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  /** Set the dynamic model override for this session. */
  export const setModel = fn(
    z.object({ sessionID: Identifier.schema("session"), model: z.string() }),
    async (input) => {
      await sessionManager.update(input.sessionID, { model: input.model })
      const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get())
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  /** Set the allowed tool names for this session. */
  export const setToolPolicy = fn(
    z.object({ sessionID: Identifier.schema("session"), tools: z.array(z.string()) }),
    async (input) => {
      await sessionManager.update(input.sessionID, { toolPolicy: input.tools })
      const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get())
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  /** Set the system prompt boundary for this session. */
  export const setSystemPrompt = fn(
    z.object({ sessionID: Identifier.schema("session"), systemPrompt: z.string() }),
    async (input) => {
      await sessionManager.update(input.sessionID, { systemPrompt: input.systemPrompt })
      const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get())
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  /** Accumulate token counts at the session level (called after each LLM stream). */
  export const incrementTokens = fn(
    z.object({
      sessionID: z.string(),
      input: z.number().default(0),
      output: z.number().default(0),
      cacheRead: z.number().default(0),
      cacheWrite: z.number().default(0),
    }),
    async (delta) => {
      Database.use((db) => {
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
      })
    },
  )

  /**
   * Promote a session to be the agent's main (role) session.
   * Demotes the previous main session (if different) to "scope".
   * Also sets the session's agentID if not already set.
   */
  export const promoteToMain = fn(
    z.object({ sessionID: Identifier.schema("session"), agentID: z.string() }),
    async (input) => {
      // Demote any existing role session for this agent (excluding the new one)
      Database.use((db) =>
        db
          .update(SessionTable)
          .set({ session_type: "scope", time_updated: Date.now() })
          .where(
            and(
              eq(SessionTable.project_id, Instance.project.id),
              eq(SessionTable.session_type, "role"),
              eq(SessionTable.agent_id, input.agentID),
            ),
          )
          .run(),
      )
      // Promote the target session: set type to "role" and assign agentID
      Database.use((db) =>
        db
          .update(SessionTable)
          .set({ session_type: "role", agent_id: input.agentID, time_updated: Date.now() })
          .where(eq(SessionTable.id, input.sessionID))
          .run(),
      )
      const row = Database.use((db) =>
        db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get(),
      )
      if (!row) throw new NotFoundError({ message: `Session not found: ${input.sessionID}` })
      return fromRow(row)
    },
  )

  /**
   * Get or create the "role" session for an agent — its permanent home session.
   * Each agent has exactly one role session per project.
   */
  export async function ensureMainSession(agentID: string): Promise<Info> {
    const row = Database.use((db) =>
      db
        .select()
        .from(SessionTable)
        .where(
          and(
            eq(SessionTable.project_id, Instance.project.id),
            eq(SessionTable.session_type, "role"),
            eq(SessionTable.agent_id, agentID),
            isNull(SessionTable.parent_id),
          ),
        )
        .get(),
    )
    if (row) return fromRow(row)

    return createNext({
      directory: Instance.directory,
      title: `${agentID} (main)`,
      sessionType: "role",
      agentID,
      retention: { onExpire: "archive" },
    })
  }

  export const updateMessage = fn(MessageV2.Info, async (msg) => {
    const time_created = msg.time.created
    const { id, sessionID, ...data } = msg
    Database.use((db) => {
      db.insert(MessageTable)
        .values({
          id,
          session_id: sessionID,
          time_created,
          data,
        })
        .onConflictDoUpdate({ target: MessageTable.id, set: { data } })
        .run()
      Database.effect(() =>
        Bus.publish(MessageV2.Event.Updated, {
          info: msg,
        }),
      )
    })
    return msg
  })

  export const removeMessage = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      // CASCADE delete handles parts automatically
      Database.use((db) => {
        db.delete(MessageTable)
          .where(and(eq(MessageTable.id, input.messageID), eq(MessageTable.session_id, input.sessionID)))
          .run()
        Database.effect(() =>
          Bus.publish(MessageV2.Event.Removed, {
            sessionID: input.sessionID,
            messageID: input.messageID,
          }),
        )
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
      Database.use((db) => {
        db.delete(PartTable)
          .where(and(eq(PartTable.id, input.partID), eq(PartTable.session_id, input.sessionID)))
          .run()
        Database.effect(() =>
          Bus.publish(MessageV2.Event.PartRemoved, {
            sessionID: input.sessionID,
            messageID: input.messageID,
            partID: input.partID,
          }),
        )
      })
      return input.partID
    },
  )

  const UpdatePartInput = MessageV2.Part

  export const updatePart = fn(UpdatePartInput, async (part) => {
    const { id, messageID, sessionID, ...data } = part
    const time = Date.now()
    Database.use((db) => {
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
      Database.effect(() =>
        Bus.publish(MessageV2.Event.PartUpdated, {
          part,
        }),
      )
    })
    return part
  })

  export const updatePartDelta = fn(
    z.object({
      sessionID: z.string(),
      messageID: z.string(),
      partID: z.string(),
      field: z.string(),
      delta: z.string(),
    }),
    async (input) => {
      Bus.publish(MessageV2.Event.PartDelta, input)
    },
  )

  export const getUsage = fn(
    z.object({
      model: z.custom<Provider.Model>(),
      usage: z.custom<LanguageModelV2Usage>(),
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

      // OpenRouter provides inputTokens as the total count of input tokens (including cached).
      // AFAIK other providers (OpenRouter/OpenAI/Gemini etc.) do it the same way e.g. vercel/ai#8794 (comment)
      // Anthropic does it differently though - inputTokens doesn't include cached tokens.
      // It looks like OpenCode's cost calculation assumes all providers return inputTokens the same way Anthropic does (I'm guessing getUsage logic was originally implemented with anthropic), so it's causing incorrect cost calculation for OpenRouter and others.
      const excludesCachedTokens = !!(input.metadata?.["anthropic"] || input.metadata?.["bedrock"])
      const adjustedInputTokens = safe(
        excludesCachedTokens ? inputTokens : inputTokens - cacheReadInputTokens - cacheWriteInputTokens,
      )

      const total = iife(() => {
        // Anthropic doesn't provide total_tokens, also ai sdk will vastly undercount if we
        // don't compute from components
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
            // TODO: update models.dev to have better pricing model, for now:
            // charge reasoning tokens at the same rate as output tokens
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
      await SessionPrompt.command({
        sessionID: input.sessionID,
        messageID: input.messageID,
        model: input.providerID + "/" + input.modelID,
        command: Command.Default.INIT,
        arguments: "",
      })
    },
  )
}
