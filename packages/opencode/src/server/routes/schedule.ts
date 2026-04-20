import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Database } from "../../storage/db"
import { ScheduleTable } from "@opendora/schedule/sql"
import type { ScheduleDispatchFn } from "@opendora/schedule/cron-scheduler"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"

export function ScheduleRoutes(dispatch: ScheduleDispatchFn) {
  const app = new Hono()

  app.get(
    "/",
    describeRoute({
      summary: "List schedules",
      description: "Get all active and inactive delegation schedules.",
      operationId: "schedule.list",
      responses: {
        200: {
          description: "List of schedules",
          content: { "application/json": { schema: resolver(z.any()) } }
        }
      }
    }),
    async (c) => {
      const db = Database.Client()
      const results = await db.select().from(ScheduleTable).all()
      return c.json(results)
    }
  )

  app.post(
    "/",
    describeRoute({
      summary: "Create schedule",
      operationId: "schedule.create",
      responses: {
        200: { description: "Schedule created", content: { "application/json": { schema: resolver(z.any()) } } }
      }
    }),
    validator("json", z.object({
      agent_id: z.string().optional(),
      session_id: z.string().optional(),
      prompt: z.string(),
      cron_expression: z.string(),
      action_type: z.enum(["message", "tool"]).optional(),
      tool_name: z.string().optional(),
      color: z.string().optional(),
    })),
    async (c) => {
      const input = c.req.valid("json")
      const db = Database.Client()
      const newSched = {
        id: ulid(),
        prompt: input.prompt,
        cron_expression: input.cron_expression,
        agent_id: input.agent_id || null,
        session_id: input.session_id || null,
        is_active: true,
        timezone: "UTC",
        action_type: input.action_type ?? "message" as const,
        tool_name: input.tool_name || null,
        color: input.color || null,
        time_created: Date.now(),
        time_updated: Date.now()
      }
      
      await db.insert(ScheduleTable).values(newSched).run()
      return c.json(newSched)
    }
  )

  app.patch(
    "/:id",
    describeRoute({
      summary: "Update schedule",
      operationId: "schedule.update",
      responses: {
        200: { description: "Updated schedule", content: { "application/json": { schema: resolver(z.any()) } } }
      }
    }),
    validator("param", z.object({ id: z.string() })),
    validator("json", z.object({
      is_active: z.boolean().optional(),
      cron_expression: z.string().optional(),
      prompt: z.string().optional(),
      action_type: z.enum(["message", "tool"]).optional(),
      tool_name: z.string().optional(),
      color: z.string().optional(),
    })),
    async (c) => {
      const id = c.req.valid("param").id
      const updates = c.req.valid("json")
      const db = Database.Client()

      const setBlock: any = { time_updated: Date.now() }
      if (updates.is_active !== undefined) setBlock.is_active = updates.is_active
      if (updates.cron_expression) setBlock.cron_expression = updates.cron_expression
      if (updates.prompt) setBlock.prompt = updates.prompt
      if (updates.action_type) setBlock.action_type = updates.action_type
      if (updates.tool_name !== undefined) setBlock.tool_name = updates.tool_name || null
      if (updates.color !== undefined) setBlock.color = updates.color || null

      const result = await db.update(ScheduleTable).set(setBlock).where(eq(ScheduleTable.id, id)).returning().get()
      if (!result) return c.json({ error: "not found" }, 404)
      return c.json(result)
    }
  )

  app.post(
    "/:id/run",
    describeRoute({
      summary: "Run schedule now",
      operationId: "schedule.run",
      responses: {
        200: { description: "Triggered", content: { "application/json": { schema: resolver(z.boolean()) } } },
        404: { description: "Not found" },
      }
    }),
    validator("param", z.object({ id: z.string() })),
    async (c) => {
      const id = c.req.valid("param").id
      const db = Database.Client()
      const schedule = db.select().from(ScheduleTable).where(eq(ScheduleTable.id, id)).get()
      if (!schedule) return c.json({ error: "not found" }, 404)
      await dispatch(schedule)
      return c.json(true)
    }
  )

  app.delete(
    "/:id",
    describeRoute({
      summary: "Delete schedule",
      operationId: "schedule.remove",
      responses: {
        200: { description: "Deleted", content: { "application/json": { schema: resolver(z.boolean()) } } }
      }
    }),
    validator("param", z.object({ id: z.string() })),
    async (c) => {
      const id = c.req.valid("param").id
      const db = Database.Client()
      await db.delete(ScheduleTable).where(eq(ScheduleTable.id, id)).run()
      return c.json(true)
    }
  )

  return app
}
