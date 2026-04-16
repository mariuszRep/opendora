import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"

export const ScheduleUpdateTool = Tool.define("schedule_update", async () => ({
  description: "Update an existing schedule. Only the fields you provide will be changed. Use this to enable/disable a schedule, change its cron expression, prompt, or target.",
  parameters: z.object({
    id: z.string().describe("The schedule ID to update"),
    is_active: z.boolean().optional().describe("Set to true to enable or false to disable the schedule"),
    cron_expression: z.string().optional().describe("New cron expression (e.g. '0 10 * * *')"),
    prompt: z.string().optional().describe("New prompt or instruction"),
    timezone: z.string().optional().describe("New IANA timezone (e.g. 'Europe/Berlin')"),
    action_type: z.enum(["message", "tool"]).optional().describe("Change action type"),
    tool_name: z.string().optional().describe("New tool name when action_type is 'tool'. Pass empty string to clear."),
  }),
  async execute(args: {
    id: string
    is_active?: boolean
    cron_expression?: string
    prompt?: string
    timezone?: string
    action_type?: "message" | "tool"
    tool_name?: string
  }, ctx) {
    await ctx.ask({
      permission: "schedule_update",
      patterns: [],
      always: [],
      metadata: {},
    })

    const svc = host(ctx).schedule
    if (!svc) throw new Error("Schedule service is not available in this context")

    const { id, ...patch } = args
    const updated = await svc.update(id, patch) as any

    if (!updated) {
      throw new Error(`Schedule '${id}' not found`)
    }

    return {
      title: "Schedule Updated",
      metadata: { id: updated.id },
      output: `Updated schedule ${updated.id}\ncron: ${updated.cron_expression} (${updated.timezone})\nactive: ${updated.is_active}\naction: ${updated.action_type}${updated.tool_name ? ` (${updated.tool_name})` : ""}\nprompt: ${updated.prompt}`,
    }
  },
}))
