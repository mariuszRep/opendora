// All API traffic goes through the Next.js dev proxy at /api so the browser
// only ever contacts one port. This fixes WSL2 port-forwarding issues where
// the Windows browser can reach port 3000 (Next.js) but not port 4097 directly.
// Set NEXT_PUBLIC_OPENDORA_URL to override (e.g. a remote backend URL).
const OPENDORA_URL = process.env.NEXT_PUBLIC_OPENDORA_URL
  ? `${process.env.NEXT_PUBLIC_OPENDORA_URL}`
  : "/api"

export type SessionType = "role" | "scope" | "worker" | "scratchpad"

export type EdgeType =
  | "instantiated_as"
  | "contains"
  | "forked_from"
  | "forked_at"
  | "reply_to"
  | "caused"
  | "produced"
  | "used"
  | "branch"
  | "merge"

export type EntryNodeType = "workflow" | "session" | "entry" | "tool" | "artifact"

export type Edge = {
  id: string
  from_type: EntryNodeType
  from_id: string
  to_type: EntryNodeType
  to_id: string
  type: EdgeType
  seq_in_parent?: number
  label?: string
  metadata?: Record<string, unknown>
  created_at: string
}

/** @deprecated Use Edge */
export type EntryEdge = Edge

export type RetentionPolicy = {
  autoArchive?: boolean
  autoDelete?: boolean
  ttlMs?: number
  maxMessages?: number
  maxAgeDays?: number
  onExpire?: "archive" | "close" | "delete"
}

/**
 * A single filesystem boundary granted to an agent or session.
 * edit: true  = read + write access
 * edit: false = read / explore only
 *
 * Inheritance rule: child can only narrow (sub-path) or downgrade (edit→explore).
 * A child never gains access that its parent does not have.
 */
export type PathEntry = {
  path: string
  edit: boolean
}

export type FileNode = {
  name: string
  path: string
  absolute: string
  type: "file" | "directory"
  ignored: boolean
}

export type FileContent = {
  type: "text" | "binary"
  content: string
  encoding?: "base64"
  mimeType?: string
}

export type SendPolicy = {
  allow: string[]
  deny: string[]
}

export type Session = {
  id: string
  projectID: string
  directory: string
  title?: string
  agentID?: string
  sessionType?: SessionType
  retention?: RetentionPolicy
  sendPolicy?: SendPolicy
  model?: string
  systemPrompt?: string
  /** New unified path entries. Replaces path + readPath. */
  paths?: PathEntry[]
  /** @deprecated Use paths instead. Kept for backward compat. */
  path?: string
  /** @deprecated Use paths instead. Kept for backward compat. */
  readPath?: string
  /** Optional override for tool execution working directory. Empty = project root. */
  cwd?: string
  time: { created: number; updated: number }
  /** Session that spawned this one (via delegate tool) */
  parentSessionID?: string
  /** Override: where to reply when done (set by delegator) */
  replyToSessionID?: string
  tokens?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    compactionCount: number
  }
}

export type UserMessage = {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  agent: string
  model: { providerID: string; modelID: string }
  /** ID of the tool-call message in the parent session that delegated this prompt */
  parentMessageID?: string
  /** ID of the session that delegated this prompt (derived from parentMessageID's session) */
  parentSessionID?: string
  /** ID of the schedule that created this message, if any */
  schedule_id?: string
  /** When true, this message is hidden from the canvas (used for internal workflow LLM calls) */
  hidden?: boolean
}

export type AssistantMessage = {
  id: string
  sessionID: string
  role: "assistant"
  from?: { kind: "user" | "agent" | "service" | "scheduler"; id: string }
  time: { created: number; completed?: number }
  providerID: string
  modelID: string
  /** Name/ID of the agent that produced this message */
  agent?: string
  error?: { name: string; data: Record<string, unknown> }
  /** ID of the tool-call message in the parent session that triggered this reply */
  parentMessageID?: string
  /** ID of the session whose tool call this message is replying to */
  parentSessionID?: string
  /** ID of the schedule that created this message, if any */
  schedule_id?: string
  /** When true, this message is hidden from the canvas (used for internal workflow LLM calls) */
  hidden?: boolean
}

export type Message = UserMessage | AssistantMessage

export type TextPart = {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
  synthetic?: boolean
  hidden?: boolean
}

