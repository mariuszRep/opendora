import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./schedule-list.json"

export const ScheduleListTool = Tool.define("schedule_list", async () => ({
  description: toolDef.description,
  parameters: z.object({
    active_only: z.boolean().default(false).describe("When true, return only active (enabled) schedules"),
  }),
  async execute(args: { active_only?: boolean }, ctx) {
    await ctx.ask({
      permission: "schedule_list",
      patterns: [],
      always: ["*"],
      metadata: {},
    })

    const svc = host(ctx).schedule
    if (!svc) throw new Error("Schedule service is not available in this context")

    const all = await svc.list() as any[]
    const results = args.active_only ? all.filter((s) => s.is_active) : all

    if (results.length === 0) {
      return {
        title: "No Schedules",
        metadata: { count: 0 },
        output: args.active_only ? "No active schedules found." : "No schedules found.",
      }
    }

    const lines = results.map((s: any) => {
      const status = s.is_active ? "active" : "inactive"
      const target = s.agent_id ? `agent:${s.agent_id}` : s.session_id ? `session:${s.session_id}` : "unassigned"
      const lastRun = s.last_executed ? new Date(s.last_executed).toISOString() : "never"
      const displayName = s.name ? `"${s.name}"` : "(unnamed)"
      return [
        `- [${s.id}] ${displayName}`,
        `  cron: ${s.cron_expression} (${s.timezone ?? "UTC"}) [${status}]`,
        `  target: ${target}`,
        `  workflow: ${s.workflow_id}`,
        `  description: ${s.description ?? "(none)"}`,
        `  last run: ${lastRun}`,
      ].join("\n")
    }).join("\n\n")

    return {
      title: `Schedules (${results.length})`,
      metadata: { count: results.length },
      output: lines,
    }
  },
}))
