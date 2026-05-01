import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./reply.json"

const parameters = z.object({
  message: z.string().describe("Text content to post into the target session."),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Optional structured JSON payload to accompany the message. When provided, the data is appended as a JSON block so the receiving agent can extract it programmatically. Use this when the delegating agent specified a result_schema.",
    ),
})

export const ReplyTool = Tool.define("reply", async (initCtx) => {
  const stopAfterReply = initCtx?.agent?.config?.toolConfig?.reply?.stopAfterReply ?? false

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      const sessionSvc = h.session as any
      if (!sessionSvc) throw new Error("session service not available")

      const currentSession = await sessionSvc.get(ctx.sessionID) as any
      const targetSessionId: string | undefined = currentSession?.replyToSessionID ?? currentSession?.parentSessionID

      if (!targetSessionId) {
        throw new Error(
          "No reply target: this session has no replyToSessionID or parentSessionID set.",
        )
      }

      const fullMessage = params.data !== undefined
        ? `${params.message}\n\n<result_data>\n${JSON.stringify(params.data, null, 2)}\n</result_data>`
        : params.message

      if (sessionSvc.reply) {
        const msg = await sessionSvc.reply({
          sessionID: targetSessionId,
          agentID: ctx.agent,
          message: fullMessage,
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
            ...(params.data !== undefined ? { data: params.data } : {}),
          },
          output: `Message posted to session ${targetSessionId}.`,
        }
      }

      const from = { kind: "agent" as const, id: ctx.agent }
      const ponged = await sessionSvc.pong(targetSessionId, {
        from,
        content: fullMessage,
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
          ...(params.data !== undefined ? { data: params.data } : {}),
        },
        output: `Message posted to session ${targetSessionId}.`,
      }
    },
  }
})
