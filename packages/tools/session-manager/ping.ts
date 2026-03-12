import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./ping.txt"
import { Agent } from "../agent/agent"
import { Session } from "../session"
import { SessionPrompt } from "../session/prompt"

const RouteSchema = z.enum(["agent_main", "existing_session", "new_child_session", "new_root_session"])

const parameters = z
  .object({
    description: z.string().describe("A short description for this ping").optional(),
    prompt: z.string().describe("The prompt or message to send to the target session"),
    route: RouteSchema.describe("How to resolve the target session").optional(),
    agent: z.string().describe("Target agent name for agent_main or new-session routes").optional(),
    session_id: z.string().describe("Existing session to ping when route is existing_session").optional(),
    wait_for_reply: z.boolean().describe("Wait for the target session to reply. Default: true.").optional(),
    title: z.string().describe("Optional title for a newly created session").optional(),
    session_type: z.enum(["role", "scope", "worker", "scratchpad"]).optional(),
  })
  .superRefine((value, ctx) => {
    const route = value.route ?? (value.session_id ? "existing_session" : "agent_main")

    if (route === "existing_session" && !value.session_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["session_id"],
        message: "session_id is required when route is existing_session",
      })
    }

    if (["agent_main", "new_child_session", "new_root_session"].includes(route) && !value.agent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agent"],
        message: `agent is required when route is ${route}`,
      })
    }
  })

export const PingTool = Tool.define("ping", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const route = params.route ?? (params.session_id ? "existing_session" : "agent_main")
    const waitForReply = params.wait_for_reply ?? true
    let created = false

    let targetSession =
      route === "existing_session" && params.session_id ? await Session.get(params.session_id) : undefined
    let targetAgentName = params.agent ?? targetSession?.agentID

    if (params.agent) {
      const agent = await Agent.get(params.agent)
      if (!agent) throw new Error(`Unknown agent: ${params.agent}`)
      targetAgentName = agent.name
    }

    if (targetAgentName) {
      await ctx.ask({
        permission: "task",
        patterns: [targetAgentName],
        always: ["*"],
        metadata: {
          description: params.description ?? params.title ?? "Ping another session",
          subagent_type: targetAgentName,
        },
      })
    }

    if (route === "agent_main") {
      if (!targetAgentName) throw new Error("agent is required when route is agent_main")
      targetSession = await Session.ensureMainSession(targetAgentName)
    }

    if (route === "new_child_session" || route === "new_root_session") {
      if (!targetAgentName) throw new Error(`agent is required when route is ${route}`)
      targetSession = await Session.create({
        parentID: route === "new_child_session" ? ctx.sessionID : undefined,
        title:
          params.title ??
          params.description ??
          `Ping session (@${targetAgentName}${route === "new_root_session" ? " root" : " child"})`,
        sessionType:
          params.session_type ?? (route === "new_root_session" ? "role" : "worker"),
        agentID: targetAgentName,
        ownerID: ctx.agent,
        ownerKind: "agent",
        spawnParentSessionID: ctx.sessionID,
        spawnParentMessageID: ctx.messageID,
      })
      created = true
    }

    if (!targetSession) throw new Error("Unable to resolve ping target session")

    const result = await SessionPrompt.prompt({
      sessionID: targetSession.id,
      ...(targetAgentName ? { agent: targetAgentName } : {}),
      noReply: !waitForReply,
      parts: await SessionPrompt.resolvePromptParts(params.prompt),
    })

    const text = result.parts.findLast((part) => part.type === "text")?.text ?? ""

    if (!waitForReply) {
      return {
        title: params.description ?? `Pinged ${targetAgentName ?? targetSession.id}`,
        metadata: {
          sessionId: targetSession.id,
          agent: targetAgentName,
          route,
          created,
          replied: false,
          messageId: result.info.id,
        },
        output: [
          `route: ${route}`,
          `session_id: ${targetSession.id}`,
          `message_id: ${result.info.id}`,
          `agent: ${targetAgentName ?? "(session default)"}`,
          `created: ${created ? "yes" : "no"}`,
          "status: ping posted",
        ].join("\n"),
      }
    }

    return {
      title: params.description ?? `Pinged ${targetAgentName ?? targetSession.id}`,
      metadata: {
        sessionId: targetSession.id,
        agent: targetAgentName,
        route,
        created,
        replied: true,
        messageId: result.info.id,
      },
      output: [
        `route: ${route}`,
        `session_id: ${targetSession.id}`,
        `agent: ${targetAgentName ?? "(session default)"}`,
        `created: ${created ? "yes" : "no"}`,
        "",
        "<pong>",
        text,
        "</pong>",
      ].join("\n"),
    }
  },
})
