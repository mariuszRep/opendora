import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./schedule-delete.json"

export const ScheduleDeleteTool = Tool.define("schedule_delete", async () => ({
  description: toolDef.description,
  parameters: z.object({
    id: z.string().describe("The schedule ID to delete"),
  }),
  async execute(args: { id: string }, ctx) {
    await ctx.ask({
      permission: "schedule_delete",
      patterns: [],
      always: [],
      metadata: {},
    })

    const svc = host(ctx).schedule
    if (!svc) throw new Error("Schedule service is not available in this context")

    // Verify it exists before deleting
    const existing = await svc.get(args.id) as any
    if (!existing) throw new Error(`Schedule '${args.id}' not found`)

    await svc.remove(args.id)

    return {
      title: "Schedule Deleted",
      metadata: { id: args.id },
      output: `Deleted schedule ${args.id} (was: ${existing.cron_expression} → ${existing.prompt})`,
    }
  },
}))
