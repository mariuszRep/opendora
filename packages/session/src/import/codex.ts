/**
 * Codex (ChatGPT CLI) session importer.
 *
 * Reads a Codex rollout JSONL file (under .codex/sessions/) and materialises it as a
 * Projectflows session with MessageV2 messages and parts.
 *
 * Codex lays out a session as a sequence of typed records:
 *   - `session_meta`          — header with id, cwd, git, model, instructions
 *   - `turn_context`          — per-turn model/effort snapshot
 *   - `response_item`         — message | reasoning | function_call |
 *                               function_call_output | custom_tool_call |
 *                               custom_tool_call_output
 *   - `event_msg`             — lifecycle / UI mirror events (mostly dropped)
 *
 * Consecutive assistant-producing records (reasoning + function_call + message)
 * are merged into one Assistant message. Each user message is its own turn.
 * Function call outputs are matched to their preceding call by id and stored
 * as state transitions on the same ToolPart, matching Projectflows's tool model.
 */

import type { ImportOptions, ImportResult } from "./types"
import type { MessageV2 } from "../message-v2"
import {
  readJsonl,
  insertSessionRow,
  insertMessageRow,
  insertPartRow,
  newSessionID,
  newMessageID,
  newPartID,
} from "./util"
import { migrateSession } from "../graph-migration.ts"

// ─── Codex record shapes (loose) ─────────────────────────────────────────────

interface CodexLine {
  type: string
  timestamp?: string
  payload?: CodexPayload
}

type CodexPayload =
  | CodexSessionMeta
  | CodexTurnContext
  | CodexResponseItem
  | CodexEventMsg
  | { [k: string]: unknown }

interface CodexSessionMeta {
  id?: string
  timestamp?: string
  cwd?: string
  originator?: string
  cli_version?: string
  instructions?: string
  git?: { commit_hash?: string; branch?: string; repository_url?: string }
  base_instructions?: { text?: string }
}

interface CodexTurnContext {
  cwd?: string
  approval_policy?: string
  sandbox_policy?: unknown
  model?: string
  effort?: string
  summary?: string
  user_instructions?: string
  developer_instructions?: string | null
}

interface CodexResponseItem {
  type: "message" | "reasoning" | "function_call" | "function_call_output" | "custom_tool_call" | "custom_tool_call_output"
  id?: string
  role?: "user" | "assistant" | "developer" | "system" | "tool"
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>
  // reasoning
  summary?: Array<{ type: string; text: string }>
  encrypted_content?: string
  // function_call / custom_tool_call
  name?: string
  arguments?: string
  input?: string
  call_id?: string
  // function_call_output / custom_tool_call_output
  output?: unknown
}

interface CodexEventMsg {
  type: string
  reason?: string
  title?: string
  [k: string]: unknown
}

// ─── Importer ────────────────────────────────────────────────────────────────

