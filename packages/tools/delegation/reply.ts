import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import DESCRIPTION from "./reply.txt"

const parameters = z.object({
  session_id: z.string().describe("Target session ID to post the message into."),
  message: z.string().describe("Text content to post into the target session."),
  parent_message_id: z
    .string()
    .describe("Message ID to reply to, for threading. Use the message ID that triggered this agent.")
    .optional(),
})

export const ReplyTool = Tool.define("reply", async (_initCtx) => ({
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")
    const parentMessageID = params.parent_message_id ?? ctx.messageID

    if (sessionSvc.reply) {
      const msg = await sessionSvc.reply({
        sessionID: params.session_id,
        agentID: ctx.agent,
        message: params.message,
        parentMessageID,
        parentSessionID: ctx.sessionID,
      })

      return {
        title: `Reply posted to session ${params.session_id}`,
        metadata: {
          sessionId: params.session_id,
          messageId: msg?.id,
          parentSessionId: ctx.sessionID,
          parentMessageId: ctx.messageID,
          agent: ctx.agent,
          kind: "reply",
        },
        output: `Message posted to session ${params.session_id}.`,
      }
    }

    const from = { kind: "agent" as const, id: ctx.agent }
    await sessionSvc.pong(params.session_id, {
      from,
      content: params.message,
      parent: { messageId: parentMessageID },
    })

    return {
      title: `Reply posted to session ${params.session_id}`,
      metadata: {
        sessionId: params.session_id,
        parentSessionId: ctx.sessionID,
        parentMessageId: ctx.messageID,
        agent: ctx.agent,
        kind: "reply",
      },
      output: `Message posted to session ${params.session_id}.`,
    }
  },
}))
