"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  opendora,
  type Agent,
  type AgentConfig,
  type AgentEntry,
  type GeneratedAgent,
  type Event,
  type Message,
  type MessageWithParts,
  type Part,
  type Provider,
  type QuestionAnswer,
  type QuestionRequest,
  type Session,
  type SessionType,
} from "@/lib/opendora"

export type ChatStatus = "ready" | "submitted" | "streaming" | "error"

export type UseOpendoraResult = {
  // Sessions
  sessions: Session[]
  agentSessions: Session[]
  selectedSession: Session | null
  selectSession: (id: string) => void
  createSession: (sessionType?: SessionType) => Promise<void>
  setSessionAgent: (sessionID: string, agentID: string | null) => Promise<void>
  setAgentMainSession: (agentID: string, sessionID: string) => Promise<void>
  activeSessions: Set<string>
  // Messages
  messages: MessageWithParts[]
  questionRequests: QuestionRequest[]
  replyQuestion: (requestID: string, answers: QuestionAnswer[]) => Promise<void>
  rejectQuestion: (requestID: string) => Promise<void>
  status: ChatStatus
  sendMessage: (text: string, options?: { model?: { providerID: string; modelID: string }; agent?: string }) => Promise<void>
  abort: () => void
  // Agents — read
  agents: (Agent & { _id: string })[]
  allAgents: (Agent & { _id: string })[]
  selectedAgent: string
  selectAgent: (name: string) => void
  // Agents — CRUD
  createAgent: (config: AgentConfig, persona?: string, injection?: string) => Promise<AgentEntry>
  updateAgent: (id: string, config: Partial<AgentConfig>, persona?: string, injection?: string) => Promise<AgentEntry>
  deleteAgent: (id: string) => Promise<void>
  getAgentPersona: (id: string) => Promise<string>
  saveAgentPersona: (id: string, text: string) => Promise<void>
  generateAgent: (description: string, model?: { providerID: string; modelID: string }) => Promise<GeneratedAgent>
  // Providers / models
  providers: Provider[]
  connectedProviders: string[]
  defaultModels: Record<string, string>
  refreshProviders: () => Promise<void>
  // Error
  error: string | null
  // UI Layout
  isChatCentered: boolean
  toggleChatLayout: () => void
}

