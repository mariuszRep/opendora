"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
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

const DEFAULT_AGENT_KEY = "opendora:default-agent"
const LAST_SESSION_BY_AGENT_KEY = "opendora:last-session-by-agent"
function getStoredDefaultAgent(): string | null {
  try { return localStorage.getItem(DEFAULT_AGENT_KEY) } catch { return null }
}
function storeDefaultAgent(id: string): void {
  try { localStorage.setItem(DEFAULT_AGENT_KEY, id) } catch { }
}
function getStoredLastSessionByAgent(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LAST_SESSION_BY_AGENT_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
function storeLastSessionByAgent(map: Record<string, string>): void {
  try { localStorage.setItem(LAST_SESSION_BY_AGENT_KEY, JSON.stringify(map)) } catch { }
}

export type UseOpendoraResult = {
  // Sessions
  sessions: Session[]
  agentSessions: Session[]
  selectedSession: Session | null
  selectSession: (id: string) => void
  createSession: (sessionType?: SessionType) => Promise<string>
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
  abortSession: (sessionID: string) => void
  // Agents — read
  agents: (Agent & { _id: string })[]
  allAgents: (Agent & { _id: string })[]
  selectedAgent: string
  selectAgent: (name: string) => void
  defaultAgent: string | null
  setDefaultAgent: (agentId: string) => void
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
  // Fallback groups — active provider slot per groupID
  fallbackActiveSlots: Record<string, { providerID: string; modelID: string }>
  // Per-provider model filter: "all" | "free" | "none"
  modelFilters: Record<string, "all" | "free" | "none">
  setModelFilter: (providerID: string, filter: "all" | "free" | "none") => void
  // Error
  error: string | null
  // UI Layout
  isChatCentered: boolean
  toggleChatLayout: () => void
}

export function useOpendora(): UseOpendoraResult {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
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
  const [fallbackActiveSlots, setFallbackActiveSlots] = useState<Record<string, { providerID: string; modelID: string }>>({})
  const [modelFilters, setModelFilters] = useState<Record<string, "all" | "free" | "none">>({})
  const [allAgents, setAllAgents] = useState<(Agent & { _id: string })[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>("build")
  const [isChatCentered, setIsChatCentered] = useState(false)
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set())
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(() => getStoredDefaultAgent())
  const [lastSessionByAgent, setLastSessionByAgent] = useState<Record<string, string>>(() => getStoredLastSessionByAgent())

  const selectedSessionRef = useRef<Session | null>(null)
  const suppressUrlSyncRef = useRef(false)
  const lastSessionByAgentRef = useRef<Record<string, string>>(lastSessionByAgent)
  const initialRequestedSessionIdRef = useRef<string | null>(searchParams.get("session"))

  const buildDashboardUrl = useCallback((sessionID?: string | null, messageID?: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (sessionID) params.set("session", sessionID)
    else params.delete("session")
    if (messageID) params.set("message", messageID)
    else params.delete("message")
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }, [pathname, searchParams])

  const getAgentId = useCallback((agent: Agent & { id?: string }) => agent.id ?? agent.name, [])

  const refreshAgentsState = useCallback(async () => {
    const agentData = await opendora.agent.list()
    const agentsWithId = agentData.map((a) => {
      const id = getAgentId(a)
      return { ...a, _id: id, id }
    })
    setAllAgents(agentsWithId)
    setAgents(agentsWithId.filter((a) => !a.hidden))
    return agentsWithId
  }, [getAgentId])


  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null
  const sortSessionsForAgent = useCallback((agentId: string, source: Session[]) => {
    const agentScoped = source.filter((s) => s.agentID === agentId)
    const mainSession = agentScoped.find((s) => s.sessionType === "role") ?? null
    const remaining = agentScoped
      .filter((s) => s.id !== mainSession?.id)
      .sort((a, b) => b.time.updated - a.time.updated)
    return mainSession ? [mainSession, ...remaining] : remaining
  }, [])
  // Sessions that belong to the currently selected agent
  const agentSessions = sortSessionsForAgent(selectedAgent, sessions)

  const refreshProviders = useCallback(async () => {
    const providerData = await opendora.provider.list()
    setProviders(providerData.all)
    setConnectedProviders(providerData.connected)
    setDefaultModels(providerData.default)
  }, [])

  useEffect(() => {
    selectedSessionRef.current = selectedSession
  }, [selectedSession])

  useEffect(() => {
    lastSessionByAgentRef.current = lastSessionByAgent
  }, [lastSessionByAgent])

  const rememberSessionForAgent = useCallback((session: Session | null | undefined) => {
    if (!session?.agentID) return
    setLastSessionByAgent((prev) => {
      if (prev[session.agentID!] === session.id) return prev
      const next = { ...prev, [session.agentID!]: session.id }
      storeLastSessionByAgent(next)
      return next
    })
  }, [])

  useEffect(() => {
    rememberSessionForAgent(selectedSession)
  }, [selectedSession, rememberSessionForAgent])

  // Bootstrap: load providers, agents, sessions
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const [providerData, agentData, sessionData, questionData, configData] = await Promise.all([
          opendora.provider.list(),
          opendora.agent.list(),
          opendora.session.list(),
          opendora.question.list(),
          opendora.config.get(),
        ])
        if (cancelled) return

        setProviders(providerData.all)
        setConnectedProviders(providerData.connected)
        setDefaultModels(providerData.default)
        
        // Load model filters from backend config
        if (configData.model_filters) {
          setModelFilters(configData.model_filters)
        }

        // Attach _id (agent slug) so CRUD can match by id rather than display name
        // allAgents includes all agents (visible and hidden)
        const agentsWithId = agentData.map((a) => {
          const id = getAgentId(a)
          return { ...a, _id: id, id }
        })
        setAllAgents(agentsWithId)
        
        // agents only includes visible agents (for sidebar)
        const visibleAgents = agentsWithId.filter((a) => !a.hidden)
        setAgents(visibleAgents)

        const sorted = [...sessionData].sort((a, b) => b.time.updated - a.time.updated)
        setSessions(sorted)

        const requestedSessionID = initialRequestedSessionIdRef.current
        const requestedSession = requestedSessionID
          ? sorted.find((s) => s.id === requestedSessionID) ?? null
          : null

        // Navigate to the requested session first; otherwise fall back to the default agent's main session.
        const storedDefault = getStoredDefaultAgent()
        const targetAgentId = requestedSession?.agentID
          ?? ((storedDefault && agentsWithId.some((a) => a._id === storedDefault))
            ? storedDefault
            : visibleAgents[0]?._id ?? null)
        if (targetAgentId) {
          setSelectedAgent(targetAgentId)
          const sortedForAgent = sortSessionsForAgent(targetAgentId, sorted)
          const remembered = lastSessionByAgentRef.current[targetAgentId]
            ? sortedForAgent.find((s) => s.id === lastSessionByAgentRef.current[targetAgentId]) ?? null
            : null
          const mainSess = requestedSession
            ?? remembered
            ?? sortedForAgent[0]
            ?? null
          if (mainSess) {
            setSelectedSessionId(mainSess.id)
            selectedSessionRef.current = mainSess
            rememberSessionForAgent(mainSess)
          }
        }

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
  }, [getAgentId, rememberSessionForAgent, sortSessionsForAgent])

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

  useEffect(() => {
    const requestedSessionID = searchParams.get("session")
    if (!requestedSessionID || requestedSessionID === selectedSessionRef.current?.id) return
    const targetSession = sessions.find((session) => session.id === requestedSessionID)
    if (!targetSession) return

    suppressUrlSyncRef.current = true
    setSelectedSessionId(targetSession.id)
    selectedSessionRef.current = targetSession
    setStatus("ready")
    setError(null)
    if (targetSession.agentID) {
      setSelectedAgent(targetSession.agentID)
    }
  }, [searchParams, sessions])

  useEffect(() => {
    if (!selectedSessionId) return
    if (suppressUrlSyncRef.current) {
      suppressUrlSyncRef.current = false
      return
    }
    const requestedSessionID = searchParams.get("session")
    if (requestedSessionID === selectedSessionId) return
    router.replace(buildDashboardUrl(selectedSessionId, null), { scroll: false })
  }, [selectedSessionId, searchParams, router, buildDashboardUrl])

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
          // Don't change the selected session - let the creator handle selection
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
        case "session.fallback.switched": {
          const { groupID, newSlot } = (event as { type: string; properties: { groupID: string; newSlot: { providerID: string; modelID: string } } }).properties
          setFallbackActiveSlots((prev) => ({ ...prev, [groupID]: newSlot }))
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
      // SSE reconnected — reset stuck status and navigate back to the default agent's main session
      setStatus((prev) => (prev === "streaming" || prev === "submitted" ? "ready" : prev))
      const defaultId = getStoredDefaultAgent()
      if (defaultId) {
        setSelectedAgent(defaultId)
        setMessages([])
        opendora.agent.mainSession(defaultId).then((session) => {
          if (session?.id) {
            setSelectedSessionId(session.id)
            selectedSessionRef.current = session
          }
        }).catch(() => {
          // If API fails, fall back to local sessions
          setSessions((prev) => {
            const fallback = prev.find((s) => s.agentID === defaultId && s.sessionType === "role")
              ?? prev.find((s) => s.agentID === defaultId)
              ?? null
            setSelectedSessionId(fallback?.id ?? null)
            selectedSessionRef.current = fallback
            return prev
          })
        })
      }
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
    router.push(buildDashboardUrl(id, null), { scroll: false })
    // Sync the selected agent to match the session's assigned agent
    setSessions((prev) => {
      const session = prev.find((s) => s.id === id)
      if (session?.agentID) {
        setSelectedAgent(session.agentID)
      }
      rememberSessionForAgent(session)
      return prev
    })
  }, [buildDashboardUrl, rememberSessionForAgent, router])

  const createSession = useCallback(async (sessionType?: SessionType): Promise<string> => {
    try {
      const session = await opendora.session.create({
        ...(sessionType ? { sessionType } : {}),
        ...(selectedAgent ? { agentID: selectedAgent } : {}),
      })
      setSessions((prev) => {
        if (prev.find((s) => s.id === session.id)) return prev
        return [session, ...prev]
      })
      setSelectedSessionId(session.id)
      router.push(buildDashboardUrl(session.id, null), { scroll: false })
      // Update ref immediately to avoid race condition
      selectedSessionRef.current = session
      setMessages([])
      setStatus("ready")
      setError(null)
      return session.id
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    }
  }, [selectedAgent, router, buildDashboardUrl])

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

  const abortSession = useCallback((sessionID: string) => {
    opendora.session.abort(sessionID).catch(() => { })
  }, [])

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  const createAgent = useCallback(async (config: AgentConfig, persona?: string, injection?: string) => {
    const entry = await opendora.agent.create({ config, persona, injection })
    await refreshAgentsState()
    return entry
  }, [refreshAgentsState])

  const updateAgent = useCallback(async (id: string, config: Partial<AgentConfig>, persona?: string, injection?: string) => {
    const entry = await opendora.agent.update(id, { config, persona, injection })
    await refreshAgentsState()
    return entry
  }, [refreshAgentsState])

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
    // Only navigate to the new main session if the user is currently on that agent's old main session
    // or if no session is currently selected
    setSelectedAgent((prev) => {
      if (prev === agentID) {
        const currentSession = selectedSessionRef.current
        const shouldNavigate = !currentSession || 
          (currentSession.agentID === agentID && currentSession.sessionType === "role")
        if (shouldNavigate) {
          setSelectedSessionId(sessionID)
          router.push(buildDashboardUrl(sessionID, null), { scroll: false })
        }
      }
      return prev
    })
  }, [router, buildDashboardUrl])

  const selectAgent = useCallback(async (agentId: string) => {
    setSelectedAgent(agentId)
    setMessages([])
    setStatus("ready")
    setError(null)

    const applySession = (session: Session | null | undefined) => {
      if (session?.id) {
        setSelectedSessionId(session.id)
        router.push(buildDashboardUrl(session.id, null), { scroll: false })
        selectedSessionRef.current = session
        rememberSessionForAgent(session)
      } else {
        setSelectedSessionId(null)
        selectedSessionRef.current = null
      }
    }

    const fallbackFromLocal = () => {
      setSessions((prev) => {
        const sortedForAgent = sortSessionsForAgent(agentId, prev)
        const activeForAgent = sortedForAgent.filter((s) => activeSessions.has(s.id))
        const remembered = lastSessionByAgentRef.current[agentId]
          ? sortedForAgent.find((s) => s.id === lastSessionByAgentRef.current[agentId]) ?? null
          : null
        const fallback = activeForAgent[0]
          ?? remembered
          ?? sortedForAgent[0]
          ?? null
        applySession(fallback)
        return prev
      })
    }

    try {
      const mainSession = await opendora.agent.mainSession(agentId)
      const localSorted = sortSessionsForAgent(agentId, sessions)
      const activeForAgent = localSorted.filter((s) => activeSessions.has(s.id))
      const remembered = lastSessionByAgentRef.current[agentId]
        ? localSorted.find((s) => s.id === lastSessionByAgentRef.current[agentId]) ?? null
        : null
      if (activeForAgent[0] || remembered || mainSession?.id) {
        applySession(activeForAgent[0] ?? remembered ?? mainSession)
      } else {
        fallbackFromLocal()
      }
    } catch (err) {
      console.warn("Failed to fetch main session for agent", agentId, err)
      fallbackFromLocal()
    }
  }, [activeSessions, buildDashboardUrl, rememberSessionForAgent, router, sessions, sortSessionsForAgent])

  const setDefaultAgent = useCallback((agentId: string) => {
    storeDefaultAgent(agentId)
    setDefaultAgentId(agentId)
  }, [])

  const toggleChatLayout = useCallback(() => {
    setIsChatCentered((prev) => !prev)
  }, [])

  const setModelFilter = useCallback(async (providerID: string, filter: "all" | "free" | "none") => {
    setModelFilters((prev) => {
      const next = { ...prev, [providerID]: filter }
      // Save to backend config for persistence
      opendora.config.update({ model_filters: next }).catch((err) => {
        console.error("Failed to save model filter to config:", err)
      })
      return next
    })
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
    abortSession,
    agents,
    allAgents,
    selectedAgent,
    selectAgent,
    defaultAgent: defaultAgentId,
    setDefaultAgent,
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
    fallbackActiveSlots,
    modelFilters,
    setModelFilter,
    error,
    isChatCentered,
    toggleChatLayout,
  }
}
