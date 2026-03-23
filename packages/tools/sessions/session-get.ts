import z from "zod"
import { Tool } from "../tool"
import { host } from "../host"
import DESCRIPTION from "./session-get.txt"

const parameters = z.object({
  session_id: z.string().describe("ID of the session to retrieve"),
  include_messages: z.boolean().default(true).describe("Include the full message content of the session"),
  message_limit: z.number().optional().describe("Maximum number of messages to include (default: all)"),
})

export const SessionGetTool = Tool.define("session_get", {
  description: DESCRIPTION,
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
          output: `Session with ID '${params.session_id}' not found. Use session_search to find available sessions.`,
        }
      }

      // Build session metadata
      const metadata = [
        `ID: ${session.id}`,
        `Title: ${session.title || "(unnamed)"}`,
        `Type: ${session.sessionType || "(undefined)"}`,
        `Status: ${session.sessionStatus || "(undefined)"}`,
        `Agent: ${session.agentID || "(none)"}`,
        `Directory: ${session.directory || "(none)"}`,
        `Created: ${new Date(session.time.created).toLocaleString()}`,
        `Updated: ${new Date(session.time.updated).toLocaleString()}`,
      ]

      if (session.parentID) {
        metadata.push(`Parent: ${session.parentID}`)
      }

      if (session.messageCount !== undefined) {
        metadata.push(`Messages: ${session.messageCount}`)
      }

      if (session.tokens) {
        metadata.push(`Tokens in: ${session.tokens.input}`)
        metadata.push(`Tokens out: ${session.tokens.output}`)
        metadata.push(`Cache read: ${session.tokens.cacheRead}`)
        metadata.push(`Cache write: ${session.tokens.cacheWrite}`)
      }

      let output = `Session Details:\n\n${metadata.join('\n')}`

      // Include messages if requested
      if (params.include_messages) {
        const messages = await sessionSvc.messages({ sessionID: params.session_id })
        if (messages && messages.length > 0) {
          const messagesToInclude = params.message_limit 
            ? messages.slice(0, params.message_limit)
            : messages

          output += `\n\n${'='.repeat(80)}\n\nMessages (${messagesToInclude.length}${params.message_limit ? ` of ${messages.length}` : ''} total):\n\n`

          messagesToInclude.forEach((msg: any, index: number) => {
            const info = msg.info
            const parts = msg.parts || []
            
            const timestamp = info?.time?.created ? new Date(info.time.created).toLocaleString() : 'Unknown time'
            const role = info?.role || 'unknown'
            
            output += `[${index + 1}] ${timestamp} - ${role.toUpperCase()}\n`
            
            // Format message parts
            if (parts.length > 0) {
              parts.forEach((part: any) => {
                if (part.type === 'text' && !part.synthetic) {
                  output += `${part.text}\n`
                } else if (part.type === 'reasoning') {
                  output += `[Thinking] ${part.text}\n`
                } else if (part.type === 'tool') {
                  output += `[Tool: ${part.tool}] ${part.state?.status || 'pending'}\n`
                }
              })
            } else {
              output += `(no content)\n`
            }
            
            output += `\n`
          })

          if (params.message_limit && messages.length > params.message_limit) {
            output += `... (${messages.length - params.message_limit} additional messages not shown)\n`
          }
        } else {
          output += `\n\n${'='.repeat(80)}\n\nNo messages found in this session.`
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
        output
      }
    } catch (error) {
      return {
        title: "Session Retrieval Failed",
        metadata: {
          sessionId: params.session_id,
          found: false,
        },
        output: `Failed to retrieve session: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
})
