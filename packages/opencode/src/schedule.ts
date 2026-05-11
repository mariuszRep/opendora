/**
 * Schedule service — CRUD operations on the ScheduleTable.
 * Wraps raw DB access so tools and routes can share the same logic.
 */
import { Database } from "@/storage/db"
import { ScheduleTable } from "@opendora/schedule/sql"
import type { ScheduleDispatchFn } from "@opendora/schedule/cron-scheduler"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"
import { getGlobalTimezone } from "@/server/routes/general"

export namespace Schedule {
  let _dispatch: ScheduleDispatchFn = async () => {}

  export function setDispatch(fn: ScheduleDispatchFn) {
    _dispatch = fn
  }

  export async function run(id: string): Promise<void> {
    const schedule = get(id)
    if (!schedule) throw new Error(`Schedule '${id}' not found`)
    await _dispatch(schedule as any)
  }
  export interface ScheduleRow {
    id: string
    project_id: string | null
    session_id: string | null
    agent_id: string | null
    prompt: string
    cron_expression: string
    timezone: string | null
    is_active: boolean | null
    action_type: "message" | "tool"
    tool_name: string | null
    time_created: number
    time_updated: number
    last_executed: number | null
    color: string | null
    name: string | null
  }

  export interface CreateInput {
    prompt: string
    cron_expression: string
    agent_id?: string
    session_id?: string
    timezone?: string
    action_type?: "message" | "tool"
    tool_name?: string
    color?: string
    name?: string
  }

  export interface UpdateInput {
    is_active?: boolean
    cron_expression?: string
    prompt?: string
    timezone?: string
    action_type?: "message" | "tool"
    tool_name?: string
    agent_id?: string | null
    session_id?: string | null
    color?: string
    name?: string | null
  }

  export function list(): ScheduleRow[] {
    return Database.Client().select().from(ScheduleTable).all() as ScheduleRow[]
  }

  export function get(id: string): ScheduleRow | undefined {
    return Database.Client()
      .select()
      .from(ScheduleTable)
      .where(eq(ScheduleTable.id, id))
      .get() as ScheduleRow | undefined
  }

  export function create(input: CreateInput): ScheduleRow {
    const row = {
      id: ulid(),
      prompt: input.prompt,
      cron_expression: input.cron_expression,
      agent_id: input.agent_id ?? null,
      session_id: input.session_id ?? null,
      project_id: null,
      is_active: true,
      timezone: input.timezone ?? getGlobalTimezone(),
      action_type: (input.action_type ?? "message") as "message" | "tool",
      tool_name: input.tool_name ?? null,
      color: input.color ?? null,
      name: input.name ?? null,
      time_created: Date.now(),
      time_updated: Date.now(),
      last_executed: null,
    }
    Database.Client().insert(ScheduleTable).values(row).run()
    return row as ScheduleRow
  }

  export function update(id: string, patch: UpdateInput): ScheduleRow | undefined {
    const setBlock: any = { time_updated: Date.now() }
    if (patch.is_active !== undefined) setBlock.is_active = patch.is_active
    if (patch.cron_expression !== undefined) setBlock.cron_expression = patch.cron_expression
    if (patch.prompt !== undefined) setBlock.prompt = patch.prompt
    if (patch.timezone !== undefined) setBlock.timezone = patch.timezone
    if (patch.action_type !== undefined) setBlock.action_type = patch.action_type
    if (patch.tool_name !== undefined) setBlock.tool_name = patch.tool_name || null
    if ("agent_id" in patch) setBlock.agent_id = patch.agent_id || null
    if ("session_id" in patch) setBlock.session_id = patch.session_id || null
    if (patch.color !== undefined) setBlock.color = patch.color || null
    if ("name" in patch) setBlock.name = patch.name || null

    return Database.Client()
      .update(ScheduleTable)
      .set(setBlock)
      .where(eq(ScheduleTable.id, id))
      .returning()
      .get() as ScheduleRow | undefined
  }

  export function remove(id: string): void {
    Database.Client().delete(ScheduleTable).where(eq(ScheduleTable.id, id)).run()
  }
}
