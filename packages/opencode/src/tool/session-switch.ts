import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./session-switch.txt"
import { Session } from "../session"

const parameters = z
  .object({
    session_id: z.string().describe("Target session ID to switch to"),
    verify_session: z.boolean().optional().default(true).describe("Verify session exists before switching"),
    context_message: z.string().optional().describe("Optional message to send when switching context"),
  })

export const SessionSwitchTool = Tool.define("session_switch", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    try {
      // Verify session exists if requested
      let targetSession: Session.Info | null = null
      if (params.verify_session) {
        targetSession = await Session.get(params.session_id)
        if (!targetSession) {
          return {
            title: "Session Switch Failed",
            metadata: { 
              sessionId: params.session_id, 
              found: false,
              success: false
            },
            output: `Cannot switch to session '${params.session_id}': session not found.`,
          }
        }
      }

      // Prepare context information
      const currentContext = {
        currentSessionId: ctx.sessionID,
        targetSessionId: params.session_id,
        timestamp: Date.now(),
      }

      let output = [
        `Session Switch Initiated`,
        `=====================`,
        `From: ${ctx.sessionID}`,
        `To: ${params.session_id}`,
        `Time: ${new Date(currentContext.timestamp).toLocaleString()}`,
      ]

      if (targetSession) {
        output.push("")
        output.push("Target Session Details:")
        output.push(`- Title: ${targetSession.title || "(unnamed)"}`)
        output.push(`- Type: ${targetSession.sessionType}`)
        output.push(`- Status: ${targetSession.sessionStatus}`)
        output.push(`- Agent: ${targetSession.agentID || "(none)"}`)
        output.push(`- Messages: ${targetSession.messageCount || 0}`)
        output.push(`- Directory: ${targetSession.directory || "(none)"}`)
      }

      output.push("")
      output.push("Next steps:")
      output.push(`1. Use session_search tool to verify session details`)
      output.push(`2. Use delegate tool with session_id="${params.session_id}" to send messages`)
      output.push(`3. Current session context preserved for reference`)

      if (params.context_message) {
        output.push("")
        output.push(`Context Message: ${params.context_message}`)
      }

      return {
        title: `Session Switch: ${ctx.sessionID} → ${params.session_id}`,
        metadata: { 
          ...currentContext,
          found: !!targetSession,
          success: true,
          targetSessionType: targetSession?.sessionType,
          targetAgentId: targetSession?.agentID,
        },
        output: output.join("\n"),
      }

    } catch (error) {
      return {
        title: "Session Switch Failed",
        metadata: { 
          sessionId: params.session_id, 
          error: error instanceof Error ? error.message : String(error),
          success: false
        },
        output: `Failed to switch to session '${params.session_id}': ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  },
})
