import z from "zod"
import { Tool } from "../tool"
import { host } from "../host"
import toolDef from "./session-get.json"
import { MessageV2 } from "@opendora/session"

const parameters = z.object({
  session_id: z.string().describe("ID of the session to retrieve"),
  step_indices: z
    .array(z.number())
    .optional()
    .describe("Specific step indices from session_analyze.chain[].step. When set, only those steps are returned."),
  message_ids: z
    .array(z.string())
    .optional()
    .describe("Specific message IDs to retrieve. When set, only those messages are returned."),
  call_ids: z
    .array(z.string())
    .optional()
    .describe("Specific tool call IDs to retrieve. Returns a flat list of just those tool calls."),
  tool_names: z
    .array(z.string())
    .optional()
    .describe('Filter to tool calls whose tool name matches (e.g. ["webfetch", "read"]). Returns a flat list.'),
  tool_data: z
    .enum(["input", "output", "both"])
    .default("both")
    .describe('When returning tool calls, controls which fields are included.'),
  message_limit: z
    .number()
    .optional()
    .describe("When fetching the full conversation (no filters), return only the most recent N messages."),
  include_thinking: z.boolean().default(false).describe("Include reasoning/thinking blocks in returned messages."),
  include_tool_calls: z.boolean().default(true).describe("Include tool call parts in returned messages."),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional()
    .describe("Optional model context for media-aware formatting (Anthropic, OpenAI, Google)."),
})

type AnyMsg = { info: any; parts: any[]; id?: string }

/**
 * Build the same step index session_analyze produces, so the indices line up
 * exactly. A step is one of: user_message, assistant_text, reasoning, tool_call.
 */
function buildStepIndex(messages: AnyMsg[]) {
  const steps: Array<{
    step: number
    type: "user_message" | "assistant_text" | "reasoning" | "tool_call"
    message: AnyMsg
    part?: any
  }> = []
  let step = 0
  for (const msg of messages) {
    const role = msg.info?.role
    const parts = msg.parts ?? []
    if (role === "user") {
      steps.push({ step: step++, type: "user_message", message: msg })
      continue
    }
    if (role === "assistant") {
      for (const part of parts) {
        if (part.synthetic) continue
        if (part.type === "text") steps.push({ step: step++, type: "assistant_text", message: msg, part })
        else if (part.type === "reasoning") steps.push({ step: step++, type: "reasoning", message: msg, part })
        else if (part.type === "tool") steps.push({ step: step++, type: "tool_call", message: msg, part })
      }
    }
  }
  return steps
}