export type ReasoningPart = {
  id: string
  sessionID: string
  messageID: string
  type: "reasoning"
  text: string
  summaryText?: string
  state?: "thinking" | "done"
  time?: { start: number; end?: number }
}

export type ToolPart = {
  id: string
  sessionID: string
  messageID: string
  type: "tool"
  callID: string
  tool: string
  state:
    | { status: "pending"; input: Record<string, unknown>; metadata?: Record<string, unknown> }
    | { status: "running"; input: Record<string, unknown>; metadata?: Record<string, unknown> }
    | { status: "completed"; input: Record<string, unknown>; output: unknown; metadata?: Record<string, unknown> }
    | { status: "error"; input: Record<string, unknown>; error: string; metadata?: Record<string, unknown> }
  metadata?: Record<string, unknown>
}

export type FallbackSwitchPart = {
  id: string
  sessionID: string
  messageID: string
  type: "fallback-switch"
  previousSlot: { providerID: string; modelID: string }
  newSlot: { providerID: string; modelID: string }
  groupID: string
  resetAt: number | null
  statusCode?: number
  errorKind?: string
  time: { created: number }
}

export type ModelCooldown = {
  until: number
  resetInSeconds: number
  reason: string
  kind: string
}

export type ProviderTimeoutInfo = {
  timedOut: boolean
  until: number | null
  reason: string | null
  resetInSeconds: number | null
  /** Model IDs with active cooldowns */
  failedModels: string[]
  /** Full per-model cooldown details keyed by modelID */
  modelCooldowns: Record<string, ModelCooldown>
}

export type GroupSlotState = {
  providerID: string
  modelID: string
  active: boolean
  cooled: boolean
  cooldown: {
    until: number
    resetInSeconds: number
    reason: string
    kind: string
  } | null
}

export type GroupState = {
  groupID: string
  displayName: string
  activeSlot: { providerID: string; modelID: string } | null
  slots: GroupSlotState[]
}

export type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
  | FallbackSwitchPart
  | { id: string; sessionID: string; messageID: string; type: string; [k: string]: unknown }

export type MessageWithParts = {
  info: Message
  parts: Part[]
}

export type QuestionOption = {
  label: string
  description: string
}

