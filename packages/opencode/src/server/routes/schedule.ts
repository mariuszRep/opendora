import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Database } from "../../storage/db"
import { ScheduleTable } from "@opendora/schedule/sql"
import type { ScheduleDispatchFn } from "@opendora/schedule/cron-scheduler"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"
import { Agent } from "../../agent"
import { Provider } from "@opendora/provider/provider"
import { LLM } from "@opendora/session/llm"
import { Log } from "../../util/log"
import { Identifier } from "@opendora/util/id"
import { getGlobalTimezone } from "./general"

const log = Log.create({ service: "schedule-name" })

async function generateScheduleName(prompt: string): Promise<string | null> {
  try {
    const titleAgent = await Agent.get("title")
    if (!titleAgent) { log.warn("title agent not found"); return null }

    const { providerID, modelID } = titleAgent.model
      ? { providerID: titleAgent.model.providerID, modelID: titleAgent.model.modelID }
      : await Provider.defaultModel()

    const model = await Provider.getModel(providerID, modelID)

    const fakeSessionID = Identifier.ascending("session")
    const fakeUser: any = {
      id: Identifier.ascending("message"),
      sessionID: fakeSessionID,
      role: "user",
      time: { created: Date.now() },
      agent: titleAgent.name,
      model: { providerID, modelID },
    }

    const result = await LLM.stream({
      agent: titleAgent as any,
      user: fakeUser,
      system: [],
      small: true,
      tools: {},
      model,
      abort: new AbortController().signal,
      sessionID: fakeSessionID,
      retries: 1,
      messages: [
        { role: "user", content: `Generate a short title (3-7 words) for this scheduled task prompt:\n\n${prompt}` },
      ],
    })
    const text = await result.text
    if (!text) return null
    const cleaned = text
      .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
      .split("\n")
      .map((l: string) => l.trim())
      .find((l: string) => l.length > 0)
    if (!cleaned) return null
    const name = cleaned.replace(/^["']|["']$/g, "").trim()
    log.info("generated schedule name", { name })
    return name.length > 80 ? name.substring(0, 77) + "..." : name
  } catch (err) {
    log.error("failed to generate schedule name", { error: String(err) })
    return null
  }
}

/** Backfill names for all schedules that currently have none. */
export async function backfillScheduleNames(db: ReturnType<typeof Database.Client>) {
  const all = db.select().from(ScheduleTable).all()
  const nameless = (all as any[]).filter((r) => !r.name)
  if (nameless.length === 0) return
  log.info("backfilling schedule names", { count: nameless.length })
  for (const row of nameless) {
    const prompt = (() => {
      if (row.action_type === "tool") {
        try { const p = JSON.parse(row.prompt as string); return p.prompt ?? row.prompt } catch { return row.prompt }
      }
      return row.prompt
    })()
    const name = await generateScheduleName(prompt as string)
    if (name) {
      db.update(ScheduleTable).set({ name, time_updated: Date.now() }).where(eq(ScheduleTable.id, row.id)).run()
      log.info("backfilled schedule name", { id: row.id, name })
    }
  }
}

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
      const results = db.select().from(ScheduleTable).all()
      // Fire-and-forget backfill for any nameless schedules (runs inside request context)
      const nameless = (results as any[]).filter((r) => !r.name)
      if (nameless.length > 0) {
        Promise.all(nameless.map(async (row: any) => {
          const prompt = row.action_type === "tool"
            ? (() => { try { const p = JSON.parse(row.prompt); return p.prompt ?? row.prompt } catch { return row.prompt } })()
            : row.prompt
          const name = await generateScheduleName(prompt)
          if (name) db.update(ScheduleTable).set({ name, time_updated: Date.now() }).where(eq(ScheduleTable.id, row.id)).run()
        })).catch(() => {})
      }
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
      timezone: z.string().optional(),
      action_type: z.enum(["message", "tool"]).optional(),
      tool_name: z.string().optional(),
      color: z.string().optional(),
      name: z.string().optional(),
    })),
    async (c) => {
      const input = c.req.valid("json")
      const db = Database.Client()
      const id = ulid()
      const newSched = {
        id,
        prompt: input.prompt,
        cron_expression: input.cron_expression,
        agent_id: input.agent_id || null,
        session_id: input.session_id || null,
        project_id: null,
        is_active: true,
        timezone: input.timezone || getGlobalTimezone(),
        action_type: input.action_type ?? "message" as const,
        tool_name: input.tool_name || null,
        color: input.color || null,
        name: input.name || null,
        time_created: Date.now(),
        time_updated: Date.now(),
        last_executed: null,
      }

      await db.insert(ScheduleTable).values(newSched).run()

      // Auto-generate name if none provided (fire-and-forget)
      if (!input.name) {
        generateScheduleName(input.prompt).then((name) => {
          if (name) db.update(ScheduleTable).set({ name, time_updated: Date.now() }).where(eq(ScheduleTable.id, id)).run()
        }).catch(() => {})
      }

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
      timezone: z.string().optional(),
      prompt: z.string().optional(),
      action_type: z.enum(["message", "tool"]).optional(),
      tool_name: z.string().optional(),
      color: z.string().optional(),
      agent_id: z.string().optional().nullable(),
      session_id: z.string().optional().nullable(),
      name: z.string().optional().nullable(),
    })),
    async (c) => {
      const id = c.req.valid("param").id
      const updates = c.req.valid("json")
      const db = Database.Client()

      const setBlock: any = { time_updated: Date.now() }
      if (updates.is_active !== undefined) setBlock.is_active = updates.is_active
      if (updates.cron_expression) setBlock.cron_expression = updates.cron_expression
      if (updates.timezone) setBlock.timezone = updates.timezone
      if (updates.prompt) setBlock.prompt = updates.prompt
      if (updates.action_type) setBlock.action_type = updates.action_type
      if (updates.tool_name !== undefined) setBlock.tool_name = updates.tool_name || null
      if (updates.color !== undefined) setBlock.color = updates.color || null
      if ("agent_id" in updates) setBlock.agent_id = updates.agent_id || null
      if ("session_id" in updates) setBlock.session_id = updates.session_id || null
      if ("name" in updates) setBlock.name = updates.name || null

      const result = await db.update(ScheduleTable).set(setBlock).where(eq(ScheduleTable.id, id)).returning().get()
      if (!result) return c.json({ error: "not found" }, 404)

      // Auto-generate name when: no explicit name given AND (prompt changed OR still no name)
      if (!updates.name) {
        const currentName = (result as any).name
        const promptToUse = updates.prompt ?? (result as any).prompt
        if (!currentName && promptToUse) {
          generateScheduleName(promptToUse).then((name) => {
            if (name) db.update(ScheduleTable).set({ name, time_updated: Date.now() }).where(eq(ScheduleTable.id, id)).run()
          }).catch(() => {})
        }
      }

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
