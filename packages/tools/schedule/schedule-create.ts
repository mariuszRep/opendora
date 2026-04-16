import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"

export const ScheduleCreateTool = Tool.define("schedule_create", async () => ({
  description: "Create a new schedule. A schedule runs a prompt or tool on a cron expression against a target agent or session. Use standard cron syntax (e.g. '0 9 * * 1-5' for weekdays at 9 AM).",
  parameters: z.object({
    prompt: z.string().describe("The prompt or instruction to execute when the schedule fires"),
    cron_expression: z.string().describe("Cron expression defining when the schedule runs (e.g. '0 9 * * *' for daily at 9 AM)"),
    agent_id: z.string().optional().describe("ID of the agent to target. Provide either agent_id or session_id."),
    session_id: z.string().optional().describe("ID of the session to target. Provide either agent_id or session_id."),
    timezone: z.string().default("UTC").describe("IANA timezone for the cron expression (e.g. 'America/New_York')"),
    action_type: z.enum(["message", "tool"]).default("message").describe("'message' sends the prompt as a message; 'tool' executes the prompt as a tool call"),
    tool_name: z.string().optional().describe("Tool name to invoke when action_type is 'tool'"),
  }),
  async execute(args: {
    prompt: string
    cron_expression: string
    agent_id?: string
    session_id?: string
    timezone?: string
    action_type?: "message" | "tool"
    tool_name?: string
  }, ctx) {
    await ctx.ask({
      permission: "schedule_create",
      patterns: [],
      always: [],
      metadata: {},
    })

    const svc = host(ctx).schedule
    if (!svc) throw new Error("Schedule service is not available in this context")

    const created = await svc.create(args) as any

    return {
      title: "Schedule Created",
      metadata: { id: created.id },
      output: `Created schedule ${created.id}\ncron: ${created.cron_expression} (${created.timezone})\ntarget: ${created.agent_id ? `agent:${created.agent_id}` : created.session_id ? `session:${created.session_id}` : "unassigned"}\naction: ${created.action_type}${created.tool_name ? ` (${created.tool_name})` : ""}\nprompt: ${created.prompt}`,
    }
  },
}))