export type QuestionInfo = {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export type QuestionAnswer = string[]

export type Schedule = {
  id: string
  project_id?: string
  session_id?: string
  agent_id?: string
  description?: string
  workflow_id: string
  workflow_input?: Record<string, unknown>
  cron_expression: string
  timezone?: string
  is_active: boolean
  last_executed?: number
  time_created: number
  time_updated: number
  color?: string
  name?: string
  action_type?: string
  prompt?: string
}

export type QuestionRequest = {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: { messageID: string; callID: string }
}

export type PermissionRequest = {
  id: string
  session_id: string
  agent_id: string
  resource: string
  access: "read" | "write" | "execute" | "*"
  patterns: string[]
  agent_patterns: string[]
  metadata: Record<string, any>
  tool?: { message_id: string; call_id: string }
}

export type PermissionRule = {
  id: string
  scope: "session" | "agent"
  scope_id: string
  resource: string
  access: "read" | "write" | "execute" | "*"
  pattern: string
  action: "allow" | "deny" | "ask"
  time_created: number
  time_updated: number
}

export type PermissionReply = "session" | "agent" | "reject"

export type Provider = {
  id: string
  name: string
  models: Record<string, { id: string; name: string; [k: string]: unknown }>
}

export type Skill = {
  name: string
  description: string
  location: string
  content: string
  origin?: string
  tools?: string[]
}

export type WorkflowNodeType = "input" | "skill_load" | "tool_call" | "agent" | "decide" | "output" | "workflow"

export type WorkflowNodeData =
  | { type: "input"; fields: Array<{ name: string; type: string; required?: boolean; description?: string }> }
  | { type: "skill_load"; skill: string; storeAs?: string }
  | { type: "tool_call"; tool: string; args: Record<string, string>; output?: string }
  | { type: "agent"; prompt: string; output?: string }
  | { type: "decide"; prompt: string; branches: string[] }
  | { type: "output"; message?: string }
  | Record<string, unknown>

export type WorkflowNode = {
  id: string
  type: WorkflowNodeType
  data: WorkflowNodeData
  position: { x: number; y: number }
}

export type WorkflowEdge = {
  id: string
  source: string
  target: string
  label?: string
}

export type Workflow = {
  id: string
  name: string
  description?: string
  version: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type Agent = {
  id?: string
  name: string
  description?: string
  mode?: "subagent" | "primary" | "all" | "worker" | "system"
  hidden?: boolean
  color?: string
  temperature?: number
  steps?: number
  model?: { modelID: string; providerID: string }
  fallback_model?: { modelID: string; providerID: string }
  tools?: string[]
  skills?: string[]
  workflows?: string[]
  toolConfig?: {
    delegate?: { allowedAgents?: string[] }
    reply?: { stopAfterReply?: boolean }
  }
  /** New unified path entries. Replaces defaultPaths. */
  paths?: PathEntry[]
  /** @deprecated Use paths instead. */
  defaultPaths?: string[]
  sandbox?: boolean
  native?: boolean
}

/** Shape of agent.json — what you send to create / update an agent */
export type AgentConfig = {
  name: string
  description?: string
  mode?: "subagent" | "primary" | "all" | "worker" | "system"
  model?: { modelID: string; providerID: string }
  fallback_model?: { modelID: string; providerID: string }
  temperature?: number
  steps?: number
  color?: string
  hidden?: boolean
  tools?: string[]
  skills?: string[]
  workflows?: string[]
  toolConfig?: {
    delegate?: { allowedAgents?: string[] }
    reply?: { stopAfterReply?: boolean }
  }
  enableInjection?: boolean
  injectInstructions?: boolean
  /** New unified path entries. Replaces defaultPaths. */
  paths?: PathEntry[]
  /** @deprecated Use paths instead. */
  defaultPaths?: string[]
  sandbox?: boolean
}

export type ToolSchemaProperty = {
  type?: string
  description?: string
  enum?: string[]
  default?: unknown
}

export type ToolSchema = {
  id: string
  description: string
  source: "internal" | "mcp"
  mcpServer?: string
  inputSchema: {
    type?: string
    properties?: Record<string, ToolSchemaProperty>
    required?: string[]
  }
}

/** What the backend returns from create / update */
export type AgentEntry = {
  id: string
  config: AgentConfig
  persona: string
  injection?: string
}

/** What the backend returns from /agent/generate */
export type GeneratedAgent = {
  identifier: string
  whenToUse: string
  systemPrompt: string
}

export type TokenUsageRecord = {
  id: string
  time: number
  session_id: string | null
  agent_id: string | null
  project_id: string | null
  provider_id: string
  model_id: string
  purpose: "chat" | "title" | "compaction" | "schedule" | "tool" | "other"
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  cost_usd: number | null
  estimated_cost_usd: number | null
  is_free: boolean
}

export type ModelUsageState = {
  updatedAt: number
  requests_limit?: number | null
  requests_used?: number | null
  requests_remaining?: number | null
  requests_reset_at?: number | null
  tokens_limit?: number | null
  tokens_used?: number | null
  tokens_remaining?: number | null
  tokens_reset_at?: number | null
}

export type ProviderUsageState = {
  version: 1
  providerID: string
  updatedAt: number
  models: Record<string, ModelUsageState>
}

export type AuthMethod = { type: "oauth" | "api"; label: string }

export type AuthInfo =
  | { type: "api"; key: string }
  | { type: "oauth"; refresh: string; access: string; expires: number; accountId?: string; enterpriseUrl?: string }
  | { type: "wellknown"; key: string; token: string }
  | { type: "url"; url: string; key?: string }

export type Event =
  | { type: "server.connected"; properties: Record<string, never> }
  | { type: "server.heartbeat"; properties: Record<string, never> }
  | { type: "message.updated"; properties: { info: Message } }
  | { type: "message.part.updated"; properties: { part: Part } }
  | { type: "message.part.delta"; properties: { sessionID: string; messageID: string; partID: string; field: string; delta: string } }
  | { type: "question.asked"; properties: QuestionRequest }
  | { type: "question.replied"; properties: { sessionID: string; requestID: string; answers: QuestionAnswer[] } }
  | { type: "question.rejected"; properties: { sessionID: string; requestID: string } }
  | { type: "permission.asked"; properties: PermissionRequest }
  | { type: "permission.replied"; properties: { session_id: string; request_id: string; reply: PermissionReply } }
  | { type: "permission.rules.updated"; properties: { scope: "session" | "agent"; scope_id: string } }
  | { type: "session.created"; properties: { info: Session } }
  | { type: "session.updated"; properties: { info: Session } }
  | { type: "session.deleted"; properties: { sessionID: string } }
  | { type: "session.idle"; properties: { sessionID: string } }
  | { type: "session.status"; properties: { sessionID: string; status: { type: "idle" | "busy" | "retry"; attempt?: number; message?: string; next?: number } } }
  | { type: "session.error"; properties: { sessionID?: string; error?: { name: string; message: string; data?: Record<string, unknown> } } }
  | { type: "skill.updated"; properties: Record<string, never> }
  | { type: "memory.write"; properties: { sessionID: string; agentID: string; callID?: string; directory?: string; name: string; description: string; scope: string; action: string } }
  | { type: string; properties: unknown }

export class SessionBusyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SessionBusyError"
  }
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${OPENDORA_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    if (res.status === 409) {
      let message = "Session is busy, please wait for the current response to finish."
      try { message = JSON.parse(text).message ?? message } catch { /* use default */ }
      throw new SessionBusyError(message)
    }
    throw new Error(`opendora ${path} ${res.status}: ${text}`)
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T
  }
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export const opendora = {
  session: {
    list: () => req<Session[]>(`/session`),
    status: () => req<Record<string, { type: "idle" | "busy" | "retry"; attempt?: number; message?: string; next?: number }>>("/session/status"),
    create: (input?: { sessionType?: SessionType; agentID?: string | null; title?: string }) =>
      req<Session>("/session", { method: "POST", body: JSON.stringify(input ?? {}) }),
    children: (sessionID: string) => req<Session[]>(`/session/${sessionID}/children`),
    systemPrompt: (sessionID: string) => req<{
      sections: { label: string; content: string }[]
      injection: string
      skills: { name: string; description: string; content: string; tools?: string[] }[]
      tools: { id: string; description: string; source: "internal" | "mcp"; mcpServer?: string; agentManaged: boolean; skillUnlocked: boolean }[]
      loadedSkillNames: string[]
    }>(`/session/${sessionID}/system-prompt`),
    messages: (sessionID: string) => req<MessageWithParts[]>(`/session/${sessionID}/message`),
    graph: (sessionID: string) => req<{ messages: MessageWithParts[]; edges: Edge[] }>(`/session/${sessionID}/graph`),
    abort: (sessionID: string) =>
      req<boolean>(`/session/${sessionID}/abort`, { method: "POST", body: JSON.stringify({}) }),
    compact: (sessionID: string, model: { providerID: string; modelID: string }) =>
      req<boolean>(`/session/${sessionID}/summarize`, {
        method: "POST",
        body: JSON.stringify({ providerID: model.providerID, modelID: model.modelID, auto: false }),
      }),
    update: (
      sessionID: string,
      updates: {
        title?: string
        agentID?: string | null
        sessionType?: SessionType
        retention?: Partial<RetentionPolicy>
        sendPolicy?: SendPolicy
        model?: string
        systemPrompt?: string
        path?: string | null
        readPath?: string | null
        cwd?: string | null
      },
    ) => req<Session>(`/session/${sessionID}`, { method: "PATCH", body: JSON.stringify(updates) }),
    delete: (sessionID: string) => req<boolean>(`/session/${sessionID}`, { method: "DELETE" }),
    setAgent: (sessionID: string, agentID: string | null) =>
      req<Session>(`/session/${sessionID}`, { method: "PATCH", body: JSON.stringify({ agentID }) }),
    prompt: (
      sessionID: string,
      input: {
        parts: Array<{ type: "text"; text: string } | { type: string; [k: string]: unknown }>
        model?: { providerID: string; modelID: string }
        agent?: string
      },
    ) =>
      req<MessageWithParts>(`/session/${sessionID}/message`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    promptAsync: (
      sessionID: string,
      input: {
        parts: Array<{ type: "text"; text: string } | { type: string; [k: string]: unknown }>
        model?: { providerID: string; modelID: string }
        fallbackGroupID?: string
        agent?: string
      },
    ) =>
      req<void>(`/session/${sessionID}/prompt_async`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  provider: {
    list: () =>
      req<{ all: Provider[]; connected: string[]; default: Record<string, string> }>("/provider"),
    authMethods: () => req<Record<string, AuthMethod[]>>("/provider/auth"),
    oauthAuthorize: (providerID: string, method: number) =>
      req<{ url: string; instructions?: string }>(`/provider/${providerID}/oauth/authorize`, {
        method: "POST",
        body: JSON.stringify({ method }),
      }),
    oauthCallback: (providerID: string, method: number, code?: string) =>
      req<boolean>(`/provider/${providerID}/oauth/callback`, {
        method: "POST",
        body: JSON.stringify({ method, code }),
      }),
    timeout: () =>
      req<Record<string, ProviderTimeoutInfo>>("/provider/timeout"),
    clearTimeout: (providerID: string) =>
      req<boolean>(`/provider/${providerID}/timeout`, { method: "DELETE" }),
    usage: () =>
      req<Record<string, ProviderUsageState>>("/provider/usage"),
    group: {
      list: () => req<GroupState[]>("/provider/group"),
      get: (groupID: string) => req<GroupState | null>(`/provider/group/${groupID}`),
      clearCooldown: (groupID: string) =>
        req<boolean>(`/provider/group/${groupID}/cooldown`, { method: "DELETE" }),
      setActiveSlot: (groupID: string, slot: { providerID: string; modelID: string }) =>
        req<boolean>(`/provider/group/${groupID}/slot`, { method: "PUT", body: JSON.stringify(slot) }),
    },
  },
  question: {
    list: () => req<QuestionRequest[]>("/question"),
    reply: (requestID: string, answers: QuestionAnswer[]) =>
      req<boolean>(`/question/${requestID}/reply`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      }),
    reject: (requestID: string) =>
      req<boolean>(`/question/${requestID}/reject`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
  },
  permission: {
    listPending: () => req<PermissionRequest[]>("/permission/pending"),
    listRules: (scope: "session" | "agent", scope_id: string) =>
      req<PermissionRule[]>(`/permission/rules?scope=${scope}&scope_id=${encodeURIComponent(scope_id)}`),
    addRule: (rule: {
      scope: "session" | "agent"
      scope_id: string
      resource: string
      access: "read" | "write" | "execute" | "*"
      pattern: string
      action: "allow" | "deny" | "ask"
    }) =>
      req<PermissionRule>("/permission/rules", {
        method: "POST",
        body: JSON.stringify(rule),
      }),
    removeRule: (id: string, scope: "session" | "agent", scope_id: string) =>
      req<boolean>(`/permission/rules/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ scope, scope_id }),
      }),
    reply: (requestID: string, reply: PermissionReply, message?: string) =>
      req<boolean>(`/permission/pending/${requestID}/reply`, {
        method: "POST",
        body: JSON.stringify({ reply, message }),
      }),
  },
  auth: {
    set: (providerID: string, info: AuthInfo) =>
      req<boolean>(`/auth/${providerID}`, { method: "PUT", body: JSON.stringify(info) }),
    remove: (providerID: string) =>
      req<boolean>(`/auth/${providerID}`, { method: "DELETE" }),
    status: (providerID: string) =>
      req<{ configured: boolean }>(`/auth/${providerID}`),
  },
  schedule: {
    list: () => req<Schedule[]>("/schedule"),
    create: (input: { workflow_id: string; workflow_input?: Record<string, unknown>; description?: string; agent_id?: string; session_id?: string; cron_expression: string; timezone?: string; color?: string; name?: string }) =>
      req<Schedule>("/schedule", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: { is_active?: boolean; cron_expression?: string; timezone?: string; description?: string; workflow_id?: string; workflow_input?: Record<string, unknown> | null; color?: string | null; agent_id?: string | null; session_id?: string | null; name?: string | null }) =>
      req<Schedule>(`/schedule/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    remove: (id: string) => req<boolean>(`/schedule/${id}`, { method: "DELETE" }),
    run: (id: string) => req<boolean>(`/schedule/${id}/run`, { method: "POST" }),
  },
  agent: {
    list: () => req<Agent[]>("/agent"),
    get: (id: string) => req<Agent>(`/agent/${id}`),
    mainSession: (id: string) => req<Session>(`/agent/${id}/main-session`),
    setMainSession: (id: string, sessionID: string) =>
      req<Session>(`/agent/${id}/main-session`, { method: "PUT", body: JSON.stringify({ sessionID }) }),
    create: (input: { id?: string; config: AgentConfig; persona?: string; injection?: string }) =>
      req<AgentEntry>("/agent", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: { config?: Partial<AgentConfig>; persona?: string; injection?: string }) =>
      req<AgentEntry>(`/agent/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    remove: (id: string) => req<boolean>(`/agent/${id}`, { method: "DELETE" }),
    getPersona: (id: string) => req<{ persona: string }>(`/agent/${id}/persona`).then((r) => r.persona),
    setPersona: (id: string, persona: string) =>
      req<boolean>(`/agent/${id}/persona`, { method: "PUT", body: JSON.stringify({ persona }) }),
    getInjection: (id: string) => req<{ injection: string }>(`/agent/${id}/injection`).then((r) => r.injection).catch(() => ""),
    setInjection: (id: string, injection: string) =>
      req<boolean>(`/agent/${id}/injection`, { method: "PUT", body: JSON.stringify({ injection }) }),
    generate: (input: { description: string; model?: { providerID: string; modelID: string } }) =>
      req<GeneratedAgent>("/agent/generate", { method: "POST", body: JSON.stringify(input) }),
    toolSchemas: () => req<ToolSchema[]>("/agent/tools/schema"),
  },
  voice: {
    stt: async (audioBlob: Blob, options?: { provider?: "openai-whisper" | "google-gemini" | "local-whisper" }): Promise<{ text: string }> => {
      const formData = new FormData()
      formData.append("audio", audioBlob)
      if (options?.provider) formData.append("provider", options.provider)
      const res = await fetch(`${OPENDORA_URL}/voice/stt`, {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`opendora /voice/stt ${res.status}: ${text}`)
      }
      return res.json()
    },
    tts: async (input: {
      text: string
      provider?: "openai" | "google-gemini"
      voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
      model?: "tts-1" | "tts-1-hd"
      speed?: number
      geminiVoice?: string
      geminiModel?: string
    }): Promise<Blob> => {
      const res = await fetch(`${OPENDORA_URL}/voice/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`opendora /voice/tts ${res.status}: ${text}`)
      }
      return res.blob()
    },
  },
  file: {
    list: (path: string) => req<FileNode[]>(`/file?path=${encodeURIComponent(path)}`),
    content: (path: string) => req<FileContent>(`/file/content?path=${encodeURIComponent(path)}`),
  },
  config: {
    get: () => req<{ model_filters?: Record<string, "all" | "free" | "none">; [k: string]: unknown }>("/config"),
    update: (updates: { model_filters?: Record<string, "all" | "free" | "none">; [k: string]: unknown }) =>
      req<boolean>("/config", { method: "PATCH", body: JSON.stringify(updates) }),
    modelGroups: {
      create: (group: { name: string; models: { providerID: string; modelID: string }[] }) =>
        req<{ id: string; name: string; models: { providerID: string; modelID: string }[] }>(
          "/config/model-groups",
          { method: "POST", body: JSON.stringify(group) },
        ),
      update: (id: string, group: { name: string; models: { providerID: string; modelID: string }[] }) =>
        req<{ id: string; name: string; models: { providerID: string; modelID: string }[] }>(
          `/config/model-groups/${id}`,
          { method: "PUT", body: JSON.stringify(group) },
        ),
      delete: (id: string) =>
        req<boolean>(`/config/model-groups/${id}`, { method: "DELETE" }),
    },
  },
  workflow: {
    list: (directory?: string) =>
      req<Workflow[]>(directory ? `/workflow?directory=${encodeURIComponent(directory)}` : "/workflow"),
    get: (id: string, directory?: string) =>
      req<Workflow>(directory ? `/workflow/${id}?directory=${encodeURIComponent(directory)}` : `/workflow/${id}`),
    create: (workflow: Workflow, directory?: string) =>
      req<Workflow>(directory ? `/workflow?directory=${encodeURIComponent(directory)}` : "/workflow", {
        method: "POST",
        body: JSON.stringify(workflow),
      }),
    update: (id: string, workflow: Workflow, directory?: string) =>
      req<Workflow>(directory ? `/workflow/${id}?directory=${encodeURIComponent(directory)}` : `/workflow/${id}`, {
        method: "PUT",
        body: JSON.stringify(workflow),
      }),
    remove: (id: string, directory?: string) =>
      req<boolean>(directory ? `/workflow/${id}?directory=${encodeURIComponent(directory)}` : `/workflow/${id}`, {
        method: "DELETE",
      }),
    execute: (id: string, agentId?: string, input?: Record<string, unknown>, directory?: string) =>
      req<{ sessionId: string; workflowId: string; agentId: string }>(
        directory ? `/workflow/${id}/execute?directory=${encodeURIComponent(directory)}` : `/workflow/${id}/execute`,
        { method: "POST", body: JSON.stringify({ agentId, input }) },
      ),
  },
  skill: {
    list: (directory?: string) =>
      req<Skill[]>(
        directory ? `/skill?directory=${encodeURIComponent(directory)}` : "/skill"
      ),
    get: (name: string) =>
      req<Skill>(`/skill/${encodeURIComponent(name)}`),
    create: (input: { name: string; description: string; tools?: string[]; content?: string }) =>
      req<Skill>("/skill", { method: "POST", body: JSON.stringify(input) }),
    update: (location: string, content: string) =>
      req<boolean>("/skill", { method: "PUT", body: JSON.stringify({ location, content }) }),
    updateConfig: (name: string, patch: { tools?: string[] }) =>
      req<boolean>(`/skill/${encodeURIComponent(name)}/config`, { method: "PATCH", body: JSON.stringify(patch) }),
  },
  user: {
    get: () => req<{ name: string; color: string }>("/user"),
    update: (patch: { name?: string; color?: string }) =>
      req<{ name: string; color: string }>("/user", { method: "PATCH", body: JSON.stringify(patch) }),
  },
  usage: {
    records: (range: "7d" | "30d" | "90d" | "12m") =>
      req<{ records: TokenUsageRecord[] }>(`/usage?range=${range}`),
  },
  general: {
    get: () =>
      req<{
        theme?: string
        timezone?: string
        selectedWorkflowId?: string
        voice?: {
          stt: { provider: string; openaiModel?: string; geminiModel?: string }
          tts: { provider: string; openaiModel?: string; voice?: string; speed?: number; geminiVoice?: string; geminiModel?: string }
          pushToTalk: {
            enabled: boolean
            hotkey: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean } | null
          }
        }
      }>("/general"),
    update: (patch: {
      theme?: string
      timezone?: string
      selectedWorkflowId?: string
      voice?: {
        stt?: { provider?: string; openaiModel?: string; geminiModel?: string }
        tts?: { provider?: string; openaiModel?: string; voice?: string; speed?: number; geminiVoice?: string; geminiModel?: string }
        pushToTalk?: {
          enabled?: boolean
          hotkey?: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean } | null
        }
      }
    }) => req<Record<string, unknown>>("/general", { method: "PATCH", body: JSON.stringify(patch) }),
  },
  events: {
    subscribe: (onEvent: (event: Event) => void, onReconnect?: () => void): () => void => {
      const es = new EventSource(`${OPENDORA_URL}/event`)
      let connected = false
      es.onopen = () => {
        if (connected && onReconnect) {
          onReconnect()
        }
        connected = true
      }
      es.onmessage = (e) => {
        try {
          onEvent(JSON.parse(e.data) as Event)
        } catch {
          // ignore parse errors
        }
      }
      return () => es.close()
    },
  },
  memory: {
    list: (directory: string, scope: string, agentID?: string) =>
      req<MemoryEntry[]>(`/memory?directory=${encodeURIComponent(directory)}&scope=${scope}${agentID ? `&agentID=${encodeURIComponent(agentID)}` : ""}`),
    get: (directory: string, name: string, scope: string, agentID?: string) =>
      req<MemoryEntry>(`/memory/${encodeURIComponent(name)}?directory=${encodeURIComponent(directory)}&scope=${scope}${agentID ? `&agentID=${encodeURIComponent(agentID)}` : ""}`),
    create: (directory: string, entry: Omit<MemoryEntry, "createdAt" | "updatedAt">, scope: string, agentID?: string) =>
      req<MemoryEntry>(`/memory`, { method: "POST", body: JSON.stringify({ directory, ...entry, scope, agentID }) }),
    update: (directory: string, name: string, updates: Partial<Pick<MemoryEntry, "description" | "type" | "content">>, scope: string, agentID?: string) =>
      req<MemoryEntry>(`/memory/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ directory, ...updates, scope, agentID }) }),
    delete: (directory: string, name: string, scope: string, agentID?: string) =>
      req<void>(`/memory/${encodeURIComponent(name)}?directory=${encodeURIComponent(directory)}&scope=${scope}${agentID ? `&agentID=${encodeURIComponent(agentID)}` : ""}`, { method: "DELETE" }),
  },
}

export type MemoryEntry = {
  name: string
  description: string
  type: string
  content: string
  createdAt: number
  updatedAt: number
}
