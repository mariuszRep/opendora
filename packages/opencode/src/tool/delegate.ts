import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./delegate.txt"
import { Agent } from "../agent/agent"
import { Session } from "../session"
import { SessionPrompt } from "../session/prompt"

const parameters = z
  .object({
    description: z.string().describe("A short description for this delegation").optional(),
    prompt: z.string().describe("The prompt or message to send to the delegated session"),
    agent: z
      .string()
      .describe("Target agent name. Required when creating a new session, optional when reusing an existing session.")
      .optional(),
    session_id: z.string().describe("Existing session to send the message to").optional(),
    create_session: z
      .boolean()
      .describe("Create a new session instead of using an existing one. Default: true when session_id is omitted.")
      .optional(),
    wait_for_reply: z
      .boolean()
      .describe("Wait for the delegated agent to reply. If false, only post the message. Default: true.")
      .optional(),
    as_child: z
      .boolean()
      .describe("When creating a new session, attach it as a child of the current session. Default: true.")
      .optional(),
    title: z.string().describe("Optional title for a newly created session").optional(),
    session_type: z.enum(["role", "scope", "worker", "scratchpad"]).optional(),
  })
  .superRefine((value, ctx) => {
    const createSession = value.create_session ?? !value.session_id
    if (createSession && !value.agent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agent"],
        message: "agent is required when creating a new delegated session",
      })
    }
    if (!createSession && !value.session_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["session_id"],
        message: "session_id is required when create_session is false",
      })
    }
  })

export const DelegateTool = Tool.define("delegate", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const createSession = params.create_session ?? !params.session_id
    const waitForReply = params.wait_for_reply ?? true
    let created = false

    let targetSession = params.session_id ? await Session.get(params.session_id) : undefined
    let targetAgentName = params.agent ?? targetSession?.agentID

    if (targetAgentName) {
      await ctx.ask({
        permission: "task",
        patterns: [targetAgentName],
        always: ["*"],
        metadata: {
          description: params.description ?? params.title ?? "Delegated work",
          subagent_type: targetAgentName,
        },
      })
    }

    if (params.agent) {
      const agent = await Agent.get(params.agent)
      if (!agent) throw new Error(`Unknown agent: ${params.agent}`)
      targetAgentName = agent.name
    }

    if (createSession) {
      if (!targetAgentName) throw new Error("agent is required when creating a delegated session")
      targetSession = await Session.create({
        parentID: params.as_child === false ? undefined : ctx.sessionID,
        title: params.title ?? params.description ?? `Delegated session (@${targetAgentName})`,
        sessionType: params.session_type ?? (params.as_child === false ? "role" : "worker"),
        agentID: targetAgentName,
        ownerID: ctx.agent,
        ownerKind: "agent",
        spawnParentSessionID: ctx.sessionID,
        spawnParentMessageID: ctx.messageID,
      })
      created = true
    }

    if (!targetSession) {
      throw new Error("Unable to resolve delegated session")
    }

    const result = await SessionPrompt.prompt({
      sessionID: targetSession.id,
      ...(targetAgentName ? { agent: targetAgentName } : {}),
      noReply: !waitForReply,
      parts: await SessionPrompt.resolvePromptParts(params.prompt),
    })

    const text = result.parts.findLast((part) => part.type === "text")?.text ?? ""

    if (!waitForReply) {
      return {
        title: params.description ?? `Delegated to ${targetAgentName ?? targetSession.id}`,
        metadata: {
          sessionId: targetSession.id,
          agent: targetAgentName,
          created,
          replied: false,
          messageId: result.info.id,
        },
        output: [
          `session_id: ${targetSession.id}`,
          `message_id: ${result.info.id}`,
          `agent: ${targetAgentName ?? "(session default)"}`,
          `created: ${created ? "yes" : "no"}`,
          "status: message posted",
        ].join("\n"),
      }
    }

    return {
      title: params.description ?? `Delegated to ${targetAgentName ?? targetSession.id}`,
      metadata: {
        sessionId: targetSession.id,
        agent: targetAgentName,
        created,
        replied: true,
        messageId: result.info.id,
      },
      output: [
        `session_id: ${targetSession.id}`,
        `agent: ${targetAgentName ?? "(session default)"}`,
        `created: ${created ? "yes" : "no"}`,
        "",
        "<delegation_result>",
        text,
        "</delegation_result>",
      ].join("\n"),
    }
  },
})