function projectToolCall(part: any, mode: "input" | "output" | "both") {
  const base = {
    tool: part.tool,
    call_id: part.callID,
    status: part.state?.status ?? null,
  }
  if (mode === "input") return { ...base, input: part.state?.input ?? null }
  if (mode === "output") {
    if (part.state?.status === "completed") return { ...base, output: part.state.output ?? null }
    if (part.state?.status === "error") return { ...base, error: part.state.error ?? null }
    return { ...base, output: null }
  }
  return {
    ...base,
    input: part.state?.input ?? null,
    output: part.state?.status === "completed" ? part.state.output ?? null : null,
    error: part.state?.status === "error" ? part.state.error ?? null : null,
  }
}

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
      metadata: { sessionId: params.session_id },
    })

    try {
      const session = await sessionSvc.get(params.session_id)
      if (!session) {
        return {
          title: "Session Not Found",
          metadata: { sessionId: params.session_id, mode: "none", count: 0, found: false },
          output: JSON.stringify({
            error: `Session '${params.session_id}' not found. Use session_search to find available sessions.`,
          }),
        }
      }

      const sessionInfo = {
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

      const messages: AnyMsg[] = (await sessionSvc.messages({ sessionID: params.session_id })) ?? []

      const usingToolFilter = (params.call_ids && params.call_ids.length > 0) || (params.tool_names && params.tool_names.length > 0)
      const usingStepFilter = params.step_indices && params.step_indices.length > 0
      const usingMessageFilter = params.message_ids && params.message_ids.length > 0

      // ── Tool-call filter mode ─────────────────────────────────────────────
      // Returns a flat list of tool calls — easiest format for "show me all
      // webfetch outputs" style queries.
      if (usingToolFilter) {
        const steps = buildStepIndex(messages)
        const callIdSet = new Set(params.call_ids ?? [])
        const toolNameSet = new Set(params.tool_names ?? [])
        const calls = steps
          .filter((s) => s.type === "tool_call")
          .filter((s) => {
            if (callIdSet.size > 0 && !callIdSet.has(s.part.callID)) return false
            if (toolNameSet.size > 0 && !toolNameSet.has(s.part.tool)) return false
            return true
          })
          .map((s) => ({
            step: s.step,
            message_id: s.message.info?.id ?? null,
            ...projectToolCall(s.part, params.tool_data),
          }))

        return {
          title: `Tool calls: ${session.title || params.session_id}`,
          metadata: { sessionId: session.id, mode: "tool_calls", count: calls.length, found: true },
          output: JSON.stringify({ session: sessionInfo, mode: "tool_calls", tool_data: params.tool_data, calls }, null, 2),
        }
      }

      // ── Step-index filter mode ────────────────────────────────────────────
      // Returns the specific steps requested, each in its native shape.
      if (usingStepFilter) {
        const steps = buildStepIndex(messages)
        const wanted = new Set(params.step_indices)
        const picked = steps.filter((s) => wanted.has(s.step))
        const out = picked.map((s) => {
          if (s.type === "user_message") {
            const text = (s.message.parts ?? [])
              .filter((p: any) => p.type === "text" && !p.ignored && !p.synthetic)
              .map((p: any) => p.text)
              .join("\n")
            return { step: s.step, type: s.type, message_id: s.message.info?.id, text }
          }
          if (s.type === "assistant_text") {
            return { step: s.step, type: s.type, message_id: s.message.info?.id, text: s.part.text }
          }
          if (s.type === "reasoning") {
            return { step: s.step, type: s.type, message_id: s.message.info?.id, text: s.part.text }
          }
          // tool_call
          return {
            step: s.step,
            type: s.type,
            message_id: s.message.info?.id,
            ...projectToolCall(s.part, params.tool_data),
          }
        })

        return {
          title: `Steps: ${session.title || params.session_id}`,
          metadata: { sessionId: session.id, mode: "steps", count: out.length, found: true },
          output: JSON.stringify({ session: sessionInfo, mode: "steps", steps: out }, null, 2),
        }
      }

      // ── Default: full conversation in agent format ────────────────────────
      let messagesToInclude = messages

      if (usingMessageFilter) {
        const wanted = new Set(params.message_ids)
        messagesToInclude = messages.filter((m) => wanted.has(m.info?.id))
      } else if (params.message_limit) {
        messagesToInclude = messages.slice(-params.message_limit)
      }

      // Strip parts the caller didn't ask for, before agent-format conversion.
      const trimmed = messagesToInclude.map((m) => ({
        ...m,
        parts: (m.parts ?? []).filter((p: any) => {
          if (p.type === "reasoning" && !params.include_thinking) return false
          if (p.type === "tool" && !params.include_tool_calls) return false
          return true
        }),
      }))

      const model = params.model ?? { providerID: "openai", modelID: "gpt-4" }
      const modelMessages = MessageV2.toModelMessages(trimmed, model)

      return {
        title: `Session: ${session.title || params.session_id}`,
        metadata: {
          sessionId: session.id,
          mode: usingMessageFilter ? "messages" : "conversation",
          count: modelMessages.length,
          found: true,
        },
        output: JSON.stringify(
          {
            session: sessionInfo,
            mode: usingMessageFilter ? "messages" : "conversation",
            messages: modelMessages,
            messagesMeta: {
              included: messagesToInclude.length,
              total: messages.length,
              truncated: !usingMessageFilter && params.message_limit ? messages.length > params.message_limit : false,
            },
          },
          null,
          2,
        ),
      }
    } catch (error) {
      return {
        title: "Session Retrieval Failed",
        metadata: { sessionId: params.session_id, mode: "error", count: 0, found: false },
        output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      }
    }
  },
})
