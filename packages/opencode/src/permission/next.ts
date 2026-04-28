import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Identifier } from "@/id/id"
import { Instance } from "@/project/instance"
import { Database, eq } from "@/storage/db"
import { PermissionTable } from "@opendora/session/sql"
import { fn } from "@/util/fn"
import { Log } from "@/util/log"
import z from "zod"
import { Wildcard } from "@/util/wildcard"
import { Permission } from "@opendora/permission"
import { Plugin } from "@/plugin"

export namespace PermissionNext {
  const log = Log.create({ service: "permission" })

  // Re-export pure types and functions from @opendora/permission
  export import Action = Permission.Action
  export import Rule = Permission.Rule
  export import Ruleset = Permission.Ruleset
  export import Reply = Permission.Reply
  export import RejectedError = Permission.RejectedError
  export import CorrectedError = Permission.CorrectedError
  export import DeniedError = Permission.DeniedError
  export const fromConfig = Permission.fromConfig
  export const merge = Permission.merge
  export const evaluate = Permission.evaluate
  export const disabled = Permission.disabled

  export const Request = z
    .object({
      id: Identifier.schema("permission"),
      sessionID: Identifier.schema("session"),
      permission: z.string(),
      patterns: z.string().array(),
      metadata: z.record(z.string(), z.any()),
      always: z.string().array(),
      tool: z
        .object({
          messageID: z.string(),
          callID: z.string(),
        })
        .optional(),
    })
    .meta({
      ref: "PermissionRequest",
    })

  export type Request = z.infer<typeof Request>

  export const Approval = z.object({
    projectID: z.string(),
    patterns: z.string().array(),
  })

