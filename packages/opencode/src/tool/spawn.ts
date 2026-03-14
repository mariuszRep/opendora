import z from "zod"
import { Tool } from "./tool"
import { Agent } from "../agent/agent"
import { Session } from "../session"
import { SessionPrompt } from "../session/prompt"

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
  description: `Create a new child session for an agent and send it a task.

Use this to:
- Run an isolated task and get the result: spawn(agent="builder", prompt="implement feature X")
- Fire off background work without waiting: spawn(agent="planner", wait=false, prompt="...")

The new session is attached as a child of the current session.
Do NOT use this to reach an agent's existing session — use delegate for that.`,
  parameters,
  async execute(params, ctx) {
    const wait = params.wait ?? true

    const agent = await Agent.get(params.agent)
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

    const session = await Session.create({
      parentID: ctx.sessionID,
      title: params.title ?? params.description ?? `Task (@${agent.id})`,
      sessionType: params.session_type ?? "worker",
      agentID: agent.id,
      ownerID: ctx.agent,
      ownerKind: "agent",
      spawnParentSessionID: ctx.sessionID,
      spawnParentMessageID: ctx.messageID,
    })

    const result = await SessionPrompt.prompt({
      sessionID: session.id,
      agent: agent.id,
      noReply: !wait,
      parentSessionID: ctx.sessionID,
      parentMessageID: ctx.messageID,
      parts: await SessionPrompt.resolvePromptParts(params.prompt),
    })

    const pingMessageId = wait ? (result.info as any).parentID as string : result.info.id
    await Session.setSpawnResponseMessageID({ sessionID: session.id, messageID: pingMessageId })

    const text = result.parts.findLast((part) => part.type === "text")?.text ?? ""

    if (!wait) {
      return {
        title: params.description ?? `Spawned ${agent.id}`,
        metadata: {
          sessionId: session.id,
          agent: agent.id,
          created: true,
          replied: false,
          messageId: result.info.id,
        },
        output: [
          `session_id: ${session.id}`,
          `agent: ${agent.id}`,
          `message_id: ${result.info.id}`,
          "status: task posted",
        ].join("\n"),
      }
    }

    return {
      title: params.description ?? `Spawned ${agent.id}`,
      metadata: {
        sessionId: session.id,
        agent: agent.id,
        created: true,
        replied: true,
        messageId: result.info.id,
      },
      output: [
        `session_id: ${session.id}`,
        `agent: ${agent.id}`,
        "",
        "<spawn_result>",
        text,
        "</spawn_result>",
      ].join("\n"),
    }
  },
})
