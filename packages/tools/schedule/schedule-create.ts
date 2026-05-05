import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./schedule-create.json"

export const ScheduleCreateTool = Tool.define("schedule_create", async () => ({
  description: toolDef.description,
  parameters: z.object({
    prompt: z.string().describe("The message or instruction to send when the schedule fires"),
    cron_expression: z.string().describe("Cron expression defining when the schedule runs (e.g. '0 9 * * *' for daily at 9 AM)"),
    agent_id: z.string().optional().describe("ID or name of the agent that owns this schedule (parent session's agent)"),
    session_id: z.string().optional().describe("ID of the parent session to attach this schedule to"),
    name: z.string().optional().describe("Display name for the schedule (auto-generated from prompt if omitted)"),
    color: z.string().optional().describe("Color identifier for the schedule card (e.g. 'blue', 'green', 'slate')"),
    timezone: z.string().default("UTC").describe("IANA timezone for the cron expression (e.g. 'America/New_York')"),
    run_mode: z.enum(["direct", "delegate_new", "delegate_existing"]).optional().describe(
      "'direct' sends the prompt as a message to the parent session. " +
      "'delegate_new' creates a fresh sub-session each time the schedule fires. " +
      "'delegate_existing' routes the prompt to a specific existing session each run."
    ),
    delegate_session_id: z.string().optional().describe("Target session ID when run_mode is 'delegate_existing'"),
    delegate_session_type: z.enum(["worker", "scope", "scratchpad"]).optional().describe(
      "Sub-session type to create when run_mode is 'delegate_new' (default: 'worker')"
    ),
    delegate_agent_id: z.string().optional().describe(
      "Agent override for the delegated session (defaults to the parent session's agent)"
    ),
    // Legacy low-level params — prefer run_mode above
    action_type: z.enum(["message", "tool"]).optional().describe("Low-level: 'message' or 'tool'. Prefer run_mode instead."),
    tool_name: z.string().optional().describe("Low-level: tool name when action_type is 'tool'. Prefer run_mode instead."),
  }),
  async execute(args: {
    prompt: string
    cron_expression: string
    agent_id?: string
    session_id?: string
    name?: string
    color?: string
    timezone?: string
    run_mode?: "direct" | "delegate_new" | "delegate_existing"
    delegate_session_id?: string
    delegate_session_type?: "worker" | "scope" | "scratchpad"
    delegate_agent_id?: string
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

    let finalPrompt: string
    let finalActionType: "message" | "tool"
    let finalToolName: string | undefined

    if (args.run_mode) {
      if (args.run_mode === "direct") {
        finalActionType = "message"
        finalToolName = undefined
        finalPrompt = args.prompt
      } else {
        finalActionType = "tool"
        finalToolName = "delegate"
        const params: Record<string, unknown> = { prompt: args.prompt }
        const agentId = args.delegate_agent_id || args.agent_id
        if (agentId) params.agent = agentId
        if (args.run_mode === "delegate_existing") {
          if (!args.delegate_session_id) {
            throw new Error("delegate_session_id is required when run_mode is 'delegate_existing'")
          }
          params.session_id = args.delegate_session_id
        } else {
          params.session_type = args.delegate_session_type ?? "worker"
        }
        finalPrompt = JSON.stringify(params)
      }
    } else {
      // Legacy path: low-level action_type/tool_name/prompt
      finalActionType = args.action_type ?? "message"
      finalToolName = args.tool_name
      finalPrompt = args.prompt
    }

    // Resolve parent session:
    // 1. Explicit session_id → use it
    // 2. Different agent_id provided → find/create that agent's main session
    // 3. Fallback → use the calling session (ctx.sessionID)
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
      prompt: finalPrompt,
      cron_expression: args.cron_expression,
      timezone: args.timezone ?? "UTC",
      action_type: finalActionType,
      tool_name: finalToolName,
      agent_id: args.agent_id,
      session_id: sessionId,
      name: args.name,
      color: args.color,
    }) as any

    const runDesc = finalActionType === "tool" && finalToolName === "delegate"
      ? (() => {
          try {
            const p = JSON.parse(finalPrompt)
            if (p.session_id) return `delegate → session:${p.session_id}`
            if (p.session_type) return `delegate → new ${p.session_type} each run`
            return "delegate"
          } catch { return "delegate" }
        })()
      : "direct"

    return {
      title: "Schedule Created",
      metadata: { id: created.id },
      output: [
        `Created schedule ${created.id}`,
        `name: ${created.name ?? "(auto-generating)"}`,
        `cron: ${created.cron_expression} (${created.timezone})`,
        `target: ${created.agent_id ? `agent:${created.agent_id}` : created.session_id ? `session:${created.session_id}` : "unassigned"}`,
        `run mode: ${runDesc}`,
        `prompt: ${args.prompt}`,
      ].join("\n"),
    }
  },
}))