  export const Event = {
    Asked: BusEvent.define("permission.asked", Request),
    Replied: BusEvent.define(
      "permission.replied",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
        reply: Reply,
      }),
    ),
  }

  const state = Instance.state(() => {
    const projectID = Instance.project.id
    const row = Database.use((db) =>
      db.select().from(PermissionTable).where(eq(PermissionTable.project_id, projectID)).get(),
    )
    const stored = row?.data ?? ([] as Ruleset)

    const pending: Record<
      string,
      {
        info: Request
        resolve: () => void
        reject: (e: any) => void
      }
    > = {}

    return {
      pending,
      approved: stored,
    }
  })

  export const ask = fn(
    Request.partial({ id: true }).extend({
      ruleset: Ruleset,
    }),
    async (input) => {
      const s = await state()
      const { ruleset, ...request } = input
      for (const pattern of request.patterns ?? []) {
        const rule = evaluate(request.permission, pattern, ruleset, s.approved)
        log.info("evaluated", { permission: request.permission, pattern, action: rule })
        if (rule.action === "deny")
          throw new DeniedError(ruleset.filter((r) => Wildcard.match(request.permission, r.permission)))
        if (rule.action === "ask") {
          const id = input.id ?? Identifier.ascending("permission")
          const info: Request = {
            id,
            ...request,
          }
          
          // Allow plugins to intercept and auto-approve before blocking
          const pluginResult = await Plugin.trigger("permission.ask", info, {
            status: "ask" as "ask" | "allow" | "deny",
          })
          
          // If a plugin changed the status, respect it
          if (pluginResult.status === "deny") {
            throw new DeniedError(ruleset.filter((r) => Wildcard.match(request.permission, r.permission)))
          }
          if (pluginResult.status === "allow") {
            continue
          }
          
          // Status is still "ask" - create blocking promise for user approval
          return new Promise<void>((resolve, reject) => {
            s.pending[id] = {
              info,
              resolve,
              reject,
            }
            Bus.publish(Event.Asked, info)
          })
        }
        if (rule.action === "allow") continue
      }
    },
  )

  export const reply = fn(
    z.object({
      requestID: Identifier.schema("permission"),
      reply: Reply,
      message: z.string().optional(),
    }),
    async (input) => {
      const s = await state()
      const existing = s.pending[input.requestID]
      if (!existing) return
      delete s.pending[input.requestID]
      Bus.publish(Event.Replied, {
        sessionID: existing.info.sessionID,
        requestID: existing.info.id,
        reply: input.reply,
      })
      if (input.reply === "reject") {
        existing.reject(input.message ? new CorrectedError(input.message) : new RejectedError())
        const sessionID = existing.info.sessionID
        for (const [id, pending] of Object.entries(s.pending)) {
          if (pending.info.sessionID === sessionID) {
            delete s.pending[id]
            Bus.publish(Event.Replied, {
              sessionID: pending.info.sessionID,
              requestID: pending.info.id,
              reply: "reject",
            })
            pending.reject(new RejectedError())
          }
        }
        return
      }
      if (input.reply === "once") {
        existing.resolve()
        return
      }
      if (input.reply === "always") {
        for (const pattern of existing.info.always) {
          s.approved.push({
            permission: existing.info.permission,
            pattern,
            action: "allow",
          })
        }

        // Persist approved permissions to database
        const projectID = Instance.project.id
        Database.use((db) => {
          const existing = db.select().from(PermissionTable).where(eq(PermissionTable.project_id, projectID)).get()
          if (existing) {
            db.update(PermissionTable)
              .set({ data: s.approved, time_updated: Date.now() })
              .where(eq(PermissionTable.project_id, projectID))
              .run()
          } else {
            db.insert(PermissionTable)
              .values({ project_id: projectID, data: s.approved, time_created: Date.now(), time_updated: Date.now() })
              .run()
          }
        })

        existing.resolve()

        const sessionID = existing.info.sessionID
        for (const [id, pending] of Object.entries(s.pending)) {
          if (pending.info.sessionID !== sessionID) continue
          const ok = pending.info.patterns.every(
            (pattern) => evaluate(pending.info.permission, pattern, s.approved).action === "allow",
          )
          if (!ok) continue
          delete s.pending[id]
          Bus.publish(Event.Replied, {
            sessionID: pending.info.sessionID,
            requestID: pending.info.id,
            reply: "always",
          })
          pending.resolve()
        }
        return
      }
    },
  )

  export async function list() {
    const s = await state()
    return Object.values(s.pending).map((x) => x.info)
  }

  export async function listApproved() {
    const s = await state()
    return s.approved
  }

  export const AddRule = z.object({
    permission: z.string(),
    pattern: z.string(),
    action: z.enum(["allow", "deny", "ask"]),
  })

  export async function addRule(input: z.infer<typeof AddRule>) {
    const s = await state()
    s.approved.push(input)

    // Persist to database
    const projectID = Instance.project.id
    Database.use((db) => {
      const existing = db.select().from(PermissionTable).where(eq(PermissionTable.project_id, projectID)).get()
      if (existing) {
        db.update(PermissionTable)
          .set({ data: s.approved, time_updated: Date.now() })
          .where(eq(PermissionTable.project_id, projectID))
          .run()
      } else {
        db.insert(PermissionTable)
          .values({ project_id: projectID, data: s.approved, time_created: Date.now(), time_updated: Date.now() })
          .run()
      }
    })
  }

  export const RemoveRule = z.object({
    permission: z.string(),
    pattern: z.string(),
  })

  export async function removeRule(input: z.infer<typeof RemoveRule>) {
    const s = await state()
    s.approved = s.approved.filter(
      (rule) => !(rule.permission === input.permission && rule.pattern === input.pattern),
    )

    // Persist to database
    const projectID = Instance.project.id
    Database.use((db) => {
      const existing = db.select().from(PermissionTable).where(eq(PermissionTable.project_id, projectID)).get()
      if (existing) {
        db.update(PermissionTable)
          .set({ data: s.approved, time_updated: Date.now() })
          .where(eq(PermissionTable.project_id, projectID))
          .run()
      }
    })
  }

  /**
   * Extract path boundary settings from a ruleset.
   *
   * Rules with permission "path.write" / "path.read" and action "allow" define
   * the directories an agent is scoped to. The last matching allow rule wins
   * (consistent with evaluate()). Deny rules remove a previously allowed path.
   */
  export function extractPathBoundaries(ruleset: Ruleset): {
    writePaths: string[]
    readPath: string | undefined
  } {
    const writePaths: string[] = []
    const readPaths: string[] = []

    for (const rule of ruleset) {
      if (rule.permission === "path.write") {
        if (rule.action === "allow") writePaths.push(rule.pattern)
        else writePaths.splice(writePaths.indexOf(rule.pattern), 1)
      }
      if (rule.permission === "path.read") {
        if (rule.action === "allow") readPaths.push(rule.pattern)
        else readPaths.splice(readPaths.indexOf(rule.pattern), 1)
      }
    }

    return {
      writePaths,
      readPath: readPaths[readPaths.length - 1],
    }
  }
}
