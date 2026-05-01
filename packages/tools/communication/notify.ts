import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./notify.json"

const parameters = z.object({
  message: z.string().describe("Status update, progress report, or informational message to show the user. Appears immediately in the current session without pausing agent execution."),
  level: z
    .enum(["info", "progress", "warning"])
    .optional()
    .default("info")
    .describe("Notification level. 'info' for general updates, 'progress' for task progress reports, 'warning' for items needing the user's attention."),
})

export const NotifyTool = Tool.define("notify", {
  description: toolDef.description,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")

    const prefix = params.level === "info" ? "" : `[${params.level.toUpperCase()}] `
    const content = `${prefix}${params.message}`

    // Post to the current session so the user sees it without blocking the agent.
    // We prefer sessionSvc.reply (if available) over pong since reply guarantees
    // the message is attributed to the agent and not treated as user input.
    if (sessionSvc.reply) {
      await sessionSvc.reply({
        sessionID: ctx.sessionID,
        agentID: ctx.agent,
        message: content,
        parentMessageID: ctx.messageID,
      })
    } else {
      await sessionSvc.pong(ctx.sessionID, {
        from: { kind: "agent" as const, id: ctx.agent },
        content,
        parent: ctx.messageID ? { messageId: ctx.messageID } : null,
      })
    }

    return {
      title: `Notify (${params.level})`,
      metadata: {
        sessionId: ctx.sessionID,
        level: params.level,
      },
      output: `Notification posted: ${content.slice(0, 120)}${content.length > 120 ? "…" : ""}`,
    }
  },
})
