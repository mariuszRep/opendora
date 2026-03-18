const OPENDORA_URL = process.env.NEXT_PUBLIC_OPENDORA_URL ?? "http://localhost:4096"

export type SessionType = "role" | "scope" | "worker" | "scratchpad"

export type RetentionPolicy = {
  autoArchive?: boolean
  autoDelete?: boolean
  ttlMs?: number
  maxMessages?: number
  maxAgeDays?: number
  onExpire?: "archive" | "close" | "delete"
}

export type SendPolicy = {
  allow: string[]
  deny: string[]
}

export type Session = {
  id: string
  projectID: string
  directory: string
  parentID?: string
  title?: string
  agentID?: string
  sessionType?: SessionType
  retention?: RetentionPolicy
  sendPolicy?: SendPolicy
  model?: string
  toolPolicy?: string[]
  systemPrompt?: string
  defaultPath?: string
  time: { created: number; updated: number }
  /** Session that spawned this one via delegate/spawn_session tool */
  spawnParentSessionID?: string
  /** The assistant message ID in the parent session that contains the delegate tool call */
  spawnParentMessageID?: string
  /** The first response message produced in this session for the parent delegation */
  spawnResponseMessageID?: string
}

export type UserMessage = {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  agent: string
  model: { providerID: string; modelID: string }
  /** Set when this message was injected by a tool in another session */
  parentSessionID?: string
  /** The message ID in parentSessionID that contains the tool call that created this message */
  parentMessageID?: string
}

export type AssistantMessage = {
  id: string
  sessionID: string
  role: "assistant"
  from?: { kind: "user" | "agent" | "service"; id: string }
  time: { created: number; completed?: number }
  providerID: string
  modelID: string
  /** Name/ID of the agent that produced this message */
  agent?: string
  /** Set when this assistant reply was injected by a tool in another session */
  parentSessionID?: string
  /** The message ID in parentSessionID that contains the tool call that created this assistant reply */
  parentMessageID?: string
  error?: { name: string; data: Record<string, unknown> }
}

export type Message = UserMessage | AssistantMessage

export type TextPart = {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
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

export type QuestionRequest = {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: {
    messageID: string
    callID: string
  }
}

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
  toolConfig?: { delegate?: { allowedAgents?: string[] } }
  defaultPath?: string
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
  toolConfig?: { delegate?: { allowedAgents?: string[] } }
  enableInjection?: boolean
  defaultPath?: string
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
  | { type: "session.created"; properties: { info: Session } }
  | { type: "session.updated"; properties: { info: Session } }
  | { type: "session.deleted"; properties: { sessionID: string } }
  | { type: "session.idle"; properties: { sessionID: string } }
  | { type: string; properties: unknown }

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
        toolPolicy?: string[]
        systemPrompt?: string
        defaultPath?: string
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
  auth: {
    set: (providerID: string, info: AuthInfo) =>
      req<boolean>(`/auth/${providerID}`, { method: "PUT", body: JSON.stringify(info) }),
    remove: (providerID: string) =>
      req<boolean>(`/auth/${providerID}`, { method: "DELETE" }),
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
