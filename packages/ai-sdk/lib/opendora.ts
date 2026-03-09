const OPENDORA_URL = process.env.NEXT_PUBLIC_OPENDORA_URL ?? "http://localhost:4096"

export type Session = {
  id: string
  projectID: string
  directory: string
  parentID?: string
  title?: string
  time: { created: number; updated: number }
}

export type UserMessage = {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  agent: string
  model: { providerID: string; modelID: string }
}

export type AssistantMessage = {
  id: string
  sessionID: string
  role: "assistant"
  time: { created: number; completed?: number }
  providerID: string
  modelID: string
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
  tool: string
  state: { status: "pending" | "running" | "completed" | "error"; [k: string]: unknown }
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

export type Provider = {
  id: string
  name: string
  models: Record<string, { id: string; name: string; [k: string]: unknown }>
}

export type Agent = {
  name: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  color?: string
  temperature?: number
  steps?: number
  model?: { modelID: string; providerID: string }
  fallback_model?: { modelID: string; providerID: string }
  tools?: string[]
  native?: boolean
}

/** Shape of agent.json — what you send to create / update an agent */
export type AgentConfig = {
  name: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  model?: { modelID: string; providerID: string }
  fallback_model?: { modelID: string; providerID: string }
  temperature?: number
  steps?: number
  color?: string
  hidden?: boolean
  tools?: string[]
  skills?: string[]
}

/** What the backend returns from create / update */
export type AgentEntry = {
  id: string
  config: AgentConfig
  persona: string
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
    create: () => req<Session>("/session", { method: "POST", body: JSON.stringify({}) }),
    messages: (sessionID: string) => req<MessageWithParts[]>(`/session/${sessionID}/message`),
    abort: (sessionID: string) =>
      req<boolean>(`/session/${sessionID}/abort`, { method: "POST", body: JSON.stringify({}) }),
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
  auth: {
    set: (providerID: string, info: AuthInfo) =>
      req<boolean>(`/auth/${providerID}`, { method: "PUT", body: JSON.stringify(info) }),
    remove: (providerID: string) =>
      req<boolean>(`/auth/${providerID}`, { method: "DELETE" }),
  },
  agent: {
    list: () => req<Agent[]>("/agent"),
    get: (id: string) => req<Agent>(`/agent/${id}`),
    create: (input: { id?: string; config: AgentConfig; persona?: string }) =>
      req<AgentEntry>("/agent", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: { config?: Partial<AgentConfig>; persona?: string }) =>
      req<AgentEntry>(`/agent/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    remove: (id: string) => req<boolean>(`/agent/${id}`, { method: "DELETE" }),
    getPersona: (id: string) => req<{ persona: string }>(`/agent/${id}/persona`).then((r) => r.persona),
    setPersona: (id: string, persona: string) =>
      req<boolean>(`/agent/${id}/persona`, { method: "PUT", body: JSON.stringify({ persona }) }),
    generate: (input: { description: string; model?: { providerID: string; modelID: string } }) =>
      req<GeneratedAgent>("/agent/generate", { method: "POST", body: JSON.stringify(input) }),
    tools: () => req<string[]>("/agent/tools"),
  },
  events: {
    subscribe: (onEvent: (event: Event) => void): () => void => {
      const es = new EventSource(`${OPENDORA_URL}/event`)
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