export function useOpendora(): UseOpendoraResult {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageWithParts[]>([])
  const [questionRequests, setQuestionRequests] = useState<Record<string, QuestionRequest[]>>({})
  const [status, setStatus] = useState<ChatStatus>("ready")
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [connectedProviders, setConnectedProviders] = useState<string[]>([])
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({})
  const [agents, setAgents] = useState<(Agent & { _id: string })[]>([])
  const [allAgents, setAllAgents] = useState<(Agent & { _id: string })[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>("build")
  const [isChatCentered, setIsChatCentered] = useState(false)
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set())

  const selectedSessionRef = useRef<Session | null>(null)


  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null
  // Sessions that belong to the currently selected agent
  const agentSessions = sessions.filter((s) => s.agentID === selectedAgent)

  const refreshProviders = useCallback(async () => {
    const providerData = await opendora.provider.list()
    setProviders(providerData.all)
    setConnectedProviders(providerData.connected)
    setDefaultModels(providerData.default)
  }, [])

  useEffect(() => {
    selectedSessionRef.current = selectedSession
  }, [selectedSession])

  // Bootstrap: load providers, agents, sessions
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const [providerData, agentData, sessionData, questionData] = await Promise.all([
          opendora.provider.list(),
          opendora.agent.list(),
          opendora.session.list(),
          opendora.question.list(),
        ])
        if (cancelled) return

        setProviders(providerData.all)
        setConnectedProviders(providerData.connected)
        setDefaultModels(providerData.default)

        // Attach _id (agent slug) so CRUD can match by id rather than display name
        // allAgents includes all agents (visible and hidden)
        const agentsWithId = agentData.map((a) => ({ ...a, _id: (a as any).id || a.name }))
        setAllAgents(agentsWithId)
        
        // agents only includes visible agents (for sidebar)
        const visibleAgents = agentsWithId.filter((a) => !a.hidden)
        setAgents(visibleAgents)

        const sorted = [...sessionData].sort((a, b) => b.time.updated - a.time.updated)
        setSessions(sorted)
        setQuestionRequests(
          questionData.reduce<Record<string, QuestionRequest[]>>((acc, request) => {
            acc[request.sessionID] ??= []
            acc[request.sessionID].push(request)
            return acc
          }, {}),
        )
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    function handleFocus() {
      refreshProviders().catch(() => { })
    }

    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [refreshProviders])

  // Load messages when session changes
  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([])
      return
    }
    let cancelled = false
    opendora.session.messages(selectedSessionId).then((msgs) => {
      if (!cancelled) setMessages(msgs)
    }).catch(() => { })
    return () => { cancelled = true }
  }, [selectedSessionId])

  // SSE events
  useEffect(() => {
    return opendora.events.subscribe((event: Event) => {
      switch (event.type) {
        case "session.created": {
          const info = (event as { type: string; properties: { info: Session } }).properties.info
          setSessions((prev) => {
            if (prev.find((s) => s.id === info.id)) return prev
            return [info, ...prev]
          })
          break
        }
        case "session.updated": {
          const info = (event as { type: string; properties: { info: Session } }).properties.info
          setSessions((prev) => prev.map((s) => (s.id === info.id ? info : s)))
          break
        }
        case "session.deleted": {
          const { sessionID } = (event as { type: string; properties: { sessionID: string } }).properties
          setSessions((prev) => prev.filter((s) => s.id !== sessionID))
          if (selectedSessionRef.current?.id === sessionID) {
            setSelectedSessionId(null)
            setMessages([])
          }
          break
        }
        case "message.updated": {
          const { info } = (event as { type: string; properties: { info: Message } }).properties
          
          // Track active sessions (sessions with incomplete assistant messages)
          if (info.role === "assistant") {
            const assistantInfo = info as { role: "assistant"; time: { created: number; completed?: number }; sessionID: string }
            if (!assistantInfo.time.completed) {
              // Assistant message started, mark session as active
              setActiveSessions((prev) => new Set(prev).add(info.sessionID))
            } else {
              // Assistant message completed, remove from active sessions
              setActiveSessions((prev) => {
                const next = new Set(prev)
                next.delete(info.sessionID)
                return next
              })
            }
          }
          
          if (info.sessionID !== selectedSessionRef.current?.id) break
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.info.id === info.id)
            if (idx === -1) {
              if (info.role === "assistant") setStatus("streaming")
              return [...prev, { info, parts: [] }]
            }
            return prev.map((m, i) => (i === idx ? { ...m, info } : m))
          })
          break
        }
        case "session.idle": {
          const { sessionID } = (event as { type: string; properties: { sessionID: string } }).properties
          // Remove from active sessions when idle
          setActiveSessions((prev) => {
            const next = new Set(prev)
            next.delete(sessionID)
            return next
          })
          if (selectedSessionRef.current?.id === sessionID) {
            setStatus("ready")
          }
          break
        }
        case "message.part.updated": {
          const { part, delta } = (event as { type: string; properties: { part: Part; delta?: string } }).properties
          if (part.sessionID !== selectedSessionRef.current?.id) break
          setMessages((prev) =>
            prev.map((m) => {
              if (m.info.id !== part.messageID) return m
              const idx = m.parts.findIndex((p) => p.id === part.id)
              if (idx === -1) return { ...m, parts: [...m.parts, part] }
              if (delta && part.type === "text") {
                const existing = m.parts[idx] as { type: "text"; text: string;[k: string]: unknown }
                return { ...m, parts: m.parts.map((p, i) => (i === idx ? { ...part, text: existing.text + delta } : p)) }
              }
              return { ...m, parts: m.parts.map((p, i) => (i === idx ? part : p)) }
            }),
          )
          break
        }
        case "question.asked": {
          const request = event.properties as QuestionRequest
          setQuestionRequests((prev) => {
            const existing = prev[request.sessionID] ?? []
            const idx = existing.findIndex((item) => item.id === request.id)
            const next = idx === -1
              ? [...existing, request]
              : existing.map((item, index) => (index === idx ? request : item))
            return { ...prev, [request.sessionID]: next }
          })
          break
        }
        case "question.replied":
        case "question.rejected": {
          const { sessionID, requestID } = event.properties as { sessionID: string; requestID: string }
          setQuestionRequests((prev) => {
            const existing = prev[sessionID] ?? []
            return {
              ...prev,
              [sessionID]: existing.filter((item) => item.id !== requestID),
            }
          })
          break
        }
      }
    }, () => {
      // SSE reconnected — if status is stuck in a non-terminal state, reset to ready
      // so the UI doesn't freeze if session.idle was missed during the disconnect gap
      setStatus((prev) => (prev === "streaming" || prev === "submitted" ? "ready" : prev))
    })
  }, [])

  const replyQuestion = useCallback(async (requestID: string, answers: QuestionAnswer[]) => {
    await opendora.question.reply(requestID, answers)
  }, [])

  const rejectQuestion = useCallback(async (requestID: string) => {
    await opendora.question.reject(requestID)
  }, [])

  const selectSession = useCallback((id: string) => {
    setSelectedSessionId(id)
    setStatus("ready")
    setError(null)
    // Sync the selected agent to match the session's assigned agent
    setSessions((prev) => {
      const session = prev.find((s) => s.id === id)
      if (session?.agentID) {
        setSelectedAgent(session.agentID)
      }
      return prev
    })
  }, [])

  const createSession = useCallback(async (sessionType?: SessionType) => {
    try {
      let session = await opendora.session.create()
      // Automatically assign the currently selected agent to the new session
      if (selectedAgent) {
        session = await opendora.session.setAgent(session.id, selectedAgent)
      }
      // Set session type if provided (defaults to scratchpad)
      if (sessionType) {
        session = await opendora.session.update(session.id, { sessionType })
      }
      setSessions((prev) => {
        if (prev.find((s) => s.id === session.id)) return prev
        return [session, ...prev]
      })
      setSelectedSessionId(session.id)
      // Update ref immediately to avoid race condition
      selectedSessionRef.current = session
      setMessages([])
      setStatus("ready")
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [selectedAgent])

  const sendMessage = useCallback(
    async (text: string, options?: { model?: { providerID: string; modelID: string }; agent?: string }) => {
      const session = selectedSessionRef.current
      if (!session) return
      setStatus("submitted")
      setError(null)
      try {
        await opendora.session.promptAsync(session.id, {
          parts: [{ type: "text", text }],
          ...(options?.model ? { model: options.model } : {}),
          agent: options?.agent ?? selectedAgent,
        })
        // Status transitions to "ready" via SSE session.idle event
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus("error")
      }
    },
    [selectedAgent],
  )

  const abort = useCallback(() => {
    const session = selectedSessionRef.current
    if (session) opendora.session.abort(session.id).catch(() => { })
    setStatus("ready")
  }, [])

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  const createAgent = useCallback(async (config: AgentConfig, persona?: string, injection?: string) => {
    const entry = await opendora.agent.create({ config, persona, injection })
    // Optimistically add to local list — include all editable fields so the
    // dialog pre-fills correctly if the user re-opens it right after creation.
    const newAgent = {
      _id: entry.id,
      id: entry.id,
      name: entry.config.name,
      description: entry.config.description,
      mode: entry.config.mode,
      hidden: entry.config.hidden,
      color: entry.config.color,
      temperature: entry.config.temperature,
      steps: entry.config.steps,
      model: entry.config.model,
      fallback_model: entry.config.fallback_model,
      tools: entry.config.tools,
    }
    setAllAgents((prev) => [...prev, newAgent])
    if (!entry.config.hidden) {
      setAgents((prev) => [...prev, newAgent])
    }
    return entry
  }, [])

  const updateAgent = useCallback(async (id: string, config: Partial<AgentConfig>, persona?: string, injection?: string) => {
    const entry = await opendora.agent.update(id, { config, persona, injection })
    // Optimistically patch local list — match by _id (the slug) not display name
    const updatedAgent = {
      _id: entry.id,
      id: entry.id,
      name: entry.config.name,
      description: entry.config.description,
      mode: entry.config.mode,
      hidden: entry.config.hidden,
      color: entry.config.color,
      temperature: entry.config.temperature,
      steps: entry.config.steps,
      model: entry.config.model,
      fallback_model: entry.config.fallback_model,
      tools: entry.config.tools,
    }
    
    setAllAgents((prev) =>
      prev.map((a) =>
        a._id === id
          ? { ...a, ...updatedAgent }
          : a,
      ),
    )
    
    setAgents((prev) => {
      const updated = prev.map((a) =>
        a._id === id
          ? { ...a, ...updatedAgent }
          : a,
      )
      // Filter based on hidden status - use the updated hidden value
      return updated.filter((a) => !a.hidden)
    })
    
    return entry
  }, [allAgents])

  const deleteAgent = useCallback(async (id: string): Promise<void> => {
    await opendora.agent.remove(id)
    // Optimistically remove from local list — match by _id slug
    setAllAgents((prev) => prev.filter((a) => a._id !== id))
    setAgents((prev) => prev.filter((a) => a._id !== id))
    // If the deleted agent was selected, fall back to "build"
    setSelectedAgent((prev) => (prev === id ? "build" : prev))
  }, [])

  const getAgentPersona = useCallback((id: string): Promise<string> => {
    return opendora.agent.getPersona(id)
  }, [])

  const saveAgentPersona = useCallback(async (id: string, text: string): Promise<void> => {
    await opendora.agent.setPersona(id, text)
  }, [])

  const generateAgent = useCallback(
    (description: string, model?: { providerID: string; modelID: string }): Promise<GeneratedAgent> => {
      return opendora.agent.generate({ description, model })
    },
    [],
  )

  const setSessionAgent = useCallback(async (sessionID: string, agentID: string | null): Promise<void> => {
    const updated = await opendora.session.setAgent(sessionID, agentID)
    setSessions((prev) => prev.map((s) => (s.id === sessionID ? updated : s)))
    // If this is the currently selected session, sync the agent
    if (selectedSessionRef.current?.id === sessionID && agentID) {
      setSelectedAgent(agentID)
    }
  }, [])

  const setAgentMainSession = useCallback(async (agentID: string, sessionID: string): Promise<void> => {
    const updated = await opendora.agent.setMainSession(agentID, sessionID)
    setSessions((prev) => prev.map((s) => {
      if (s.id === sessionID) return updated
      // Demote the old main (role) session for this agent to scope in local state
      if (s.agentID === agentID && s.sessionType === "role") return { ...s, sessionType: "scope" as const }
      return s
    }))
    // If this is the currently selected agent, navigate to the new main session
    setSelectedAgent((prev) => {
      if (prev === agentID) {
        setSelectedSessionId(sessionID)
        selectedSessionRef.current = updated
      }
      return prev
    })
  }, [])

  const selectAgent = useCallback(async (agentId: string) => {
    setSelectedAgent(agentId)
    // Navigate to the agent's main session when switching agents
    try {
      const session = await opendora.agent.mainSession(agentId)
      if (session?.id) {
        setSelectedSessionId(session.id)
        selectedSessionRef.current = session
        setMessages([])
        setStatus("ready")
        setError(null)
      } else {
        // No main session exists, clear selection but don't crash
        setSelectedSessionId(null)
        selectedSessionRef.current = null
        setMessages([])
        setStatus("ready")
        setError(null)
      }
    } catch (err) {
      // If main session fetch fails, just switch agent without navigating
      console.warn("Failed to fetch main session for agent", agentId, err)
      setSelectedSessionId(null)
      selectedSessionRef.current = null
      setMessages([])
      setStatus("ready")
      setError(null)
    }
  }, [])
  const toggleChatLayout = useCallback(() => {
    setIsChatCentered((prev) => !prev)
  }, [])

  return {
    sessions,
    agentSessions,
    selectedSession,
    selectSession,
    createSession,
    setSessionAgent,
    setAgentMainSession,
    messages,
    questionRequests: selectedSession ? (questionRequests[selectedSession.id] ?? []) : [],
    replyQuestion,
    rejectQuestion,
    status,
    sendMessage,
    abort,
    agents,
    allAgents,
    selectedAgent,
    selectAgent,
    activeSessions,
    createAgent,
    updateAgent,
    deleteAgent,
    getAgentPersona,
    saveAgentPersona,
    generateAgent,
    providers,
    connectedProviders,
    defaultModels,
    refreshProviders,
    error,
    isChatCentered,
    toggleChatLayout,
  }
}
