import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import DESCRIPTION from "./spawn_session.txt"

const parameters = z.object({
  agent: z.string().describe("Agent to assign to the new session"),
  prompt: z.string().describe("Task to send to the new session"),
  description: z.string().describe("Short label for this task").optional(),
  title: z.string().describe("Title for the new session").optional(),
  session_type: z
    .enum(["worker", "scope", "scratchpad"])
    .describe("Session type. Default: worker.")
    .optional(),
  wait: z
    .boolean()
    .describe("Wait for the task to complete and return the result. Default: true.")
    .optional(),
})

export const SpawnTool = Tool.define("spawn", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const wait = params.wait ?? true

    const agents = h.agents
    if (!agents) throw new Error("agents service not available")
    const agent = await agents.get(params.agent) as any
    if (!agent) throw new Error(`Unknown agent: ${params.agent}`)

    await ctx.ask({
      permission: "task",
      patterns: [agent.id],
      always: ["*"],
      metadata: {
        description: params.description ?? `Spawn ${agent.id}`,
        subagent_type: agent.id,
      },
    })

    const session = h.session
    if (!session) throw new Error("session service not available")
    const promptFn = h.prompt
    if (!promptFn) throw new Error("prompt service not available")
    const resolvePromptParts = h.resolvePromptParts
    if (!resolvePromptParts) throw new Error("resolvePromptParts service not available")

    const newSession = await (session as any).create({
      parentID: ctx.sessionID,
      title: params.title ?? params.description ?? `Task (@${agent.id})`,
      sessionType: params.session_type ?? "worker",
      agentID: agent.id,
      ownerID: ctx.agent,
      ownerKind: "agent",
      spawnParentSessionID: ctx.sessionID,
      spawnParentMessageID: ctx.messageID,
    })

    const result = await (promptFn as any)({
      sessionID: newSession.id,
      agent: agent.id,
      noReply: !wait,
      parentSessionID: ctx.sessionID,
      parentMessageID: ctx.messageID,
      parts: await resolvePromptParts(params.prompt),
    })

    const pingMessageId = wait ? (result.info as any).parentID as string : result.info.id
    await (session as any).setSpawnResponseMessageID({ sessionID: newSession.id, messageID: pingMessageId })

    const text = result.parts.findLast((part: any) => part.type === "text")?.text ?? ""

    if (!wait) {
      return {
        title: params.description ?? `Spawned ${agent.id}`,
        metadata: {
          sessionId: newSession.id,
          agent: agent.id,
          created: true,
          replied: false,
          messageId: result.info.id,
        },
        output: [
          `session_id: ${newSession.id}`,
          `agent: ${agent.id}`,
          `message_id: ${result.info.id}`,
          "status: task posted",
        ].join("\n"),
      }
    }

    return {
      title: params.description ?? `Spawned ${agent.id}`,
      metadata: {
        sessionId: newSession.id,
        agent: agent.id,
        created: true,
        replied: true,
        messageId: result.info.id,
      },
      output: [
        `session_id: ${newSession.id}`,
        `agent: ${agent.id}`,
        "",
        "<spawn_result>",
        text,
        "</spawn_result>",
      ].join("\n"),
    }
  },
})
