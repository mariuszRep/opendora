import z from "zod"
import { Tool } from "../tool"
import { host } from "../host"
import toolDef from "./session-analyze.json"

const parameters = z.object({
  session_id: z.string().describe("ID of the session to analyze"),
})

/**
 * A single entry in the session chain.
 *
 * Step types:
 *   - user_message     a turn authored by the user
 *   - assistant_text   a text block produced by the assistant
 *   - reasoning        a reasoning/thinking block produced by the assistant
 *   - tool_call        a single tool invocation (with input + output)
 *
 * Every step has a `step` index and a `ref` you can pass back to session_get
 * to retrieve its full content.
 */
type ChainStep = {
  step: number
  type: "user_message" | "assistant_text" | "reasoning" | "tool_call"
  message_id: string
  part_id?: string
  tool?: string
  call_id?: string
  tool_status?: "completed" | "error" | "pending" | "running"
  timestamp: number | null
}

export const SessionAnalyzeTool = Tool.define("session_analyze", {
  description: toolDef.description,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")

    await ctx.ask({
      permission: "session_analyze",
      patterns: [],
      always: ["*"],
      metadata: { sessionId: params.session_id },
    })

    try {
      const session = await sessionSvc.get(params.session_id)
      if (!session) {
        return {
          title: "Session Not Found",
          metadata: {
            sessionId: params.session_id,
            totalSteps: 0,
            totalToolCalls: 0,
            uniqueTools: 0,
            found: false,
          },
          output: JSON.stringify({
            error: `Session '${params.session_id}' not found. Use session_search to find available sessions.`,
          }),
        }
      }

      const messages = (await sessionSvc.messages({ sessionID: params.session_id })) ?? []

      const chain: ChainStep[] = []
      const toolCounts: Record<string, number> = {}
      const toolErrorCounts: Record<string, number> = {}
      const errorSteps: number[] = []
      const interruptedSteps: number[] = []
      let userCount = 0
      let assistantCount = 0
      let toolCallTotal = 0
      let toolErrorTotal = 0
      let toolInterruptedTotal = 0
      let messageWithErrorCount = 0
      let step = 0

      for (const msg of messages) {
        const info = msg.info ?? {}
        const role = info.role
        const messageId = info.id ?? msg.id ?? ""
        const timestamp = info.time?.created ?? null
        const parts = (msg.parts ?? []) as any[]

        if (role === "user") {
          userCount++
          // Treat each user message as a single step (its parts are usually a single text + files)
          chain.push({
            step: step++,
            type: "user_message",
            message_id: messageId,
            timestamp,
          })
          continue
        }

        if (role === "assistant") {
          assistantCount++
          if (info.error) messageWithErrorCount++
          for (const part of parts) {
            if (part.synthetic) continue
            if (part.type === "text") {
              chain.push({
                step: step++,
                type: "assistant_text",
                message_id: messageId,
                part_id: part.id,
                timestamp,
              })
            } else if (part.type === "reasoning") {
              chain.push({
                step: step++,
                type: "reasoning",
                message_id: messageId,
                part_id: part.id,
                timestamp,
              })
            } else if (part.type === "tool") {
              toolCallTotal++
              toolCounts[part.tool] = (toolCounts[part.tool] ?? 0) + 1
              const status = part.state?.status
              const currentStep = step
              if (status === "error") {
                toolErrorTotal++
                toolErrorCounts[part.tool] = (toolErrorCounts[part.tool] ?? 0) + 1
                errorSteps.push(currentStep)
              } else if (status === "pending" || status === "running") {
                toolInterruptedTotal++
                interruptedSteps.push(currentStep)
              }
              chain.push({
                step: step++,
                type: "tool_call",
                message_id: messageId,
                part_id: part.id,
                tool: part.tool,
                call_id: part.callID,
                tool_status: status,
                timestamp,
              })
            }
          }
        }
      }

      const summary = {
        total_messages: messages.length,
        user_messages: userCount,
        assistant_messages: assistantCount,
        assistant_messages_with_error: messageWithErrorCount,
        total_steps: chain.length,
        total_tool_calls: toolCallTotal,
        failed_tool_calls: toolErrorTotal,
        interrupted_tool_calls: toolInterruptedTotal,
        unique_tools: Object.keys(toolCounts).length,
        tools_used: toolCounts,
        tools_failed: toolErrorCounts,
        error_step_indices: errorSteps,
        interrupted_step_indices: interruptedSteps,
      }

      const output = {
        session: {
          id: session.id,
          title: session.title || null,
          type: session.sessionType || null,
          status: session.sessionStatus || null,
          agentId: session.agentID || null,
          created: session.time?.created ?? null,
          updated: session.time?.updated ?? null,
        },
        summary,
        chain,
        next_steps:
          "Use session_get with `step_indices`, `call_ids`, `message_ids`, or `tool_names` to fetch the actual content of any step listed above.",
      }

      return {
        title: `Analyze: ${session.title || params.session_id}`,
        metadata: {
          sessionId: session.id,
          totalSteps: chain.length,
          totalToolCalls: toolCallTotal,
          uniqueTools: Object.keys(toolCounts).length,
          found: true,
        },
        output: JSON.stringify(output, null, 2),
      }
    } catch (error) {
      return {
        title: "Session Analysis Failed",
        metadata: {
          sessionId: params.session_id,
          totalSteps: 0,
          totalToolCalls: 0,
          uniqueTools: 0,
          found: false,
        },
        output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      }
    }
  },
})
