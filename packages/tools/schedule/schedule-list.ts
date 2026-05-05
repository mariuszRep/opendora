import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./schedule-list.json"

function describeRunMode(s: any): string {
  if (s.action_type === "tool" && s.tool_name === "delegate") {
    try {
      const p = JSON.parse(s.prompt)
      if (p.session_id) return `delegate_existing → session:${p.session_id}`
      if (p.session_type) return `delegate_new → ${p.session_type} per run`
      return "delegate"
    } catch {
      return "delegate"
    }
  }
  return "direct"
}

function extractPrompt(s: any): string {
  if (s.action_type === "tool") {
    try {
      const p = JSON.parse(s.prompt)
      if (typeof p.prompt === "string") return p.prompt
    } catch {}
  }
  return s.prompt
}

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
      const runMode = describeRunMode(s)
      const prompt = extractPrompt(s)
      const displayName = s.name ? `"${s.name}"` : "(unnamed)"
      return [
        `- [${s.id}] ${displayName}`,
        `  cron: ${s.cron_expression} (${s.timezone ?? "UTC"}) [${status}]`,
        `  target: ${target}`,
        `  run mode: ${runMode}`,
        `  prompt: ${prompt}`,
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
