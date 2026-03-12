import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./ping_session.txt"
import { askDelegationPermission, postDelegatedPrompt, resolveDelegationTarget } from "./delegation"

const parameters = z.object({
  session_id: z.string().describe("Existing session id to ping"),
  prompt: z.string().describe("Message to send to the existing session"),
  agent: z.string().describe("Optional agent override for the target session").optional(),
  description: z.string().describe("Short label for this delegation").optional(),
  wait_for_reply: z.boolean().describe("Wait for a reply from the target session. Default: true.").optional(),
})

export const PingSessionTool = Tool.define("ping_session", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const waitForReply = params.wait_for_reply ?? true
    const { session, agent, created } = await resolveDelegationTarget({
      route: "existing_session",
      agent: params.agent,
      sessionID: params.session_id,
      description: params.description,
      ctx,
    })
    await askDelegationPermission(ctx, agent, params.description ?? `Ping session ${session.id}`)
    const { result, text } = await postDelegatedPrompt({
      sessionID: session.id,
      prompt: params.prompt,
      waitForReply,
      agent,
    })

    return {
      title: params.description ?? `Pinged session ${session.id}`,
      metadata: {
        sessionId: session.id,
        agent,
        route: "existing_session",
        created,
        replied: waitForReply,
        messageId: result.info.id,
      },
      output: waitForReply
        ? [`route: existing_session`, `session_id: ${session.id}`, `agent: ${agent ?? "(session default)"}`, "", "<pong>", text, "</pong>"].join("\n")
        : [`route: existing_session`, `session_id: ${session.id}`, `message_id: ${result.info.id}`, `agent: ${agent ?? "(session default)"}`, "status: ping posted"].join("\n"),
    }
  },
})
