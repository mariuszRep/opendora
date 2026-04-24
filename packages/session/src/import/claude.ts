/**
 * Claude Code session importer.
 *
 * Reads a `.claude/projects/<slug>/<sessionId>.jsonl` rollout and materialises
 * it as an opendora session with MessageV2 messages and parts.
 *
 * Scope (v1):
 *   - user and assistant messages with text, thinking, tool_use, tool_result,
 *     image content blocks.
 *   - session-level title from `ai-title` records.
 *   - every record is preserved verbatim in `vendor_raw` / `vendor_raw_header`.
 *
 * Out of scope for this pass (kept on disk via vendor_raw_header on the
 * session but not surfaced as structured parts):
 *   - system/compact_boundary, attachment/deferred_tools_delta,
 *     queue-operation, file-history-snapshot, last-prompt.
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

// ─── Claude record shapes (loose) ────────────────────────────────────────────

interface ClaudeLine {
  type: string
  uuid?: string
  parentUuid?: string | null
  timestamp?: string
  sessionId?: string
  cwd?: string
  gitBranch?: string
  version?: string
  message?: {
    role?: "user" | "assistant"
    model?: string
    content?: Array<ClaudeContentBlock | string>
  }
  toolUseResult?: unknown
  // ai-title / attachment / system / ...
  title?: string
  attachment?: { type?: string; [k: string]: unknown }
  subtype?: string
  compactMetadata?: unknown
}

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "redacted_thinking"; data: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: "image"; source: { type: string; media_type?: string; data?: string; url?: string } }

// ─── Importer ────────────────────────────────────────────────────────────────

export async function importClaudeSession(options: ImportOptions): Promise<ImportResult> {
  const sessionID = options.sessionID ?? newSessionID()
  const agent = options.agent ?? "claude"
  const warnings: string[] = []

  // First pass: collect all lines so we can resolve tool_use → tool_result
  // references before writing rows.
  const lines: ClaudeLine[] = []
  for await (const raw of readJsonl<ClaudeLine>(options.sourcePath)) lines.push(raw)

  // Header-level metadata
  let nativeID: string | null = null
  let title = "Imported Claude session"
  let cwd: string | undefined
  let firstTimestamp: number | undefined
  let lastTimestamp: number | undefined
  let modelID: string | undefined

  for (const line of lines) {
    if (!nativeID && line.sessionId) nativeID = line.sessionId
    if (!cwd && line.cwd) cwd = line.cwd
    if (line.type === "ai-title" && typeof line.title === "string") title = line.title
    if (line.message?.model) modelID = line.message.model
    const ts = line.timestamp ? Date.parse(line.timestamp) : undefined
    if (ts && !Number.isNaN(ts)) {
      if (firstTimestamp === undefined || ts < firstTimestamp) firstTimestamp = ts
      if (lastTimestamp === undefined || ts > lastTimestamp) lastTimestamp = ts
    }
  }
  firstTimestamp ??= Date.now()
  lastTimestamp ??= firstTimestamp

  insertSessionRow({
    id: sessionID,
    projectID: options.projectID,
    vendor: "claude",
    nativeID,
    title,
    slug: options.slug ?? nativeID ?? sessionID,
    directory: options.directory ?? cwd ?? process.cwd(),
    timeCreated: firstTimestamp,
    timeUpdated: lastTimestamp,
    // Preserve every non-message line in the header blob so nothing is lost.
    vendorRawHeader: {
      format: "claude-code-jsonl",
      auxiliary: lines.filter(
        (l) =>
          l.type !== "user" && l.type !== "assistant",
      ),
    },
  })

  // Build an index from Claude tool_use.id → the assistant ToolPart we create
  // for it, so a following user message carrying only tool_result entries can
  // update the part in-place.
  const toolPartByCallID = new Map<
    string,
    { part: MessageV2.Part & { type: "tool" }; messageID: string; insert: () => void }
  >()

  let messagesImported = 0
  let partsImported = 0
  let recordsSkipped = 0

  for (const line of lines) {
    const ts = line.timestamp ? Date.parse(line.timestamp) : firstTimestamp
    const content = line.message?.content ?? []

    if (line.type === "assistant") {
      const messageID = newMessageID()
      const info: MessageV2.Assistant = {
        id: messageID,
        sessionID,
        role: "assistant",
        time: { created: ts, completed: ts },
        parentID: undefined,
        modelID: line.message?.model ?? modelID ?? "unknown",
        providerID: "anthropic",
        mode: "import",
        agent,
        path: { cwd: cwd ?? process.cwd(), root: cwd ?? process.cwd() },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      }
      insertMessageRow({ sessionID, info, nativeID: line.uuid ?? null, vendorRaw: line })
      messagesImported++

      for (const block of content) {
        if (typeof block === "string") {
          const part: MessageV2.TextPart = {
            id: newPartID(),
            sessionID,
            messageID,
            type: "text",
            text: block,
          }
          insertPartRow({ sessionID, messageID, part, timeCreated: ts })
          partsImported++
          continue
        }
        switch (block.type) {
          case "text": {
            const part: MessageV2.TextPart = {
              id: newPartID(),
              sessionID,
              messageID,
              type: "text",
              text: block.text,
            }
            insertPartRow({ sessionID, messageID, part, timeCreated: ts, vendorRaw: block })
            partsImported++
            break
          }
          case "thinking": {
            const part: MessageV2.ReasoningPart = {
              id: newPartID(),
              sessionID,
              messageID,
              type: "reasoning",
              text: block.thinking,
              time: { start: ts, end: ts },
              metadata: block.signature ? { signature: block.signature } : undefined,
            }
            insertPartRow({ sessionID, messageID, part, timeCreated: ts, vendorRaw: block })
            partsImported++
            break
          }
          case "redacted_thinking": {
            const part: MessageV2.ReasoningPart = {
              id: newPartID(),
              sessionID,
              messageID,
              type: "reasoning",
              text: "",
              time: { start: ts, end: ts },
              metadata: { redacted: true, data: block.data },
            }
            insertPartRow({ sessionID, messageID, part, timeCreated: ts, vendorRaw: block })
            partsImported++
            break
          }
          case "tool_use": {
            const part: MessageV2.ToolPart = {
              id: newPartID(),
              sessionID,
              messageID,
              type: "tool",
              callID: block.id,
              tool: block.name,
              state: {
                status: "running",
                input: (block.input ?? {}) as Record<string, unknown>,
                time: { start: ts },
              },
            }
            toolPartByCallID.set(block.id, {
              part,
              messageID,
              insert: () =>
                insertPartRow({
                  sessionID,
                  messageID,
                  part,
                  timeCreated: ts,
                  nativeID: block.id,
                  vendorRaw: block,
                }),
            })
            // Deferred insert — may be rewritten to completed state once the
            // result arrives on a subsequent user message.
            break
          }
          default:
            recordsSkipped++
        }
      }
    } else if (line.type === "user") {
      // Claude user messages can carry either real user text/images or merely
      // tool_results. We only create an opendora User row for the former.
      const userBlocks = content.filter(
        (b) => typeof b === "string" || (b as ClaudeContentBlock).type !== "tool_result",
      ) as Array<ClaudeContentBlock | string>
      const toolResultBlocks = content.filter(
        (b) => typeof b !== "string" && (b as ClaudeContentBlock).type === "tool_result",
      ) as Array<Extract<ClaudeContentBlock, { type: "tool_result" }>>

      // Merge tool_results into the deferred ToolParts created on the
      // assistant side.
      for (const result of toolResultBlocks) {
        const entry = toolPartByCallID.get(result.tool_use_id)
        if (!entry) {
          recordsSkipped++
          continue
        }
        const output = typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content)
        entry.part.state = result.is_error
          ? {
              status: "error",
              input: entry.part.state.input,
              error: output,
              time: {
                start: entry.part.state.status === "running" ? entry.part.state.time.start : ts,
                end: ts,
              },
            }
          : {
              status: "completed",
              input: entry.part.state.input,
              output,
              title: entry.part.tool,
              metadata: {},
              time: {
                start: entry.part.state.status === "running" ? entry.part.state.time.start : ts,
                end: ts,
              },
            }
        entry.insert()
        toolPartByCallID.delete(result.tool_use_id)
        partsImported++
      }

      if (userBlocks.length === 0) {
        // Pure tool-result carrier — no user turn to record.
        continue
      }

      const messageID = newMessageID()
      const info: MessageV2.User = {
        id: messageID,
        sessionID,
        role: "user",
        time: { created: ts },
        agent,
        model: { providerID: "anthropic", modelID: modelID ?? "unknown" },
      }
      insertMessageRow({ sessionID, info, nativeID: line.uuid ?? null, vendorRaw: line })
      messagesImported++

      for (const block of userBlocks) {
        if (typeof block === "string") {
          const part: MessageV2.TextPart = {
            id: newPartID(),
            sessionID,
            messageID,
            type: "text",
            text: block,
          }
          insertPartRow({ sessionID, messageID, part, timeCreated: ts })
          partsImported++
          continue
        }
        switch (block.type) {
          case "text": {
            const part: MessageV2.TextPart = {
              id: newPartID(),
              sessionID,
              messageID,
              type: "text",
              text: block.text,
            }
            insertPartRow({ sessionID, messageID, part, timeCreated: ts, vendorRaw: block })
            partsImported++
            break
          }
          case "image": {
            const src = block.source ?? ({} as any)
            const url = src.type === "base64" && src.data
              ? `data:${src.media_type ?? "image/png"};base64,${src.data}`
              : src.url ?? ""
            const part: MessageV2.FilePart = {
              id: newPartID(),
              sessionID,
              messageID,
              type: "file",
              mime: src.media_type ?? "image/png",
              url,
            }
            insertPartRow({ sessionID, messageID, part, timeCreated: ts, vendorRaw: block })
            partsImported++
            break
          }
          default:
            recordsSkipped++
        }
      }
    }
    // Non-user/assistant lines are preserved in vendor_raw_header above.
  }

  // Any tool_use that never got a result — persist as-is in its running state.
  for (const entry of toolPartByCallID.values()) {
    entry.insert()
    partsImported++
    warnings.push(`tool_use without matching tool_result: ${entry.part.callID}`)
  }

  return {
    vendor: "claude",
    sessionID,
    nativeID,
    messagesImported,
    partsImported,
    recordsSkipped,
    warnings,
  }
}
