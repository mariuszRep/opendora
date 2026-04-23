const OPENDORA_URL = process.env.NEXT_PUBLIC_OPENDORA_URL ?? "http://localhost:4097"

export type SessionType = "role" | "scope" | "worker" | "scratchpad"

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
  time: { created: number; updated: number }
  /** Session that spawned this one (via delegate tool) */
  parentSessionID?: string
  /** Override: where to reply when done (set by delegator) */
  replyToSessionID?: string
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

export type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
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
  prompt: string
  cron_expression: string
  timezone?: string
  is_active: boolean
  action_type: "message" | "tool"
  tool_name?: string
  last_executed?: number
  time_created: number
  time_updated: number
  color?: string
  name?: string
}

export type QuestionRequest = {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: { messageID: string; callID: string }
}

export type PermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, any>
  always: string[]
  tool?: { messageID: string; callID: string }
}

export type PermissionReply = "once" | "always" | "reject"

export type Provider = {
  id: string
  name: string
  models: Record<string, { id: string; name: string; [k: string]: unknown }>
}

export type Agent = {
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
  toolConfig?: {
    delegate?: { allowedAgents?: string[] }
    reply?: { stopAfterReply?: boolean }
  }
  enableInjection?: boolean
  /** New unified path entries. Replaces defaultPaths. */
  paths?: PathEntry[]
  /** @deprecated Use paths instead. */
  defaultPaths?: string[]
  sandbox?: boolean
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

export type AuthMethod = { type: "oauth" | "api"; label: string }

export type AuthInfo =
  | { type: "api"; key: string }
  | { type: "oauth"; refresh: string; access: string; expires: number; accountId?: string; enterpriseUrl?: string }
  | { type: "wellknown"; key: string; token: string }

export type Event =
  | { type: "server.connected"; properties: Record<string, never> }
  | { type: "server.heartbeat"; properties: Record<string, never> }
  | { type: "message.updated"; properties: { info: Message } }
  | { type: "message.part.updated"; properties: { part: Part; delta?: string } }
  | { type: "question.asked"; properties: QuestionRequest }
  | { type: "question.replied"; properties: { sessionID: string; requestID: string; answers: QuestionAnswer[] } }
  | { type: "question.rejected"; properties: { sessionID: string; requestID: string } }
  | { type: "permission.asked"; properties: PermissionRequest }
  | { type: "permission.replied"; properties: { sessionID: string; requestID: string; reply: PermissionReply } }
  | { type: "session.created"; properties: { info: Session } }
  | { type: "session.updated"; properties: { info: Session } }
  | { type: "session.deleted"; properties: { sessionID: string } }
  | { type: "session.idle"; properties: { sessionID: string } }
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
    create: (input?: { sessionType?: SessionType; agentID?: string | null; title?: string }) =>
      req<Session>("/session", { method: "POST", body: JSON.stringify(input ?? {}) }),
    children: (sessionID: string) => req<Session[]>(`/session/${sessionID}/children`),
    messages: (sessionID: string) => req<MessageWithParts[]>(`/session/${sessionID}/message`),
    abort: (sessionID: string) =>
      req<boolean>(`/session/${sessionID}/abort`, { method: "POST", body: JSON.stringify({}) }),
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
    list: () => req<PermissionRequest[]>("/permission"),
    reply: (requestID: string, reply: PermissionReply, message?: string) =>
      req<boolean>(`/permission/${requestID}/reply`, {
        method: "POST",
        body: JSON.stringify({ reply, message }),
      }),
  },
  auth: {
    set: (providerID: string, info: AuthInfo) =>
      req<boolean>(`/auth/${providerID}`, { method: "PUT", body: JSON.stringify(info) }),
    remove: (providerID: string) =>
      req<boolean>(`/auth/${providerID}`, { method: "DELETE" }),
  },
  schedule: {
    list: () => req<Schedule[]>("/schedule"),
    create: (input: { agent_id?: string; prompt: string; cron_expression: string; session_id?: string; action_type?: "message" | "tool"; tool_name?: string; color?: string; name?: string }) =>
      req<Schedule>("/schedule", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: { is_active?: boolean; cron_expression?: string; prompt?: string; action_type?: "message" | "tool"; tool_name?: string; color?: string; agent_id?: string | null; session_id?: string | null; name?: string | null }) =>
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
    tools: () => req<string[]>("/agent/tools"),
  },
  voice: {
    stt: async (audioBlob: Blob): Promise<{ text: string }> => {
      const formData = new FormData()
      formData.append("audio", audioBlob)
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
      voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
      model?: "tts-1" | "tts-1-hd"
      speed?: number
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
  },
  skill: {
    list: (directory?: string) =>
      req<Array<{ name: string; description: string; location: string; content: string }>>(
        directory ? `/skill?directory=${encodeURIComponent(directory)}` : "/skill"
      ),
    update: (location: string, content: string) =>
      req<boolean>("/skill", { method: "PUT", body: JSON.stringify({ location, content }) }),
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
}
