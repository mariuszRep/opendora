import z from "zod"
import { NamedError } from "@projectflows/util/error"
import { APICallError, convertToModelMessages, LoadAPIKeyError, type ModelMessage, type UIMessage } from "ai"
import { getConfig } from "./config"
import { EntriesTable, EdgesTable } from "./session.sql"
import { eq, and, asc, desc, inArray } from "drizzle-orm"

// TODO: type when BusEvent is migrated — use minimal inline definition
function defineBusEvent<Type extends string>(type: Type, properties: z.ZodType<any>) {
  return { type, properties }
}

// Inline iife utility
function iife<T>(fn: () => T): T {
  return fn()
}

// Inline fn validator utility
function fn<Input, Output>(schema: z.ZodType<Input>, handler: (input: Input) => Output): (input: Input) => Output {
  return (input: Input) => {
    schema.parse(input)
    return handler(input)
  }
}

// Identifier schema helper — inlined to avoid importing from tools
const Identifier = {
  schema(prefix: string) {
    return z.string().startsWith(prefix + "_")
  },
  ascending(prefix: string): string {
    const now = Date.now()
    return `${prefix}_${now.toString(16).padStart(12, "0")}${Math.random().toString(36).slice(2, 14)}`
  },
}

// LSP.Range — inlined to avoid importing LSP
const LSP = {
  Range: z.object({
    start: z.object({ line: z.number(), character: z.number() }),
    end: z.object({ line: z.number(), character: z.number() }),
  }),
}

// Snapshot.FileDiff — used only as z.any() since Snapshot is opencode-specific
const SnapshotFileDiff = z.any()

// SystemError type
type SystemError = Error & { code?: string; syscall?: string }

export namespace MessageV2 {
  export const Actor = z
    .object({
      kind: z.enum(["user", "agent", "workflow", "scheduler"]),
      id: z.string(),
    })
    .meta({
      ref: "Actor",
    })
  export type Actor = z.infer<typeof Actor>

