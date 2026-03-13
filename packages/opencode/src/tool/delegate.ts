import z from "zod"
import { Tool } from "./tool"
import { Agent } from "../agent/agent"
import { Session } from "../session"
import { SessionPrompt } from "../session/prompt"

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
  description: `Send a message to an agent's persistent session and optionally wait for a reply.

Use this to:
- Talk to an agent's main (role) session: delegate(agent="project_manager", prompt="...")
- Continue a conversation in a known session: delegate(session_id="...", prompt="...")

Do NOT use this to run isolated tasks — use spawn for that.`,
  parameters,
  async execute(params, ctx) {
    const wait = params.wait ?? true

    let targetSession = params.session_id ? await Session.get(params.session_id) : undefined
    let targetAgentName = params.agent ?? targetSession?.agentID

    if (params.agent) {
      const agent = await Agent.get(params.agent)
      if (!agent) throw new Error(`Unknown agent: ${params.agent}`)
      targetAgentName = agent.id
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
      targetSession = await Session.ensureMainSession(targetAgentName)
    }

    const result = await SessionPrompt.prompt({
      sessionID: targetSession.id,
      ...(targetAgentName ? { agent: targetAgentName } : {}),
      noReply: !wait,
      parts: await SessionPrompt.resolvePromptParts(params.prompt),
    })

    const text = result.parts.findLast((part) => part.type === "text")?.text ?? ""
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