export async function importCodexSession(options: ImportOptions): Promise<ImportResult> {
  const sessionID = options.sessionID ?? newSessionID()
  const agent = options.agent ?? "codex"
  const warnings: string[] = []

  const lines: CodexLine[] = []
  for await (const raw of readJsonl<CodexLine>(options.sourcePath)) lines.push(raw)

  // Header and state derived from the first session_meta + evolving turn_context.
  let nativeID: string | null = null
  let cwd: string | undefined
  let modelID = "unknown"
  let providerID = "openai"
  let reasoningEffort: string | undefined
  let title = "Imported Codex session"
  let firstTimestamp: number | undefined
  let lastTimestamp: number | undefined
  let baseInstructions: string | undefined

  for (const line of lines) {
    const ts = line.timestamp ? Date.parse(line.timestamp) : undefined
    if (ts && !Number.isNaN(ts)) {
      if (firstTimestamp === undefined || ts < firstTimestamp) firstTimestamp = ts
      if (lastTimestamp === undefined || ts > lastTimestamp) lastTimestamp = ts
    }
    if (line.type === "session_meta") {
      const meta = line.payload as CodexSessionMeta
      nativeID = meta.id ?? nativeID
      cwd = meta.cwd ?? cwd
      baseInstructions = meta.base_instructions?.text ?? meta.instructions
    }
    if (line.type === "turn_context") {
      const ctx = line.payload as CodexTurnContext
      if (ctx.model) modelID = ctx.model
      if (ctx.effort) reasoningEffort = ctx.effort
    }
    if (line.type === "event_msg") {
      const ev = line.payload as CodexEventMsg
      if (ev.type === "thread_name_updated" && typeof ev.title === "string") title = ev.title
    }
  }
  firstTimestamp ??= Date.now()
  lastTimestamp ??= firstTimestamp

  insertSessionRow({
    id: sessionID,
    projectID: options.projectID,
    vendor: "codex",
    nativeID,
    title,
    slug: options.slug ?? nativeID ?? sessionID,
    directory: options.directory ?? cwd ?? process.cwd(),
    timeCreated: firstTimestamp,
    timeUpdated: lastTimestamp,
    vendorRawHeader: {
      format: "codex-jsonl",
      modelID,
      providerID,
      reasoningEffort,
      baseInstructions,
      // Preserve the full stream of session_meta/turn_context/event_msg lines.
      auxiliary: lines.filter((l) => l.type !== "response_item"),
    },
  })

  // Current assistant message being accumulated. Flushed on the next user
  // message or at end of file. Parts are inserted eagerly so they remain
  // ordered; the assistant row is inserted before any of its parts.
  type CurrentAssistant = {
    messageID: string
    created: number
    parts: Array<{ part: MessageV2.Part; vendorRaw: unknown; timeCreated: number }>
    finished: boolean
  }
  let current: CurrentAssistant | null = null
  let messagesImported = 0
  let partsImported = 0
  let recordsSkipped = 0

  // Tool call tracking across response_items — call arrives first, output later.
  const toolPartByCallID = new Map<
    string,
    { part: MessageV2.ToolPart; assistant: CurrentAssistant; inserted: boolean }
  >()

  const flushAssistant = () => {
    if (!current) return
    if (current.parts.length === 0) {
      current = null
      return
    }
    const info: MessageV2.Assistant = {
      id: current.messageID,
      sessionID,
      role: "assistant",
      time: { created: current.created, completed: lastTimestamp ?? current.created },
      modelID,
      providerID,
      mode: "import",
      agent,
      path: { cwd: cwd ?? process.cwd(), root: cwd ?? process.cwd() },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }
    insertMessageRow({ sessionID, info, vendorRaw: null })
    messagesImported++
    for (const { part, vendorRaw, timeCreated } of current.parts) {
      insertPartRow({
        sessionID,
        messageID: current.messageID,
        part,
        vendorRaw,
        timeCreated,
        nativeID: part.type === "tool" ? part.callID : null,
      })
      partsImported++
    }
    current = null
  }

  const ensureCurrentAssistant = (ts: number): CurrentAssistant => {
    if (!current || current.finished) {
      current = {
        messageID: newMessageID(),
        created: ts,
        parts: [],
        finished: false,
      }
    }
    return current
  }

  for (const line of lines) {
    const ts = line.timestamp ? Date.parse(line.timestamp) : firstTimestamp
    if (line.type !== "response_item") continue
    const item = line.payload as CodexResponseItem

    switch (item.type) {
      case "message": {
        if (item.role === "user" || item.role === "developer") {
          flushAssistant()
          const messageID = newMessageID()
          const info: MessageV2.User = {
            id: messageID,
            sessionID,
            role: "user",
            time: { created: ts },
            agent: item.role === "developer" ? "developer" : agent,
            model: { providerID, modelID },
            system: item.role === "developer" ? textOf(item.content) : undefined,
          }
          insertMessageRow({ sessionID, info, nativeID: item.id ?? null, vendorRaw: line })
          messagesImported++
          const content = item.content ?? []
          for (const block of content) {
            if (block.type === "input_text" || block.type === "text") {
              const part: MessageV2.TextPart = {
                id: newPartID(),
                sessionID,
                messageID,
                type: "text",
                text: block.text ?? "",
              }
              insertPartRow({ sessionID, messageID, part, timeCreated: ts, vendorRaw: block })
              partsImported++
            } else if (block.type === "input_image") {
              const url = (block as any).image_url ?? ""
              const part: MessageV2.FilePart = {
                id: newPartID(),
                sessionID,
                messageID,
                type: "file",
                mime: "image/png",
                url,
              }
              insertPartRow({ sessionID, messageID, part, timeCreated: ts, vendorRaw: block })
              partsImported++
            } else {
              recordsSkipped++
            }
          }
        } else if (item.role === "assistant") {
          const ca = ensureCurrentAssistant(ts)
          const text = textOf(item.content)
          if (text) {
            const part: MessageV2.TextPart = {
              id: newPartID(),
              sessionID,
              messageID: ca.messageID,
              type: "text",
              text,
            }
            ca.parts.push({ part, vendorRaw: line, timeCreated: ts })
          }
        } else {
          recordsSkipped++
        }
        break
      }
      case "reasoning": {
        const ca = ensureCurrentAssistant(ts)
        const summaryText = (item.summary ?? []).map((s) => s.text).filter(Boolean).join("\n")
        const part: MessageV2.ReasoningPart = {
          id: newPartID(),
          sessionID,
          messageID: ca.messageID,
          type: "reasoning",
          text: summaryText,
          time: { start: ts, end: ts },
          metadata: item.encrypted_content ? { encrypted_content: item.encrypted_content } : undefined,
        }
        ca.parts.push({ part, vendorRaw: line, timeCreated: ts })
        break
      }
      case "function_call":
      case "custom_tool_call": {
        const ca = ensureCurrentAssistant(ts)
        const callID = item.call_id ?? item.id ?? ""
        let input: Record<string, unknown> = {}
        if (item.type === "function_call" && item.arguments) {
          try {
            input = JSON.parse(item.arguments) as Record<string, unknown>
          } catch {
            input = { raw: item.arguments }
          }
        } else if (item.type === "custom_tool_call") {
          input = { raw: item.input ?? "" }
        }
        const part: MessageV2.ToolPart = {
          id: newPartID(),
          sessionID,
          messageID: ca.messageID,
          type: "tool",
          callID,
          tool: item.name ?? "unknown",
          state: { status: "running", input, time: { start: ts } },
        }
        ca.parts.push({ part, vendorRaw: line, timeCreated: ts })
        toolPartByCallID.set(callID, { part, assistant: ca, inserted: true })
        break
      }
      case "function_call_output":
      case "custom_tool_call_output": {
        const callID = item.call_id ?? item.id ?? ""
        const entry = toolPartByCallID.get(callID)
        if (!entry) {
          recordsSkipped++
          break
        }
        const rawOutput = item.output
        const outputText = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput)
        const start =
          entry.part.state.status === "running" ? entry.part.state.time.start : ts
        entry.part.state = {
          status: "completed",
          input: entry.part.state.input,
          output: outputText,
          title: entry.part.tool,
          metadata: {},
          time: { start, end: ts },
        }
        toolPartByCallID.delete(callID)
        break
      }
      default:
        recordsSkipped++
    }
  }
  flushAssistant()

  if (toolPartByCallID.size > 0) {
    warnings.push(
      `${toolPartByCallID.size} function_call(s) without matching output; persisted in running state`,
    )
  }

  // Bypass writer — backfill entries/edges synchronously since migrateAllSessions()'s
  // one-shot marker won't pick this session up after the first server-start scan.
  await migrateSession(sessionID)

  return {
    vendor: "codex",
    sessionID,
    nativeID,
    messagesImported,
    partsImported,
    recordsSkipped,
    warnings,
  }
}

function textOf(content: CodexResponseItem["content"]): string {
  if (!content) return ""
  return content
    .map((b) => (typeof b.text === "string" ? b.text : ""))
    .filter(Boolean)
    .join("")
}
