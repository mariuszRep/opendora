// ─── Actors ──────────────────────────────────────────────────────────────────

export type Actor =
  | { kind: "user"; id: string }
  | { kind: "agent"; id: string }
  | { kind: "service"; id: string }

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageKind = "ping" | "pong"

export type Parent = {
  messageId: string
  sessionId?: string   // omit = same session | set = delegated from another session
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool-invocation"; toolName: string; input: unknown; output?: unknown }
  | { type: "file"; mimeType: string; url: string }
  | { type: "reasoning"; text: string }

export type InputProvenance = "user" | "agent" | "service"

export type Message = {
  id: string
  sessionId: string
  parent: Parent | null
  from: Actor
  kind: MessageKind
  parts: MessagePart[]
  provenance?: InputProvenance
  tokenCount?: number
  timestamp: number
}

export type SendPolicy = {
  allow: string[]
  deny: string[]
}

/**
 * Pure function — no I/O, no async.
 * deny list takes priority; an empty allow list means "all allowed".
 */
export function evaluateSendPolicy(policy: SendPolicy, actor: Actor): "allow" | "deny" {
  if (policy.deny.includes(actor.id)) return "deny"
  if (policy.allow.length > 0 && !policy.allow.includes(actor.id)) return "deny"
  return "allow"
}

export type PingOptions = {
  from: Actor
  content: string | MessagePart[]
  parent?: Parent
  provenance?: InputProvenance
}

export type PongOptions = {
  from: Actor
  content: string | MessagePart[]
  parent: Parent
  provenance?: InputProvenance
}

export type StreamOptions = {
  pingId: string              // id of the ping this stream is responding to
  from: Actor
  provenance?: InputProvenance
}

// ─── Session taxonomy ─────────────────────────────────────────────────────────

/**
 * role       — continuous session for an agent or role (BA, Architect, global assistant)
 * scope      — scoped to one idea or project, the long-term memory anchor
 * worker     — short-lived execution session, spawned to do one job, returns artifact
 * scratchpad — persisted throwaway, created by user or agent, owner can delete
 */
export type SessionType = "role" | "scope" | "worker" | "scratchpad"

export type SessionStatus = "active" | "archived" | "closed"

export type RetentionPolicy = {
  autoArchive?: boolean       // archive automatically when done
  autoDelete?: boolean        // delete instead of archive
  ttlMs?: number              // auto-close after this duration of inactivity
  maxMessages?: number        // cap on messages per session; oldest evicted when exceeded
  maxAgeDays?: number         // archive after N days of inactivity
  onExpire?: "archive" | "close" | "delete"  // action to take when a policy triggers
}

// Default retention per session type
export const DEFAULT_RETENTION: Record<SessionType, RetentionPolicy> = {
  role: {
    autoArchive: false,
    onExpire: "archive",
  },
  scope: {
    autoArchive: true,
    onExpire: "archive",
  },
  worker: {
    autoArchive: true,
    maxMessages: 500,
    onExpire: "close",
  },
  scratchpad: {
    autoDelete: true,
    ttlMs: 6 * 60 * 60 * 1000,   // 6h inactivity
    maxMessages: 100,
    onExpire: "delete",
  },
}

// ─── Session metadata ─────────────────────────────────────────────────────────

export type SessionParent = {
  sessionId: string
  messageId?: string   // the specific ping that spawned this session
}

export type SessionMeta = {
  id: string
  type: SessionType
  status: SessionStatus
  label?: string                  // human-readable name
  parent?: SessionParent          // who spawned this session
  spawnDepth?: number             // 0 = root, 1 = worker, 2 = nested worker
  retention: RetentionPolicy
  sendPolicy?: SendPolicy
  agentId?: string                // agent assigned to handle pings in this session
  model?: string                  // dynamic model for this session
  toolPolicy?: string[]           // allowed tool names; agent enforces intersection with its own list
  systemPrompt?: string           // boundary prompt prepended to all agent system prompts
  share?: { url: string }         // set when session is shared publicly
  compactionCount?: number        // incremented each time context is compacted
  compactingAt?: number           // set while compaction is running, cleared on completion
  inputTokens?: number            // cumulative LLM input tokens across all pings
  outputTokens?: number           // cumulative LLM output tokens across all pings
  cacheReadTokens?: number        // cumulative prompt-cache read tokens
  cacheWriteTokens?: number       // cumulative prompt-cache write tokens
  createdAt: number
  updatedAt: number
  archivedAt?: number
}

export type CreateSessionOptions = {
  type: SessionType
  label?: string
  parent?: SessionParent
  spawnDepth?: number
  retention?: Partial<RetentionPolicy>
  sendPolicy?: SendPolicy
  agentId?: string
  model?: string
  toolPolicy?: string[]
  systemPrompt?: string
}

export type SessionFilter = {
  type?: SessionType
  status?: SessionStatus
  parentId?: string
}
