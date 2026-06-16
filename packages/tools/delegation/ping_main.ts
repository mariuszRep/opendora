import z from "zod"
import { Tool } from "@opendora/tools/tool"
import DESCRIPTION from "./ping_main.txt"
import { askDelegationPermission, postDelegatedPrompt, resolveDelegationTarget } from "./delegation"

const parameters = z.object({
  agent: z.string().describe("Target agent name whose main session should receive the ping"),
  prompt: z.string().describe("Message to send to the target agent main session"),
  description: z.string().describe("Short label for this delegation").optional(),
  mode: z.enum(["async", "sync"]).optional().describe("Execution mode for the ping"),
  reply_to: z.string().optional().describe("Session ID to reply to when done"),
  wait_for_reply: z.boolean().describe("Wait for a reply from the target session. Default: true.").optional(),
})

export const PingMainTool = Tool.define("ping_main", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx): Promise<{ title: string; metadata: Record<string, any>; output: string }> {
    const waitForReply = params.wait_for_reply ?? true
    const { session, agent, created } = await resolveDelegationTarget({
      route: "agent_main",
      agent: params.agent,
      description: params.description,
      ctx,
    })
    await askDelegationPermission(ctx, agent, params.description ?? `Ping ${agent} main session`)
    const { result, text } = await postDelegatedPrompt({
      sessionID: session.id,
      prompt: params.prompt,
      waitForReply,
      agent,
    })

    return {
      title: params.description ?? `Pinged ${agent} main`,
      metadata: {
        sessionId: session.id,
        agent,
        route: "agent_main",
        created,
        replied: waitForReply,
        messageId: result.info.id,
      },
      output: waitForReply
        ? [`route: agent_main`, `session_id: ${session.id}`, `agent: ${agent}`, "", "<pong>", text, "</pong>"].join("\n")
        : [`route: agent_main`, `session_id: ${session.id}`, `message_id: ${result.info.id}`, `agent: ${agent}`, "status: ping posted"].join("\n"),
    }
  },
})
