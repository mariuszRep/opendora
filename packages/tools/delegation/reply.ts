import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import DESCRIPTION from "./reply.txt"

const parameters = z.object({
  session_id: z
    .string()
    .describe(
      "Target session ID. If omitted, resolved automatically from the spawn parent message ID stored on this session.",
    )
    .optional(),
  message: z.string().describe("Text content to post into the target session."),
  parent_message_id: z
    .string()
    .describe("Message ID to thread the reply against. If omitted, uses spawnParentMessageID from this session.")
    .optional(),
})

export const ReplyTool = Tool.define("reply", async (_initCtx) => ({
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")

    let targetSessionId = params.session_id
    let parentMessageID = params.parent_message_id

    // Resolve target by walking the message parent chain back to the root origin session.
    // Each delegated message carries parent.sessionId pointing to the session it came from.
    // Walking this chain finds the session where the original user request was made.
    if (!targetSessionId || !parentMessageID) {
      const currentSession = await sessionSvc.get(ctx.sessionID) as any
      let spawnMsgId = currentSession?.spawnParentMessageID

      if (spawnMsgId) {
        let resolvedSessionId: string | undefined
        let resolvedMessageId: string = spawnMsgId

        // Walk the message parent chain until we reach the root (no further cross-session parent)
        let currentMsgId: string | undefined = spawnMsgId
        while (currentMsgId) {
          const msg = await sessionSvc.getMessage(currentMsgId) as any
          if (!msg) break
          const parentSessionId = msg.data?.parent?.sessionId
          if (parentSessionId) {
            // There's a cross-session parent — keep walking up
            resolvedSessionId = parentSessionId
            resolvedMessageId = msg.data?.parent?.messageId ?? currentMsgId
            currentMsgId = msg.data?.parent?.messageId
          } else {
            // No further cross-session parent — this session is the root
            resolvedSessionId = resolvedSessionId ?? msg.session_id
            break
          }
        }

        if (!targetSessionId && resolvedSessionId) targetSessionId = resolvedSessionId
        if (!parentMessageID) parentMessageID = resolvedMessageId
      }
    }

    parentMessageID ??= ctx.messageID

    if (!targetSessionId) {
      throw new Error("No reply target: session_id not provided and spawnParentMessageID could not be resolved.")
    }

    if (sessionSvc.reply) {
      const msg = await sessionSvc.reply({
        sessionID: targetSessionId,
        agentID: ctx.agent,
        message: params.message,
        parentMessageID,
        parentSessionID: ctx.sessionID,
      }) as any

      return {
        title: `Reply → ${targetSessionId.slice(0, 8)}…`,
        metadata: {
          sessionId: targetSessionId,
          messageId: msg?.id,
          parentSessionId: ctx.sessionID,
          parentMessageId: parentMessageID,
          agent: ctx.agent,
          kind: "reply",
        },
        output: `Message posted to session ${targetSessionId}.`,
      }
    }

    const from = { kind: "agent" as const, id: ctx.agent }
    const ponged = await sessionSvc.pong(targetSessionId, {
      from,
      content: params.message,
      parent: { messageId: parentMessageID },
    }) as any

    return {
      title: `Reply → ${targetSessionId.slice(0, 8)}…`,
      metadata: {
        sessionId: targetSessionId,
        messageId: ponged?.id,
        parentSessionId: ctx.sessionID,
        parentMessageId: parentMessageID,
        agent: ctx.agent,
        kind: "reply",
      },
      output: `Message posted to session ${targetSessionId}.`,
    }
  },
}))
