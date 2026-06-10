import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./schedule-update.json"

export const ScheduleUpdateTool = Tool.define("schedule_update", async () => ({
  description: toolDef.description,
  parameters: z.object({
    id: z.string().describe("The schedule ID to update"),
    is_active: z.boolean().optional().describe("Set to true to enable or false to disable the schedule"),
    cron_expression: z.string().optional().describe("New cron expression (e.g. '0 10 * * *')"),
    timezone: z.string().optional().describe("New IANA timezone (e.g. 'Europe/Berlin')"),
    agent_id: z.string().optional().describe("Update the owning agent ID"),
    session_id: z.string().optional().describe("Update the parent session ID"),
    name: z.string().optional().describe("New display name for the schedule"),
    color: z.string().optional().describe("New color identifier (e.g. 'blue', 'green', 'slate')"),
    workflow_id: z.string().optional().describe("New workflow ID to run on this schedule"),
    workflow_input: z.record(z.string(), z.unknown()).optional().nullable()
      .describe("New input parameters for the workflow. Pass null to clear existing parameters."),
    description: z.string().optional().describe("New human-readable description for auto-name generation"),
  }),
  async execute(args: {
    id: string
    is_active?: boolean
    cron_expression?: string
    timezone?: string
    agent_id?: string
    session_id?: string
    name?: string
    color?: string
    workflow_id?: string
    workflow_input?: Record<string, unknown> | null
    description?: string
  }, ctx) {
    await ctx.ask({
      permission: "schedule_update",
      patterns: [],
      always: [],
      metadata: {},
    })

    const svc = host(ctx).schedule
    if (!svc) throw new Error("Schedule service is not available in this context")

    const { id, ...rest } = args
    const updated = await svc.update(id, rest) as any

    if (!updated) {
      throw new Error(`Schedule '${id}' not found`)
    }

    return {
      title: "Schedule Updated",
      metadata: { id: updated.id },
      output: [
        `Updated schedule ${updated.id}`,
        `name: ${updated.name ?? "(none)"}`,
        `cron: ${updated.cron_expression} (${updated.timezone ?? "UTC"})`,
        `active: ${updated.is_active}`,
        `target: ${updated.agent_id ? `agent:${updated.agent_id}` : updated.session_id ? `session:${updated.session_id}` : "unassigned"}`,
        `workflow: ${updated.workflow_id}`,
      ].join("\n"),
    }
  },
}))
