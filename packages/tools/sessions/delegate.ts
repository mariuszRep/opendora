import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import DESCRIPTION from "./delegate.txt"

const parameters = z
  .object({
    agent: z
      .string()
      .describe("Target agent name (exact match from agent list). Required unless session_id alone identifies the target.")
      .optional(),
    session_id: z
      .string()
      .describe("Target a specific existing session by ID. Mutually exclusive with session_type. Use for continuing conversations in existing sessions.")
      .optional(),
    session_type: z
      .enum(["worker", "scope", "scratchpad", "role"])
      .describe("Create a new session of this type. Choose based on task: role=ongoing relationship, scope=project-based, worker=quick task, scratchpad=experimental. Mutually exclusive with session_id.")
      .optional(),
    title: z
      .string()
      .describe("Title for the new session. Highly recommended for clarity when session_type is provided. Make it descriptive of the task.")
      .optional(),
    prompt: z.string().describe("Message to send to the target session. Be clear and specific about what you want the agent to do."),
    description: z.string().describe("Short label for this delegation (appears in logs and UI). Optional but helpful for tracking.").optional(),
    wait: z
      .boolean()
      .describe("Wait for the agent to reply. Default: false. Only set to true for quick factual questions where you need the answer immediately. Use false for complex tasks, multi-agent work, or anything involving user interaction.")
      .optional(),
    reply_to: z
      .string()
      .describe(
        "Session ID the receiving agent should reply to when done, using the reply tool (silent — does NOT trigger the LLM there). Omit for fire-and-forget.",
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.agent && !value.session_id) {
      ctx.addIssue({
        code: "custom",
        path: ["agent"],
        message: "agent or session_id is required. Choose: 1) agent for their main session, 2) agent + session_type for new session, or 3) session_id for existing session",
      })
    }
    if (value.session_id && value.session_type) {
      ctx.addIssue({
        code: "custom",
        path: ["session_type"],
        message: "session_type cannot be combined with session_id. Use session_id for existing sessions OR session_type for new sessions, not both.",
      })
    }
    if (value.session_type && !value.agent) {
      ctx.addIssue({
        code: "custom", 
        path: ["agent"],
        message: "agent is required when using session_type. You need to specify which agent should handle the new session.",
      })
    }
    if (value.session_type && !value.title) {
      ctx.addIssue({
        code: "custom",
        path: ["title"], 
        message: "title is highly recommended when creating new sessions. Without it, sessions get generic names and are hard to identify.",
      })
    }
  })

