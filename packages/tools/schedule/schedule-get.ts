import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./schedule-get.json"

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

export const ScheduleGetTool = Tool.define("schedule_get", async () => ({
  description: toolDef.description,
  parameters: z.object({
    id: z.string().describe("The schedule ID to retrieve"),
  }),
  async execute(args: { id: string }, ctx) {
    await ctx.ask({
      permission: "schedule_get",
      patterns: [],
      always: ["*"],
      metadata: {},
    })

    const svc = host(ctx).schedule
    if (!svc) throw new Error("Schedule service is not available in this context")

    const s = await svc.get(args.id) as any
    if (!s) throw new Error(`Schedule '${args.id}' not found`)

    const lastRun = s.last_executed ? new Date(s.last_executed).toISOString() : "never"
    const created = new Date(s.time_created).toISOString()
    const updated = new Date(s.time_updated).toISOString()
    const target = s.agent_id ? `agent:${s.agent_id}` : s.session_id ? `session:${s.session_id}` : "unassigned"

    return {
      title: `Schedule ${s.id}`,
      metadata: { id: s.id },
      output: [
        `ID: ${s.id}`,
        `Name: ${s.name ?? "(unnamed)"}`,
        `Status: ${s.is_active ? "active" : "inactive"}`,
        `Cron: ${s.cron_expression} (${s.timezone ?? "UTC"})`,
        `Target: ${target}`,
        `Run mode: ${describeRunMode(s)}`,
        `Prompt: ${extractPrompt(s)}`,
        `Color: ${s.color ?? "(none)"}`,
        `Last run: ${lastRun}`,
        `Created: ${created}`,
        `Updated: ${updated}`,
      ].join("\n"),
    }
  },
}))