  export const OutputLengthError = NamedError.create("MessageOutputLengthError", z.object({}))
  export const AbortedError = NamedError.create("MessageAbortedError", z.object({ message: z.string() }))
  export const StructuredOutputError = NamedError.create(
    "StructuredOutputError",
    z.object({
      message: z.string(),
      retries: z.number(),
    }),
  )
  export const AuthError = NamedError.create(
    "ProviderAuthError",
    z.object({
      providerID: z.string(),
      message: z.string(),
    }),
  )
  export const APIError = NamedError.create(
    "APIError",
    z.object({
      message: z.string(),
      statusCode: z.number().optional(),
      isRetryable: z.boolean(),
      responseHeaders: z.record(z.string(), z.string()).optional(),
      responseBody: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  )
  export type APIError = z.infer<typeof APIError.Schema>
  export const ContextOverflowError = NamedError.create(
    "ContextOverflowError",
    z.object({ message: z.string(), responseBody: z.string().optional() }),
  )

  export const OutputFormatText = z
    .object({
      type: z.literal("text"),
      toolChoice: z.enum(["auto", "required", "none"]).optional(),
    })
    .meta({
      ref: "OutputFormatText",
    })

  export const OutputFormatJsonSchema = z
    .object({
      type: z.literal("json_schema"),
      schema: z.record(z.string(), z.any()).meta({ ref: "JSONSchema" }),
      retryCount: z.number().int().min(0).default(2),
      /** Override the tool name the model must call (defaults to "StructuredOutput"). */
      toolName: z.string().optional(),
    })
    .meta({
      ref: "OutputFormatJsonSchema",
    })

  export const Format = z.discriminatedUnion("type", [OutputFormatText, OutputFormatJsonSchema]).meta({
    ref: "OutputFormat",
  })
  export type OutputFormat = z.infer<typeof Format>

  const PartBase = z.object({
    id: z.string(),
    sessionID: z.string(),
    messageID: z.string(),
  })

  export const SnapshotPart = PartBase.extend({
    type: z.literal("snapshot"),
    snapshot: z.string(),
  }).meta({
    ref: "SnapshotPart",
  })
  export type SnapshotPart = z.infer<typeof SnapshotPart>

  export const PatchPart = PartBase.extend({
    type: z.literal("patch"),
    hash: z.string(),
    files: z.string().array(),
  }).meta({
    ref: "PatchPart",
  })
  export type PatchPart = z.infer<typeof PatchPart>

  export const TextPart = PartBase.extend({
    type: z.literal("text"),
    text: z.string(),
    synthetic: z.boolean().optional(),
    hidden: z.boolean().optional(),
    ignored: z.boolean().optional(),
    time: z
      .object({
        start: z.number(),
        end: z.number().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }).meta({
    ref: "TextPart",
  })
  export type TextPart = z.infer<typeof TextPart>

  export const ReasoningPart = PartBase.extend({
    type: z.literal("reasoning"),
    text: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
    time: z.object({
      start: z.number(),
      end: z.number().optional(),
    }),
  }).meta({
    ref: "ReasoningPart",
  })
  export type ReasoningPart = z.infer<typeof ReasoningPart>

  const FilePartSourceBase = z.object({
    text: z
      .object({
        value: z.string(),
        start: z.number().int(),
        end: z.number().int(),
      })
      .meta({
        ref: "FilePartSourceText",
      }),
  })

  export const FileSource = FilePartSourceBase.extend({
    type: z.literal("file"),
    path: z.string(),
  }).meta({
    ref: "FileSource",
  })

  export const SymbolSource = FilePartSourceBase.extend({
    type: z.literal("symbol"),
    path: z.string(),
    range: LSP.Range,
    name: z.string(),
    kind: z.number().int(),
  }).meta({
    ref: "SymbolSource",
  })

  export const ResourceSource = FilePartSourceBase.extend({
    type: z.literal("resource"),
    clientName: z.string(),
    uri: z.string(),
  }).meta({
    ref: "ResourceSource",
  })

  export const FilePartSource = z.discriminatedUnion("type", [FileSource, SymbolSource, ResourceSource]).meta({
    ref: "FilePartSource",
  })

  export const FilePart = PartBase.extend({
    type: z.literal("file"),
    mime: z.string(),
    filename: z.string().optional(),
    url: z.string(),
    source: FilePartSource.optional(),
  }).meta({
    ref: "FilePart",
  })
  export type FilePart = z.infer<typeof FilePart>

  export const AgentPart = PartBase.extend({
    type: z.literal("agent"),
    name: z.string(),
    source: z
      .object({
        value: z.string(),
        start: z.number().int(),
        end: z.number().int(),
      })
      .optional(),
  }).meta({
    ref: "AgentPart",
  })
  export type AgentPart = z.infer<typeof AgentPart>

  export const CompactionPart = PartBase.extend({
    type: z.literal("compaction"),
    auto: z.boolean(),
  }).meta({
    ref: "CompactionPart",
  })
  export type CompactionPart = z.infer<typeof CompactionPart>

  export const SubtaskPart = PartBase.extend({
    type: z.literal("subtask"),
    prompt: z.string(),
    description: z.string(),
    agent: z.string(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    command: z.string().optional(),
  }).meta({
    ref: "SubtaskPart",
  })
  export type SubtaskPart = z.infer<typeof SubtaskPart>

  export const RetryPart = PartBase.extend({
    type: z.literal("retry"),
    attempt: z.number(),
    error: APIError.Schema,
    time: z.object({
      created: z.number(),
    }),
  }).meta({
    ref: "RetryPart",
  })
  export type RetryPart = z.infer<typeof RetryPart>

  export const FallbackSwitchPart = PartBase.extend({
    type: z.literal("fallback-switch"),
    previousSlot: z.object({ providerID: z.string(), modelID: z.string() }),
    newSlot: z.object({ providerID: z.string(), modelID: z.string() }),
    groupID: z.string(),
    resetAt: z.number().nullable(),
    statusCode: z.number().optional(),
    time: z.object({ created: z.number() }),
  }).meta({
    ref: "FallbackSwitchPart",
  })
  export type FallbackSwitchPart = z.infer<typeof FallbackSwitchPart>

  export const StepStartPart = PartBase.extend({
    type: z.literal("step-start"),
    snapshot: z.string().optional(),
  }).meta({
    ref: "StepStartPart",
  })
  export type StepStartPart = z.infer<typeof StepStartPart>

  export const StepFinishPart = PartBase.extend({
    type: z.literal("step-finish"),
    reason: z.string(),
    summary: z.boolean().optional(),
    schedule_id: z.string().optional(),
    cost: z.number(),
    tokens: z.object({
      total: z.number().optional(),
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    }),
  }).meta({
    ref: "StepFinishPart",
  })
  export type StepFinishPart = z.infer<typeof StepFinishPart>

  export const ToolStatePending = z
    .object({
      status: z.literal("pending"),
      input: z.record(z.string(), z.any()),
      raw: z.string(),
    })
    .meta({
      ref: "ToolStatePending",
    })

  export type ToolStatePending = z.infer<typeof ToolStatePending>

  export const ToolStateRunning = z
    .object({
      status: z.literal("running"),
      input: z.record(z.string(), z.any()),
      title: z.string().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
      time: z.object({
        start: z.number(),
      }),
    })
    .meta({
      ref: "ToolStateRunning",
    })
  export type ToolStateRunning = z.infer<typeof ToolStateRunning>

  export const ToolStateCompleted = z
    .object({
      status: z.literal("completed"),
      input: z.record(z.string(), z.any()),
      output: z.string(),
      title: z.string(),
      metadata: z.record(z.string(), z.any()),
      time: z.object({
        start: z.number(),
        end: z.number(),
        compacted: z.number().optional(),
      }),
      attachments: FilePart.array().optional(),
    })
    .meta({
      ref: "ToolStateCompleted",
    })
  export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>

  export const ToolStateError = z
    .object({
      status: z.literal("error"),
      input: z.record(z.string(), z.any()),
      error: z.string(),
      metadata: z.record(z.string(), z.any()).optional(),
      time: z.object({
        start: z.number(),
        end: z.number(),
      }),
    })
    .meta({
      ref: "ToolStateError",
    })
  export type ToolStateError = z.infer<typeof ToolStateError>

  export const ToolState = z
    .discriminatedUnion("status", [ToolStatePending, ToolStateRunning, ToolStateCompleted, ToolStateError])
    .meta({
      ref: "ToolState",
    })

  export const ToolPart = PartBase.extend({
    type: z.literal("tool"),
    callID: z.string(),
    tool: z.string(),
    state: ToolState,
    metadata: z.record(z.string(), z.any()).optional(),
  }).meta({
    ref: "ToolPart",
  })
  export type ToolPart = z.infer<typeof ToolPart>

  const Base = z.object({
    id: z.string(),
    sessionID: z.string(),
  })

  export const User = Base.extend({
    role: z.literal("user"),
    from: Actor.optional(),
    time: z.object({
      created: z.number(),
    }),
    format: Format.optional(),
    summary: z
      .object({
        title: z.string().optional(),
        body: z.string().optional(),
        diffs: SnapshotFileDiff.array(),
      })
      .optional(),
    agent: z.string(),
    model: z.object({
      providerID: z.string(),
      modelID: z.string(),
    }),
    system: z.string().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    variant: z.string().optional(),
    schedule_id: z.string().optional(),
    hidden: z.boolean().optional(),
    queue: z
      .object({
        status: z.enum(["queued", "processing"]),
        submittedAt: z.number(),
        activatedAt: z.number().optional(),
        activateRequested: z.boolean().optional(),
      })
      .optional(),
  }).meta({
    ref: "UserMessage",
  })
  export type User = z.infer<typeof User>

  export const Part = z
    .discriminatedUnion("type", [
      TextPart,
      SubtaskPart,
      ReasoningPart,
      FilePart,
      ToolPart,
      StepStartPart,
      StepFinishPart,
      SnapshotPart,
      PatchPart,
      AgentPart,
      RetryPart,
      CompactionPart,
      FallbackSwitchPart,
    ])
    .meta({
      ref: "Part",
    })
  export type Part = z.infer<typeof Part>

  export const Assistant = Base.extend({
    role: z.literal("assistant"),
    from: Actor.optional(),
    time: z.object({
      created: z.number(),
      completed: z.number().optional(),
    }),
    error: z
      .discriminatedUnion("name", [
        AuthError.Schema,
        NamedError.Unknown.Schema,
        OutputLengthError.Schema,
        AbortedError.Schema,
        StructuredOutputError.Schema,
        ContextOverflowError.Schema,
        APIError.Schema,
      ])
      .optional(),
    parentID: z.string().optional(),
    modelID: z.string(),
    providerID: z.string(),
    /**
     * @deprecated
     */
    mode: z.string(),
    agent: z.string(),
    path: z.object({
      cwd: z.string(),
      root: z.string(),
    }),
    summary: z.boolean().optional(),
    schedule_id: z.string().optional(),
    cost: z.number(),
    tokens: z.object({
      total: z.number().optional(),
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    }),
    structured: z.any().optional(),
    variant: z.string().optional(),
    finish: z.string().optional(),
    hidden: z.boolean().optional(),
    workflowMeta: z
      .object({
        workflowID: z.string(),
        workflowRunID: z.string(),
        nodeID: z.string().optional(),
        nodeType: z.string().optional(),
        nodeLabel: z.string().optional(),
        attempt: z.number().optional(),
      })
      .optional(),
  }).meta({
    ref: "AssistantMessage",
  })
  export type Assistant = z.infer<typeof Assistant>

  export const Info = z.discriminatedUnion("role", [User, Assistant]).meta({
    ref: "Message",
  })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: defineBusEvent(
      "message.updated",
      z.object({
        info: Info,
      }),
    ),
    Removed: defineBusEvent(
      "message.removed",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
      }),
    ),
    PartUpdated: defineBusEvent(
      "message.part.updated",
      z.object({
        part: Part,
      }),
    ),
    PartDelta: defineBusEvent(
      "message.part.delta",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
        partID: z.string(),
        field: z.string(),
        delta: z.string(),
        seq: z.number(),
      }),
    ),
    PartRemoved: defineBusEvent(
      "message.part.removed",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
        partID: z.string(),
      }),
    ),
  }

  export const WithParts = z.object({
    info: Info,
    parts: z.array(Part),
  })
  export type WithParts = z.infer<typeof WithParts>

  /**
   * Convert messages to model messages for the AI SDK.
   * TODO: type Provider.Model when Provider is migrated — use `any` for now.
   */
  export function toModelMessages(input: WithParts[], model: any): ModelMessage[] {
    const result: UIMessage[] = []
    const toolNames = new Set<string>()
    const attributionPrefix = (info: MessageV2.Info) => {
      if (!info.from?.id) return ""
      if (info.from.kind === "user") return `user: ${info.from.id}\n\n`
      if (info.role === "assistant" && info.from.kind === "agent" && info.from.id === info.agent) return ""
      return `[${info.from.kind}:${info.from.id}] `
    }
    const supportsMediaInToolResults = (() => {
      if (model.api?.npm === "@ai-sdk/anthropic") return true
      if (model.api?.npm === "@ai-sdk/openai") return true
      if (model.api?.npm === "@ai-sdk/amazon-bedrock") return true
      if (model.api?.npm === "@ai-sdk/google-vertex/anthropic") return true
      if (model.api?.npm === "@ai-sdk/google") {
        const id = model.api.id.toLowerCase()
        return id.includes("gemini-3") && !id.includes("gemini-2")
      }
      return false
    })()

    const toModelOutput = (output: unknown) => {
      if (typeof output === "string") {
        return { type: "text", value: output }
      }
      if (typeof output === "object") {
        const outputObject = output as {
          text: string
          attachments?: Array<{ mime: string; url: string }>
        }
        const attachments = (outputObject.attachments ?? []).filter((attachment) => {
          return attachment.url.startsWith("data:") && attachment.url.includes(",")
        })
        return {
          type: "content",
          value: [
            { type: "text", text: outputObject.text },
            ...attachments.map((attachment) => ({
              type: "media",
              mediaType: attachment.mime,
              data: iife(() => {
                const commaIndex = attachment.url.indexOf(",")
                return commaIndex === -1 ? attachment.url : attachment.url.slice(commaIndex + 1)
              }),
            })),
          ],
        }
      }
      return { type: "json", value: output as never }
    }

    for (const msg of input) {
      if (msg.parts.length === 0) continue

      if (msg.info.role === "user") {
        const prefix = attributionPrefix(msg.info)
        const userMessage: UIMessage = {
          id: msg.info.id,
          role: "user",
          parts: [],
        }
        result.push(userMessage)
        for (const part of msg.parts) {
          if (part.type === "text" && !part.ignored)
            userMessage.parts.push({ type: "text", text: prefix + part.text })
          if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory")
            userMessage.parts.push({ type: "file", url: part.url, mediaType: part.mime, filename: part.filename })
          if (part.type === "compaction")
            userMessage.parts.push({ type: "text", text: prefix + "What did we do so far?" })
          if (part.type === "subtask")
            userMessage.parts.push({ type: "text", text: prefix + "The following tool was executed by the user" })
        }
      }

      if (msg.info.role === "assistant") {
        // Skip workflow-runner messages that have a running/pending tool — these are the
        // currently-executing workflow node and should not appear in the model's context
        // as "[Tool execution was interrupted]" noise. Completed workflow tools are kept.
        if (
          msg.info.providerID === "workflow" &&
          msg.parts.some((p) => p.type === "tool" && (p.state.status === "running" || p.state.status === "pending"))
        ) {
          continue
        }

        const differentModel = `${model.providerID}/${model.id}` !== `${msg.info.providerID}/${msg.info.modelID}`
        const media: Array<{ mime: string; url: string }> = []
        const prefix = attributionPrefix(msg.info)

        if (
          msg.info.error &&
          !(
            MessageV2.AbortedError.isInstance(msg.info.error) &&
            msg.parts.some((part) => part.type !== "step-start" && part.type !== "reasoning")
          )
        ) {
          continue
        }
        const assistantMessage: UIMessage = { id: msg.info.id, role: "assistant", parts: [] }
        for (const part of msg.parts) {
          if (part.type === "text")
            assistantMessage.parts.push({
              type: "text",
              text: prefix + part.text,
              ...(differentModel ? {} : { providerMetadata: part.metadata }),
            })
          if (part.type === "step-start") assistantMessage.parts.push({ type: "step-start" })
          if (part.type === "tool") {
            toolNames.add(part.tool)
            if (part.state.status === "completed") {
              const outputText = part.state.time.compacted ? "[Old tool result content cleared]" : part.state.output
              const attachments = part.state.time.compacted ? [] : (part.state.attachments ?? [])
              const isMediaAttachment = (a: { mime: string }) =>
                a.mime.startsWith("image/") || a.mime === "application/pdf"
              const mediaAttachments = attachments.filter(isMediaAttachment)
              const nonMediaAttachments = attachments.filter((a) => !isMediaAttachment(a))
              if (!supportsMediaInToolResults && mediaAttachments.length > 0) media.push(...mediaAttachments)
              const finalAttachments = supportsMediaInToolResults ? attachments : nonMediaAttachments
              const output =
                finalAttachments.length > 0 ? { text: outputText, attachments: finalAttachments } : outputText
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-available",
                toolCallId: part.callID,
                input: part.state.input,
                output,
                ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
              })
            }
            if (part.state.status === "error")
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-error",
                toolCallId: part.callID,
                input: part.state.input,
                errorText: part.state.error,
                ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
              })
            if (part.state.status === "pending" || part.state.status === "running")
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-error",
                toolCallId: part.callID,
                input: part.state.input,
                errorText: "[Tool execution was interrupted]",
                ...(differentModel ? {} : { callProviderMetadata: part.metadata }),
              })
          }
          if (part.type === "reasoning") {
            assistantMessage.parts.push({
              type: "reasoning",
              text: prefix + part.text,
              ...(differentModel ? {} : { providerMetadata: part.metadata }),
            })
          }
        }
        if (assistantMessage.parts.length > 0) {
          result.push(assistantMessage)
          if (media.length > 0) {
            result.push({
              id: Identifier.ascending("message"),
              role: "user",
              parts: [
                { type: "text" as const, text: "Attached image(s) from tool result:" },
                ...media.map((attachment) => ({
                  type: "file" as const,
                  url: attachment.url,
                  mediaType: attachment.mime,
                })),
              ],
            })
          }
        }
      }
    }

    const tools = Object.fromEntries(Array.from(toolNames).map((toolName) => [toolName, { toModelOutput }]))
    return convertToModelMessages(
      result.filter((msg) => msg.parts.some((part) => part.type !== "step-start")),
      { //@ts-expect-error
        tools,
      },
    )
  }

  /**
   * Resolves reply_to parent linkage for a batch of message entries: parentMessageID
   * always comes from the edge's from_id; parentSessionID is the current session for
   * a same-session reply, or resolved by following the parent's own session->entry
   * contains edge when the edge's metadata marks it a cross-session delegation.
   */
  async function resolveParents(
    db: any,
    messageIDs: string[],
    sessionID: string,
  ): Promise<Map<string, { parentMessageID: string; parentSessionID: string }>> {
    const result = new Map<string, { parentMessageID: string; parentSessionID: string }>()
    if (messageIDs.length === 0) return result

    const replyEdges = db
      .select({ from_id: EdgesTable.from_id, to_id: EdgesTable.to_id, metadata: EdgesTable.metadata })
      .from(EdgesTable)
      .where(and(inArray(EdgesTable.to_id, messageIDs), eq(EdgesTable.type, "reply_to")))
      .all()
    if (replyEdges.length === 0) return result

    const delegatedParentIds = replyEdges
      .filter((e: any) => (e.metadata as any)?.delegation)
      .map((e: any) => e.from_id)
    const parentSessionByParentId = new Map<string, string>()
    if (delegatedParentIds.length > 0) {
      const parentContainsEdges = db
        .select({ from_id: EdgesTable.from_id, to_id: EdgesTable.to_id })
        .from(EdgesTable)
        .where(
          and(
            eq(EdgesTable.from_type, "session"),
            inArray(EdgesTable.to_id, delegatedParentIds),
            eq(EdgesTable.type, "contains"),
          ),
        )
        .all()
      for (const pc of parentContainsEdges) parentSessionByParentId.set(pc.to_id, pc.from_id)
    }

    for (const e of replyEdges) {
      const isDelegation = !!(e.metadata as any)?.delegation
      const parentSessionID = isDelegation ? parentSessionByParentId.get(e.from_id) : sessionID
      if (parentSessionID) result.set(e.to_id, { parentMessageID: e.from_id, parentSessionID })
    }
    return result
  }

  /** Batch-fetches ordered part entries for a set of message-entry ids. */
  async function partsByMessageBatch(db: any, messageIDs: string[]): Promise<Map<string, MessageV2.Part[]>> {
    const result = new Map<string, MessageV2.Part[]>()
    if (messageIDs.length === 0) return result

    const partEdges = db
      .select({ from_id: EdgesTable.from_id, to_id: EdgesTable.to_id })
      .from(EdgesTable)
      .where(
        and(
          eq(EdgesTable.from_type, "entry"),
          inArray(EdgesTable.from_id, messageIDs),
          eq(EdgesTable.type, "contains"),
        ),
      )
      .orderBy(asc(EdgesTable.seq_in_parent))
      .all()
    if (partEdges.length === 0) return result

    const partIds = partEdges.map((e: any) => e.to_id)
    const entryRows = db.select().from(EntriesTable).where(inArray(EntriesTable.id, partIds)).all()
    const entryById = new Map<string, any>(entryRows.map((r: any) => [r.id, r]))

    for (const e of partEdges) {
      const entry = entryById.get(e.to_id)
      if (!entry) continue
      const part = {
        ...(entry.payload_json as Record<string, unknown>),
        id: entry.id,
        messageID: e.from_id,
      } as MessageV2.Part
      const list = result.get(e.from_id)
      if (list) list.push(part)
      else result.set(e.from_id, [part])
    }
    return result
  }

  export async function* stream(sessionID: string): AsyncGenerator<WithParts> {
    const db = getConfig().db
    const size = 50
    let offset = 0
    while (true) {
      const edgeRows = db
        .select({ to_id: EdgesTable.to_id })
        .from(EdgesTable)
        .where(
          and(
            eq(EdgesTable.from_type, "session"),
            eq(EdgesTable.from_id, sessionID),
            eq(EdgesTable.type, "contains"),
          ),
        )
        .orderBy(desc(EdgesTable.seq_in_parent))
        .limit(size)
        .offset(offset)
        .all()
      if (edgeRows.length === 0) break

      const messageIDs = edgeRows.map((r: any) => r.to_id)
      const entryRows = db.select().from(EntriesTable).where(inArray(EntriesTable.id, messageIDs)).all()
      const entryById = new Map<string, any>(entryRows.map((r: any) => [r.id, r]))
      const partsByMessage = await partsByMessageBatch(db, messageIDs)
      const parentByMessage = await resolveParents(db, messageIDs, sessionID)

      for (const messageID of messageIDs) {
        const entry = entryById.get(messageID)
        if (!entry) continue
        const info = {
          ...(entry.payload_json as Record<string, unknown>),
          id: entry.id,
          sessionID,
        } as MessageV2.Info
        const parent = parentByMessage.get(messageID)
        if (parent) {
          ;(info as any).parentMessageID = parent.parentMessageID
          ;(info as any).parentSessionID = parent.parentSessionID
        }
        yield {
          info,
          parts: (partsByMessage.get(messageID) ?? []).map((p) => ({ ...p, sessionID }) as MessageV2.Part),
        }
      }

      offset += edgeRows.length
      if (edgeRows.length < size) break
    }
  }

  export async function parts(message_id: string): Promise<MessageV2.Part[]> {
    const db = getConfig().db
    const sessionEdge = db
      .select({ from_id: EdgesTable.from_id })
      .from(EdgesTable)
      .where(
        and(
          eq(EdgesTable.from_type, "session"),
          eq(EdgesTable.to_id, message_id),
          eq(EdgesTable.type, "contains"),
        ),
      )
      .get()
    const sessionID = sessionEdge?.from_id ?? ""

    const byMessage = await partsByMessageBatch(db, [message_id])
    return (byMessage.get(message_id) ?? []).map((p) => ({ ...p, sessionID }) as MessageV2.Part)
  }

  export async function get(input: { sessionID: string; messageID: string }): Promise<WithParts> {
    const db = getConfig().db
    const entry = db.select().from(EntriesTable).where(eq(EntriesTable.id, input.messageID)).get()
    if (!entry) throw new Error(`Message not found: ${input.messageID}`)
    const info = {
      ...(entry.payload_json as Record<string, unknown>),
      id: entry.id,
      sessionID: input.sessionID,
    } as MessageV2.Info

    const parentByMessage = await resolveParents(db, [input.messageID], input.sessionID)
    const parent = parentByMessage.get(input.messageID)
    if (parent) {
      ;(info as any).parentMessageID = parent.parentMessageID
      ;(info as any).parentSessionID = parent.parentSessionID
    }

    return {
      info,
      parts: await parts(input.messageID),
    }
  }

  export async function filterCompacted(stream: AsyncIterable<MessageV2.WithParts>): Promise<MessageV2.WithParts[]> {
    const result = [] as MessageV2.WithParts[]
    const completed = new Set<string>()
    for await (const msg of stream) {
      result.push(msg)
      if (
        msg.info.role === "user" &&
        completed.has(msg.info.id) &&
        msg.parts.some((part) => part.type === "compaction")
      )
        break
      if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish && msg.info.parentID) completed.add(msg.info.parentID)
    }
    result.reverse()
    return result
  }

  export function fromError(e: unknown, ctx: { providerID: string }) {
    switch (true) {
      case e instanceof DOMException && e.name === "AbortError":
        return new MessageV2.AbortedError({ message: (e as Error).message }, { cause: e }).toObject()
      case MessageV2.OutputLengthError.isInstance(e):
        return e
      case LoadAPIKeyError.isInstance(e):
        return new MessageV2.AuthError(
          { providerID: ctx.providerID, message: (e as Error).message },
          { cause: e },
        ).toObject()
      case (e as SystemError)?.code === "ECONNRESET":
        return new MessageV2.APIError(
          {
            message: "Connection reset by server",
            isRetryable: true,
            metadata: {
              code: (e as SystemError).code ?? "",
              syscall: (e as SystemError).syscall ?? "",
              message: (e as SystemError).message ?? "",
            },
          },
          { cause: e },
        ).toObject()
      case APICallError.isInstance(e): {
        const apiErr = e as APICallError
        const message = apiErr.message ?? "API error"
        const statusCode = apiErr.statusCode

        // Detect context overflow from message patterns or status codes
        const overflowPatterns = [
          /prompt is too long/i,
          /exceeds the context window/i,
          /exceeds the maximum number of tokens/i,
          /reduce the length of the messages/i,
          /400 status code \(no body\)/i,
          /413 status code \(no body\)/i,
        ]
        const isOverflow = overflowPatterns.some((p) => p.test(message))

        if (isOverflow && statusCode !== 429) {
          return new MessageV2.ContextOverflowError(
            { message: "Input exceeds context window of this model", responseBody: apiErr.responseBody },
            { cause: e },
          ).toObject()
        }

        // OpenAI 404 is transient (model routing) — retry
        if (ctx.providerID === "openai" && statusCode === 404) {
          return new MessageV2.APIError(
            {
              message,
              statusCode,
              isRetryable: true,
              responseHeaders: apiErr.responseHeaders,
              responseBody: apiErr.responseBody,
            },
            { cause: e },
          ).toObject()
        }

        // Special handling for github-copilot 403 errors
        if (ctx.providerID === "github-copilot" && statusCode === 403) {
          return new MessageV2.APIError(
            {
              message:
                "Please reauthenticate with the copilot provider to ensure your credentials work properly with OpenCode.",
              statusCode,
              isRetryable: apiErr.isRetryable ?? false,
              responseHeaders: apiErr.responseHeaders,
              responseBody: apiErr.responseBody,
              metadata: { url: apiErr.url },
            },
            { cause: e },
          ).toObject()
        }

        return new MessageV2.APIError(
          {
            message,
            statusCode,
            isRetryable: apiErr.isRetryable ?? false,
            responseHeaders: apiErr.responseHeaders,
            responseBody: apiErr.responseBody,
          },
          { cause: e },
        ).toObject()
      }
      case typeof e === "object" && e !== null && (e as any).type === "error": {
        // Handle structured error objects (e.g., from provider error parsing)
        const errObj = e as { error?: { code?: string; message?: string } }
        const code = errObj.error?.code
        const responseBody = JSON.stringify(e)

        switch (code) {
          case "context_length_exceeded":
            return new MessageV2.ContextOverflowError(
              { message: "Input exceeds context window of this model", responseBody },
              { cause: e },
            ).toObject()
          case "insufficient_quota":
            return new MessageV2.APIError(
              { message: "Quota exceeded. Check your plan and billing details.", isRetryable: false, responseBody },
              { cause: e },
            ).toObject()
          case "usage_not_included":
            return new MessageV2.APIError(
              {
                message: "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
                isRetryable: false,
                responseBody,
              },
              { cause: e },
            ).toObject()
          case "invalid_prompt":
            return new MessageV2.APIError(
              {
                message: errObj.error?.message ?? "Invalid prompt",
                isRetryable: false,
                responseBody,
              },
              { cause: e },
            ).toObject()
          default:
            return new MessageV2.APIError(
              { message: errObj.error?.message ?? "API error", isRetryable: false, responseBody },
              { cause: e },
            ).toObject()
        }
      }
      case e instanceof Error:
        return new NamedError.Unknown({ message: e.toString() }, { cause: e }).toObject()
      default:
        return new NamedError.Unknown({ message: JSON.stringify(e) }, { cause: e }).toObject()
    }
  }
}
