import z from "zod"
import { Tool } from "../tool"
import { host } from "../host"
import toolDef from "./session-get.json"

const parameters = z.object({
  session_id: z.string().describe("ID of the session to retrieve"),
  include_messages: z.boolean().default(true).describe("Include the full message content of the session"),
  message_limit: z.number().optional().describe("Maximum number of messages to include (default: all)"),
  include_thinking: z.boolean().default(false).describe("Include reasoning/thinking parts in messages"),
  include_tool_calls: z.boolean().default(false).describe("Include tool call parts in messages"),
})

export const SessionGetTool = Tool.define("session_get", {
  description: toolDef.description,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")

    await ctx.ask({
      permission: "session_get",
      patterns: [],
      always: ["*"],
      metadata: { sessionId: params.session_id }
    })

    try {
      const session = await sessionSvc.get(params.session_id)
      if (!session) {
        return {
          title: "Session Not Found",
          metadata: {
            sessionId: params.session_id,
            found: false,
          },
          output: JSON.stringify({ error: `Session '${params.session_id}' not found. Use session_search to find available sessions.` }),
        }
      }

      const sessionInfo: Record<string, any> = {
        id: session.id,
        title: session.title || null,
        type: session.sessionType || null,
        status: session.sessionStatus || null,
        agentId: session.agentID || null,
        directory: session.directory || null,
        created: session.time?.created ?? null,
        updated: session.time?.updated ?? null,
        parentId: session.parentSessionID || null,
        messageCount: session.messageCount ?? null,
      }

      if (session.tokens) {
        sessionInfo.tokens = {
          input: session.tokens.input,
          output: session.tokens.output,
          cacheRead: session.tokens.cacheRead,
          cacheWrite: session.tokens.cacheWrite,
        }
      }

      const result: Record<string, any> = { session: sessionInfo }

      if (params.include_messages) {
        const messages = await sessionSvc.messages({ sessionID: params.session_id })
        if (messages && messages.length > 0) {
          const messagesToInclude = params.message_limit
            ? messages.slice(0, params.message_limit)
            : messages

          result.messages = messagesToInclude.map((msg: any) => {
            const info = msg.info
            const parts = (msg.parts || []) as any[]

            const filteredParts = parts
              .filter((part: any) => {
                if (part.synthetic) return false
                if (part.type === "reasoning" && !params.include_thinking) return false
                if (part.type === "tool" && !params.include_tool_calls) return false
                return true
              })
              .map((part: any) => {
                if (part.type === "text") return { type: "text", text: part.text }
                if (part.type === "reasoning") return { type: "reasoning", text: part.text }
                if (part.type === "tool") return { type: "tool", tool: part.tool, state: part.state ?? null }
                return part
              })

            return {
              id: msg.id ?? null,
              timestamp: info?.time?.created ?? null,
              role: info?.role ?? null,
              parts: filteredParts,
            }
          })

          result.messagesMeta = {
            included: messagesToInclude.length,
            total: messages.length,
            truncated: params.message_limit ? messages.length > params.message_limit : false,
          }
        } else {
          result.messages = []
          result.messagesMeta = { included: 0, total: 0, truncated: false }
        }
      }

      return {
        title: `Session: ${session.title || params.session_id}`,
        metadata: {
          sessionId: session.id,
          sessionType: session.sessionType,
          sessionStatus: session.sessionStatus,
          agentId: session.agentID,
          messageCount: session.messageCount,
          found: true,
        },
        output: JSON.stringify(result, null, 2),
      }
    } catch (error) {
      return {
        title: "Session Retrieval Failed",
        metadata: {
          sessionId: params.session_id,
          found: false,
        },
        output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      }
    }
  },
})
