import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./reply.json"

const parameters = z.object({
  message: z.string().describe("Text content to post into the target session."),
})

export const ReplyTool = Tool.define("reply", async (initCtx) => {
  // Check if this agent has stopAfterReply configured
  const stopAfterReply = initCtx?.agent?.config?.toolConfig?.reply?.stopAfterReply ?? false

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      const sessionSvc = h.session as any
      if (!sessionSvc) throw new Error("session service not available")

      const currentSession = await sessionSvc.get(ctx.sessionID) as any

      // 1. Check session.replyToSessionID → post there
      // 2. Else check session.parentSessionID → post there
      // 3. Throw if neither
      const targetSessionId: string | undefined = currentSession?.replyToSessionID ?? currentSession?.parentSessionID

      if (!targetSessionId) {
        throw new Error(
          "No reply target: this session has no replyToSessionID or parentSessionID set.",
        )
      }

      if (sessionSvc.reply) {
        const msg = await sessionSvc.reply({
          sessionID: targetSessionId,
          agentID: ctx.agent,
          message: params.message,
          parentMessageID: ctx.messageID,
        }) as any

        return {
          title: `Reply → ${targetSessionId.slice(0, 8)}…`,
          metadata: {
            sessionId: targetSessionId,
            messageId: msg?.id,
            sourceSessionId: ctx.sessionID,
            agent: ctx.agent,
            kind: "reply",
            stopAfterReply,
          },
          output: `Message posted to session ${targetSessionId}.`,
        }
      }

      const from = { kind: "agent" as const, id: ctx.agent }
      const ponged = await sessionSvc.pong(targetSessionId, {
        from,
        content: params.message,
        parent: null,
      }) as any

      return {
        title: `Reply → ${targetSessionId.slice(0, 8)}…`,
        metadata: {
          sessionId: targetSessionId,
          messageId: ponged?.id,
          sourceSessionId: ctx.sessionID,
          agent: ctx.agent,
          kind: "reply",
          stopAfterReply,
        },
        output: `Message posted to session ${targetSessionId}.`,
      }
    },
  }
})
