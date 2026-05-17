import { Hono } from "hono"
import { zValidator as validator } from "@hono/zod-validator"
import z from "zod"
import { Permission } from "./types.js"
import type { PermissionStore } from "./store.js"

export function createRouter(store: PermissionStore): Hono {
  const app = new Hono()

  // ── Pending requests ───────────────────────────────────────────────────────

  app.get("/pending", (c) => c.json(store.listPending()))

  app.post(
    "/pending/:request_id/reply",
    validator(
      "param",
      z.object({ request_id: z.string() }),
    ),
    validator(
      "json",
      z.object({
        reply: Permission.Reply,
        message: z.string().optional(),
      }),
    ),
    (c) => {
      const { request_id } = c.req.valid("param")
      const { reply, message } = c.req.valid("json")
      store.reply({ request_id, reply, message })
      return c.json(true)
    },
  )

  // ── Persisted rules ────────────────────────────────────────────────────────

  app.get(
    "/rules",
    validator(
      "query",
      z.object({
        scope: Permission.Scope,
        scope_id: z.string(),
      }),
    ),
    (c) => {
      const { scope, scope_id } = c.req.valid("query")
      return c.json(store.listRules(scope, scope_id))
    },
  )

  app.post(
    "/rules",
    validator(
      "json",
      z.object({
        scope: Permission.Scope,
        scope_id: z.string(),
        resource: z.string(),
        access: Permission.Access,
        pattern: z.string(),
        action: Permission.Action,
      }),
    ),
    (c) => {
      const input = c.req.valid("json")
      const rule = store.addRule(input)
      return c.json(rule)
    },
  )

  app.delete(
    "/rules/:id",
    validator(
      "param",
      z.object({ id: z.string() }),
    ),
    validator(
      "json",
      z.object({
        scope: Permission.Scope,
        scope_id: z.string(),
      }),
    ),
    (c) => {
      const { id } = c.req.valid("param")
      const { scope, scope_id } = c.req.valid("json")
      store.removeRule(id, scope, scope_id)
      return c.json(true)
    },
  )

  return app
}
