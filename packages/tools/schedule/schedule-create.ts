import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./schedule-create.json"

export const ScheduleCreateTool = Tool.define("schedule_create", async () => ({
  description: toolDef.description,
  parameters: z.object({
    workflow_id: z.string().describe("ID of the workflow to run when the schedule fires"),
    workflow_input: z.record(z.string(), z.unknown()).optional()
      .describe("Input parameters for the workflow (key-value pairs matching the workflow's parameter nodes)"),
    description: z.string().optional()
      .describe("Optional human-readable description used to auto-generate a display name"),
    cron_expression: z.string().describe("Cron expression defining when the schedule runs (e.g. '0 9 * * *' for daily at 9 AM)"),
    agent_id: z.string().optional().describe("ID or name of the agent that owns this schedule"),
    session_id: z.string().optional().describe("ID of the parent session to attach this schedule to"),
    name: z.string().optional().describe("Display name for the schedule (auto-generated from workflow ID if omitted)"),
    color: z.string().optional().describe("Color identifier for the schedule card (e.g. 'blue', 'green', 'slate')"),
    timezone: z.string().default("UTC").describe("IANA timezone for the cron expression (e.g. 'America/New_York')"),
  }),
  async execute(args: {
    workflow_id: string
    workflow_input?: Record<string, unknown>
    description?: string
    cron_expression: string
    agent_id?: string
    session_id?: string
    name?: string
    color?: string
    timezone?: string
  }, ctx) {
    await ctx.ask({
      permission: "schedule_create",
      patterns: [],
      always: [],
      metadata: {},
    })

    const svc = host(ctx).schedule
    if (!svc) throw new Error("Schedule service is not available in this context")

    // Resolve parent session
    let sessionId: string
    if (args.session_id) {
      sessionId = args.session_id
    } else if (args.agent_id) {
      const sessionSvc = host(ctx).session
      if (sessionSvc?.ensureMainSession) {
        const agentSession = await sessionSvc.ensureMainSession(args.agent_id)
        sessionId = agentSession.id
      } else {
        sessionId = ctx.sessionID
      }
    } else {
      sessionId = ctx.sessionID
    }

    const created = await svc.create({
      workflow_id: args.workflow_id,
      workflow_input: args.workflow_input,
      description: args.description,
      cron_expression: args.cron_expression,
      timezone: args.timezone ?? "UTC",
      agent_id: args.agent_id,
      session_id: sessionId,
      name: args.name,
      color: args.color,
    } as any) as any

    return {
      title: "Schedule Created",
      metadata: { id: created.id },
      output: [
        `Created schedule ${created.id}`,
        `name: ${created.name ?? "(auto-generating)"}`,
        `cron: ${created.cron_expression} (${created.timezone})`,
        `target: ${created.agent_id ? `agent:${created.agent_id}` : created.session_id ? `session:${created.session_id}` : "unassigned"}`,
        `workflow: ${args.workflow_id}`,
      ].join("\n"),
    }
  },
}))
