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
    run_mode: z.enum(["direct", "delegate_new", "delegate_existing"]).optional().describe(
      "Change how the schedule runs: 'direct' sends to the parent session, " +
      "'delegate_new' creates a new sub-session each run, " +
      "'delegate_existing' routes to a specific existing session."
    ),
    prompt: z.string().optional().describe("New message or instruction (used as-is for 'direct'; as the inner prompt for delegate modes)"),
    delegate_session_id: z.string().optional().describe("New target session ID when run_mode is 'delegate_existing'"),
    delegate_session_type: z.enum(["worker", "scope", "scratchpad"]).optional().describe(
      "New sub-session type when run_mode is 'delegate_new'"
    ),
    delegate_agent_id: z.string().optional().describe("New agent override for delegation"),
    // Legacy low-level params
    action_type: z.enum(["message", "tool"]).optional().describe("Low-level: change action type. Prefer run_mode instead."),
    tool_name: z.string().optional().describe("Low-level: new tool name. Pass empty string to clear. Prefer run_mode instead."),
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
    run_mode?: "direct" | "delegate_new" | "delegate_existing"
    prompt?: string
    delegate_session_id?: string
    delegate_session_type?: "worker" | "scope" | "scratchpad"
    delegate_agent_id?: string
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

    const { id, run_mode, prompt, delegate_session_id, delegate_session_type, delegate_agent_id, ...rest } = args
    const patch: Record<string, unknown> = { ...rest }

    if (run_mode) {
      if (run_mode === "direct") {
        patch.action_type = "message"
        patch.tool_name = ""
        if (prompt !== undefined) patch.prompt = prompt
      } else {
        patch.action_type = "tool"
        patch.tool_name = "delegate"
        const params: Record<string, unknown> = { prompt: prompt ?? "" }
        const agentId = delegate_agent_id || args.agent_id
        if (agentId) params.agent = agentId
        if (run_mode === "delegate_existing") {
          if (!delegate_session_id) {
            throw new Error("delegate_session_id is required when run_mode is 'delegate_existing'")
          }
          params.session_id = delegate_session_id
        } else {
          params.session_type = delegate_session_type ?? "worker"
        }
        patch.prompt = JSON.stringify(params)
      }
    } else if (prompt !== undefined) {
      patch.prompt = prompt
    }

    const updated = await svc.update(id, patch) as any

    if (!updated) {
      throw new Error(`Schedule '${id}' not found`)
    }

    const runDesc = updated.action_type === "tool" && updated.tool_name === "delegate"
      ? (() => {
          try {
            const p = JSON.parse(updated.prompt)
            if (p.session_id) return `delegate → session:${p.session_id}`
            if (p.session_type) return `delegate → new ${p.session_type} each run`
            return "delegate"
          } catch { return "delegate" }
        })()
      : "direct"

    return {
      title: "Schedule Updated",
      metadata: { id: updated.id },
      output: [
        `Updated schedule ${updated.id}`,
        `name: ${updated.name ?? "(none)"}`,
        `cron: ${updated.cron_expression} (${updated.timezone ?? "UTC"})`,
        `active: ${updated.is_active}`,
        `target: ${updated.agent_id ? `agent:${updated.agent_id}` : updated.session_id ? `session:${updated.session_id}` : "unassigned"}`,
        `run mode: ${runDesc}`,
      ].join("\n"),
    }
  },
}))
