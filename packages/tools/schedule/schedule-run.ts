import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./schedule-run.json"

export const ScheduleRunTool = Tool.define("schedule_run", async () => ({
  description: toolDef.description,
  parameters: z.object({
    id: z.string().describe("The schedule ID to trigger"),
  }),
  async execute(args: { id: string }, ctx) {
    await ctx.ask({
      permission: "schedule_run",
      patterns: [],
      always: [],
      metadata: {},
    })

    const svc = host(ctx).schedule
    if (!svc) throw new Error("Schedule service is not available in this context")

    const schedule = await svc.get(args.id) as any
    if (!schedule) throw new Error(`Schedule '${args.id}' not found`)

    await svc.run(args.id)

    return {
      title: "Schedule Triggered",
      metadata: { id: args.id },
      output: `Triggered schedule ${args.id}\nprompt: ${schedule.prompt}\ntarget: ${schedule.agent_id ? `agent:${schedule.agent_id}` : schedule.session_id ? `session:${schedule.session_id}` : "unassigned"}`,
    }
  },
}))