export const DelegateTool = Tool.define("delegate", async (initCtx) => {
  const delegateAgents = initCtx?.agent?.delegateAgents

  const description = delegateAgents && delegateAgents.length > 0
    ? `${DESCRIPTION}\n\nAgents you may delegate to:\n${delegateAgents.map((a) => `- ${a.name}${a.description ? `: ${a.description}` : ""}`).join("\n")}\n\nYou must not delegate to any agent outside this list.`
    : DESCRIPTION

  return {
  description,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const wait = params.wait ?? false

    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")
    const promptFn = h.prompt as any
    if (!promptFn) throw new Error("prompt service not available")
    const resolvePromptParts = h.resolvePromptParts
    if (!resolvePromptParts) throw new Error("resolvePromptParts service not available")

    let targetSession: any
    let targetAgentName: string | undefined
    let lookedUpAgent: any = undefined
    let created = false
    let route: string

    if (params.session_id) {
      // ── Target a specific existing session ──
      targetSession = await sessionSvc.get(params.session_id)
      if (!targetSession) throw new Error(`Session not found: ${params.session_id}`)
      targetAgentName = params.agent ?? targetSession.agentID
      route = "existing_session"
    } else {
      // ── agent is required here (enforced by superRefine) ──
      const agents = h.agents as any
      if (!agents) throw new Error("agents service not available")
      const allAgents = (await agents.list()) as any[]
      lookedUpAgent = allAgents.find((a: any) => a.name === params.agent || a.id === params.agent)
      if (!lookedUpAgent) throw new Error(`Unknown agent: ${params.agent}`)
      targetAgentName = lookedUpAgent.id

      if (params.session_type) {
        // ── Create a new child session ──
        targetSession = await sessionSvc.create({
          title: params.title ?? params.description ?? `Task (@${targetAgentName})`,
          sessionType: params.session_type,
          agentID: targetAgentName,
          ownerID: ctx.agent,
          ownerKind: "agent",
          parentSessionID: ctx.sessionID,
          ...(params.reply_to ? { replyToSessionID: params.reply_to } : {}),
        })
        created = true
        route = "new_session"
      } else {
        // ── Use agent's main session ──
        targetSession = await sessionSvc.ensureMainSession(targetAgentName)
        route = "agent_main"
      }
    }

    // Store reply_to on existing/main sessions (new sessions already get it at create time)
    if (params.reply_to && !created && sessionSvc.setReplyToSessionID) {
      await sessionSvc.setReplyToSessionID({ sessionID: targetSession.id, replyToSessionID: params.reply_to })
    }

    // Enforce caller's allowed-agent list if configured
    // allowedAgents stores agent names (as set by the UI), so compare against name
    if (targetAgentName) {
      const callerData = (await (h.agents as any)?.get(ctx.agent)) as any
      const allowedAgents = callerData?.config?.toolConfig?.delegate?.allowedAgents as string[] | undefined
      if (allowedAgents && allowedAgents.length > 0) {
        const targetName = lookedUpAgent?.name ?? targetAgentName
        if (!allowedAgents.includes(targetName)) {
          throw new Error(
            `Agent "${targetName}" is not in this agent's allowed delegation list. ` +
            `Allowed: ${allowedAgents.join(", ")}`,
          )
        }
      }
    }

    if (targetAgentName) {
      await ctx.ask({
        permission: "task",
        patterns: [targetAgentName],
        always: ["*"],
        metadata: {
          description: params.description ?? `Delegate to ${targetAgentName}`,
          subagent_type: targetAgentName,
        },
      })
    }

    if (targetSession.id === ctx.sessionID) {
      throw new Error(
        `Cannot delegate to the current session (${targetSession.id}). ` +
        `Provide session_type to create a new worker session instead.`,
      )
    }

    const result = await promptFn({
      sessionID: targetSession.id,
      ...(targetAgentName ? { agent: targetAgentName } : {}),
      noWait: !wait,
      parentMessageID: ctx.messageID,
      parts: await resolvePromptParts(params.prompt),
    })

    const text = result.parts.findLast((part: any) => part.type === "text")?.text ?? ""
    const resultTag = created ? "spawn_result" : "delegation_result"

    if (!wait) {
      return {
        title: params.description ?? `Delegated to ${targetAgentName ?? targetSession.id}`,
        metadata: {
          sessionId: targetSession.id,
          agent: targetAgentName,
          route,
          created,
          replied: false,
          messageId: result.info.id,
          replyTo: params.reply_to,
        },
        output: [
          `session_id: ${targetSession.id}`,
          `agent: ${targetAgentName ?? "(session default)"}`,
          `route: ${route}`,
          `message_id: ${result.info.id}`,
          `reply_mode: ${params.reply_to ? `silent_reply → session ${params.reply_to}` : "none"}`,
          "status: message posted",
        ].join("\n"),
      }
    }

    return {
      title: params.description ?? `Delegated to ${targetAgentName ?? targetSession.id}`,
      metadata: {
        sessionId: targetSession.id,
        agent: targetAgentName,
        route,
        created,
        replied: true,
        messageId: result.info.id,
        replyTo: params.reply_to,
      },
      output: [
        `session_id: ${targetSession.id}`,
        `agent: ${targetAgentName ?? "(session default)"}`,
        `route: ${route}`,
        "",
        `<${resultTag}>`,
        text,
        `</${resultTag}>`,
      ].join("\n"),
    }
  },
  }
})
