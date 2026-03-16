import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import DESCRIPTION from "./delegate.txt"

const parameters = z
  .object({
    agent: z
      .string()
      .describe("Target agent name. Required unless session_id is provided.")
      .optional(),
    session_id: z
      .string()
      .describe("Target a specific existing session by ID. If omitted, the agent's main session is used.")
      .optional(),
    prompt: z.string().describe("Message to send to the target session"),
    description: z.string().describe("Short label for this delegation").optional(),
    wait: z
      .boolean()
      .describe("Wait for the agent to reply. Default: true.")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.agent && !value.session_id) {
      ctx.addIssue({
        code: "custom",
        path: ["agent"],
        message: "agent or session_id is required",
      })
    }
  })

export const DelegateTool = Tool.define("delegate", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const wait = params.wait ?? true

    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")
    const promptFn = h.prompt as any
    if (!promptFn) throw new Error("prompt service not available")
    const resolvePromptParts = h.resolvePromptParts
    if (!resolvePromptParts) throw new Error("resolvePromptParts service not available")
    const agents = h.agents as any
    if (!agents) throw new Error("agents service not available")

    let targetSession = params.session_id ? await sessionSvc.get(params.session_id) : undefined
    let targetAgentName = params.agent ?? targetSession?.agentID

    if (params.agent) {
      const agent = await agents.get(params.agent)
      if (!agent) throw new Error(`Unknown agent: ${params.agent}`)
      targetAgentName = (agent as any).id
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

    if (!targetSession) {
      if (!targetAgentName) throw new Error("agent or session_id is required")
      targetSession = await sessionSvc.ensureMainSession(targetAgentName)
    }

    const result = await promptFn({
      sessionID: targetSession.id,
      ...(targetAgentName ? { agent: targetAgentName } : {}),
      noReply: !wait,
      parentSessionID: ctx.sessionID,
      parentMessageID: ctx.messageID,
      parts: await resolvePromptParts(params.prompt),
    })

    const pingMessageId = wait ? (result.info as any).parentID as string : result.info.id
    await sessionSvc.setSpawnResponseMessageID({ sessionID: targetSession.id, messageID: pingMessageId })

    const text = result.parts.findLast((part: any) => part.type === "text")?.text ?? ""
    const route = params.session_id ? "existing_session" : "agent_main"

    if (!wait) {
      return {
        title: params.description ?? `Delegated to ${targetAgentName ?? targetSession.id}`,
        metadata: {
          sessionId: targetSession.id,
          agent: targetAgentName,
          route,
          replied: false,
          messageId: result.info.id,
        },
        output: [
          `session_id: ${targetSession.id}`,
          `agent: ${targetAgentName ?? "(session default)"}`,
          `route: ${route}`,
          `message_id: ${result.info.id}`,
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
        replied: true,
        messageId: result.info.id,
      },
      output: [
        `session_id: ${targetSession.id}`,
        `agent: ${targetAgentName ?? "(session default)"}`,
        `route: ${route}`,
        "",
        "<delegation_result>",
        text,
        "</delegation_result>",
      ].join("\n"),
    }
  },
})
