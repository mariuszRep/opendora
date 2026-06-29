"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import type { NotifyOptions } from "@/hooks/use-notify"
import {
  opendora,
  SessionBusyError,
  type Agent,
  type AgentConfig,
  type AgentEntry,
  type GeneratedAgent,
  type Event,
  type Message,
  type MessageWithParts,
  type Part,
  type PermissionReply,
  type PermissionRequest,
  type Provider,
  type QuestionAnswer,
  type QuestionRequest,
  type Schedule,
  type Session,
  type SessionType,
} from "@/lib/projectflows"

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
  selectSession: (id: string, agentIdHint?: string) => void
  createSession: (sessionType?: SessionType, agentID?: string) => Promise<string>
  setSessionAgent: (sessionID: string, agentID: string | null) => Promise<void>
  setAgentMainSession: (agentID: string, sessionID: string) => Promise<void>
  setSessionModel: (sessionID: string, model: string | null) => Promise<void>
  activeSessions: Set<string>
  // Messages
  messages: MessageWithParts[]
  questionRequests: QuestionRequest[]
  allQuestionRequests: Record<string, QuestionRequest[]>
  replyQuestion: (requestID: string, answers: QuestionAnswer[]) => Promise<void>
  rejectQuestion: (requestID: string) => Promise<void>
  permissionRequests: PermissionRequest[]
  allPermissionRequests: Record<string, PermissionRequest[]>
  replyPermission: (requestID: string, reply: PermissionReply) => Promise<void>
  status: ChatStatus
  sendMessage: (text: string, options?: { model?: { providerID: string; modelID: string }; fallbackGroupID?: string; agent?: string; files?: Array<{ type: "file"; mime: string; filename?: string; url: string }> }) => Promise<void>
  abort: () => void
  abortSession: (sessionID: string) => void
  compact: (model: { providerID: string; modelID: string }) => Promise<void>
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
  // Fallback groups
  modelGroups: { id: string; name: string; models: { providerID: string; modelID: string }[] }[]
  refreshModelGroups: () => Promise<void>
  // Provider timeout status (includes per-model cooldowns)
  providerTimeouts: Record<string, import("@/lib/projectflows").ProviderTimeoutInfo>
  refreshProviderTimeouts: () => Promise<void>
  // Auth expired providers
  authExpiredProviders: Record<string, boolean>
  // Session retry status
  sessionRetryStatus: Record<string, { attempt: number; message: string; next: number }>
  // Error
  error: string | null
  // UI Layout
  isChatCentered: boolean
  toggleChatLayout: () => void
  fileTreeOpen: boolean
  toggleFileTree: () => void
  sessionTreeOpen: boolean
  toggleSessionTree: () => void
  webPreviewOpen: boolean
  toggleWebPreview: () => void
  webPreviewUrl: string
  setWebPreviewUrl: (url: string) => void
  filePreviewOpen: boolean
  filePreviewPath: string
  filePreviewDisplay: string
  openFilePreview: (path: string, displayPath?: string) => void
  closeFilePreview: () => void
  closePreview: () => void
  schedules: Schedule[]
  refreshSchedules: () => Promise<void>
}

function describePermissionTitle(req: PermissionRequest): string {
  switch (req.resource) {
    case "file":
      return req.access === "write" ? "File write permission" : "File read permission"
    case "bash":
      return "Shell command permission"
    case "directory":
      return "Directory access permission"
    case "network":
      return "Network access permission"
    case "tool":
      return "Tool use permission"
    case "agent":
      return "Delegate agent permission"
    default:
      return "Permission request"
  }
}

function describePermissionMessage(req: PermissionRequest): string {
  const meta = req.metadata ?? {}
  const first = req.patterns?.[0]
  if (req.resource === "file" && req.access === "read") return `Read ${first ?? "file"}`
  if (req.resource === "file" && req.access === "write") return `Edit ${meta.filepath ?? first ?? "file"}`
  if (req.resource === "bash") return meta.command ? `Run: ${meta.command}` : "Run shell command"
  if (req.resource === "directory") return `Access directory: ${first ?? ""}`
  if (req.resource === "network") return `Fetch ${meta.url ?? meta.query ?? first ?? "resource"}`
  if (req.resource === "tool") return `Use tool: ${first ?? req.resource}`
  if (req.resource === "agent") return `Delegate to: ${first ?? "agent"}`
  return `Use ${req.resource} (${req.access})`
}

export function useOpendora(opts?: {
  notify?: (opts: NotifyOptions) => void
  removeByPermissionID?: (permissionRequestID: string) => void
  dismissPermissionToast?: (permissionRequestID: string) => void
}): UseOpendoraResult {
  const { notify, removeByPermissionID, dismissPermissionToast } = opts ?? {}
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageWithParts[]>([])
  const [questionRequests, setQuestionRequests] = useState<Record<string, QuestionRequest[]>>({})
  const [permissionRequests, setPermissionRequests] = useState<Record<string, PermissionRequest[]>>({})
  const [status, setStatus] = useState<ChatStatus>("ready")
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [connectedProviders, setConnectedProviders] = useState<string[]>([])
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({})
  const [agents, setAgents] = useState<(Agent & { _id: string })[]>([])
  const [fallbackActiveSlots, setFallbackActiveSlots] = useState<Record<string, { providerID: string; modelID: string }>>({})
  const [modelFilters, setModelFilters] = useState<Record<string, "all" | "free" | "none">>({})
  const [modelGroups, setModelGroups] = useState<{ id: string; name: string; models: { providerID: string; modelID: string }[] }[]>([])
  const [providerTimeouts, setProviderTimeouts] = useState<Record<string, import("@/lib/projectflows").ProviderTimeoutInfo>>({})
  const [authExpiredProviders, setAuthExpiredProviders] = useState<Record<string, boolean>>({})
  const [allAgents, setAllAgents] = useState<(Agent & { _id: string })[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>("")
  const [isChatCentered, setIsChatCentered] = useState(false)
  const [fileTreeOpen, setFileTreeOpen] = useState(false)
  const [sessionTreeOpen, setSessionTreeOpen] = useState(false)
  const [webPreviewOpen, setWebPreviewOpen] = useState(false)
  const [webPreviewUrl, setWebPreviewUrl] = useState("")
  const [filePreviewOpen, setFilePreviewOpen] = useState(false)
  const [filePreviewPath, setFilePreviewPath] = useState("")
  const [filePreviewDisplay, setFilePreviewDisplay] = useState("")
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set())
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(() => getStoredDefaultAgent())
  const [lastSessionByAgent, setLastSessionByAgent] = useState<Record<string, string>>(() => getStoredLastSessionByAgent())
  const [sessionRetryStatus, setSessionRetryStatus] = useState<Record<string, { attempt: number; message: string; next: number }>>({})

  const selectedSessionRef = useRef<Session | null>(null)
  const pendingSessionIdRef = useRef<string | null>(null)
  const statusRef = useRef<ChatStatus>("ready")
  const suppressUrlSyncRef = useRef(false)
  const lastSessionByAgentRef = useRef<Record<string, string>>(lastSessionByAgent)
  const initialRequestedSessionIdRef = useRef<string | null>(searchParams.get("session"))
  // Stable refs so callbacks don't need state in their dependency arrays
  const sessionsRef = useRef<Session[]>([])
  const activeSessionsRef = useRef<Set<string>>(new Set())
  const messagesRef = useRef<MessageWithParts[]>([])
  const questionRequestsRef = useRef<Record<string, QuestionRequest[]>>({})
  // Per-session message cache: serve stale-while-revalidate on session switch
  const messageCacheRef = useRef<Map<string, MessageWithParts[]>>(new Map())
  const messageFetchRef = useRef<Map<string, Promise<MessageWithParts[]>>>(new Map())
  const deltaSeqRef = useRef(new Map<string, number>())


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

  const refreshProviderTimeouts = useCallback(async () => {
    const data = await opendora.provider.timeout()
    setProviderTimeouts(data)
  }, [])

  const refreshSchedules = useCallback(async () => {
    const data = await opendora.schedule.list()
    setSchedules(data)
  }, [])

  const fetchSessionMessages = useCallback((sessionID: string) => {
    const existing = messageFetchRef.current.get(sessionID)
    if (existing) return existing

    const request = opendora.session.messages(sessionID)
      .finally(() => {
        if (messageFetchRef.current.get(sessionID) === request) {
          messageFetchRef.current.delete(sessionID)
        }
      })
    messageFetchRef.current.set(sessionID, request)
    return request
  }, [])

  useEffect(() => {
    selectedSessionRef.current = selectedSession
  }, [selectedSession])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    lastSessionByAgentRef.current = lastSessionByAgent
  }, [lastSessionByAgent])

  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  useEffect(() => { activeSessionsRef.current = activeSessions }, [activeSessions])
  useEffect(() => { messagesRef.current = messages }, [messages])

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

  // Periodically refresh providers every hour to get fresh model lists
  useEffect(() => {
    const interval = setInterval(() => {
      refreshProviders().catch(() => {})
      refreshProviderTimeouts().catch(() => {})
    }, 60 * 60 * 1000) // 1 hour
    return () => clearInterval(interval)
  }, [refreshProviders])

  // Bootstrap: load providers, agents, sessions
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const [providerData, agentData, sessionData, questionData, configData, scheduleData, sessionStatusData, timeoutData] = await Promise.all([
          opendora.provider.list(),
          opendora.agent.list(),
          opendora.session.list(),
          opendora.question.list(),
          opendora.config.get(),
          opendora.schedule.list(),
          opendora.session.status().catch(() => ({} as Record<string, { type: string }>)),
          opendora.provider.timeout().catch(() => ({})),
        ])
        if (cancelled) return

        setProviders(providerData.all)
        setConnectedProviders(providerData.connected)
        setDefaultModels(providerData.default)
        setProviderTimeouts(timeoutData)

        // Load model filters from backend config
        if (configData.model_filters) {
          setModelFilters(configData.model_filters)
        }
        if (configData.model_groups) {
          setModelGroups(configData.model_groups as { id: string; name: string; models: { providerID: string; modelID: string }[] }[])
        }

        setSchedules(scheduleData)

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

        const initialActive = new Set(
          Object.entries(sessionStatusData)
            .filter(([, s]) => s.type !== "idle")
            .map(([id]) => id),
        )
        setActiveSessions(initialActive)
        activeSessionsRef.current = initialActive

        const requestedSessionID = initialRequestedSessionIdRef.current
        const requestedSession = requestedSessionID
          ? sorted.find((s) => s.id === requestedSessionID) ?? null
          : null

        // Navigate to the requested session first; otherwise fall back to the default agent's main session.
        const storedDefault = getStoredDefaultAgent()
        const targetAgentId = requestedSession?.agentID
          ?? ((storedDefault && visibleAgents.some((a) => a._id === storedDefault))
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
            if (initialActive.has(mainSess.id)) setStatus("streaming")
          }
        }

        const initialRequests = questionData.reduce<Record<string, QuestionRequest[]>>((acc, request) => {
          acc[request.sessionID] ??= []
          acc[request.sessionID].push(request)
          return acc
        }, {})
        questionRequestsRef.current = initialRequests
        setQuestionRequests(initialRequests)
      } catch (err) {
        if (cancelled) return
        console.error("[init] bootstrap failed", err)
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    init()
    return () => { cancelled = true }
  }, [getAgentId, rememberSessionForAgent, sortSessionsForAgent])

  useEffect(() => {
    function handleFocus() {
      refreshProviders().catch(() => { })
      refreshProviderTimeouts().catch(() => { })
    }

    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [refreshProviders])

  // Load messages when session changes (stale-while-revalidate via cache)
  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([])
      return
    }
    const cached = messageCacheRef.current.get(selectedSessionId)
    if (cached) {
      setMessages(cached)
    } else {
      setMessages([])
    }
    let cancelled = false
    // Capture id in closure so the cache write is always for the right session
    // even after the effect cleanup fires (user switched away mid-fetch).
    const fetchingForId = selectedSessionId
    fetchSessionMessages(fetchingForId).then((msgs) => {
      if (!cancelled) {
        setMessages((current) => {
          // Merge fetched messages with any SSE updates that arrived during the fetch.
          // For each message, prefer the version with more parts (SSE may have added
          // streaming parts not yet in the DB).  When part counts are equal, do a
          // part-level merge: for text parts keep the longer accumulated text (the
          // DB only writes at text-start "" and text-end, so the SSE-accumulated
          // version always has more text mid-stream than the stale DB snapshot).
          const currentById = new Map(current.map((m) => [m.info.id, m]))
          const fetchedIds = new Set(msgs.map((m) => m.info.id))
          const merged = msgs.map((fetchedMsg) => {
            const currentMsg = currentById.get(fetchedMsg.info.id)
            if (!currentMsg) return fetchedMsg
            if (currentMsg.parts.length > fetchedMsg.parts.length) return currentMsg
            if (fetchedMsg.parts.length > currentMsg.parts.length) return fetchedMsg
            // Same part count: merge part-by-part so we keep the most accumulated text.
            const currentPartsById = new Map(currentMsg.parts.map((p) => [p.id, p]))
            const mergedParts = fetchedMsg.parts.map((fp) => {
              const cp = currentPartsById.get(fp.id)
              if (!cp) return fp
              if (fp.type === "text" && cp.type === "text") {
                const fText = typeof (fp as any).text === "string" ? (fp as any).text : ""
                const cText = typeof (cp as any).text === "string" ? (cp as any).text : ""
                return cText.length > fText.length ? cp : fp
              }
              return fp
            })
            return { ...fetchedMsg, parts: mergedParts }
          })
          // Append any SSE-only messages not yet in the fetch snapshot (e.g. a new
          // assistant message that started streaming between fetch-start and fetch-end)
          for (const m of current) {
            if (!fetchedIds.has(m.info.id) && !m.info.id.startsWith("_optimistic_")) {
              merged.push(m)
            }
          }
          messageCacheRef.current.set(fetchingForId, merged)
          return merged
        })
      } else {
        // Effect was cancelled because the user switched sessions before the API
        // returned.  Still populate the cache so that returning to this session
        // is instant (no second round-trip needed).
        if (msgs.length > 0) {
          messageCacheRef.current.set(fetchingForId, msgs)
        }
      }
    }).catch((err) => { console.error("[messages] fetch failed", fetchingForId, err) })
    return () => { cancelled = true }
  }, [selectedSessionId, fetchSessionMessages])

  useEffect(() => {
    const requestedSessionID = searchParams.get("session")
    if (!requestedSessionID || requestedSessionID === selectedSessionRef.current?.id) return
    // Use sessionsRef.current (always current) instead of the sessions state value.
    // sessions must NOT be in the dep array: if it were, this effect would re-run whenever
    // sessions state changes (e.g. from an SSE event) while searchParams still holds the
    // previous session ID — causing it to override a just-created session selection before
    // router.push has had a chance to update the URL.
    const targetSession = sessionsRef.current.find((session) => session.id === requestedSessionID)
    if (!targetSession) return

    suppressUrlSyncRef.current = true
    setSelectedSessionId(targetSession.id)
    selectedSessionRef.current = targetSession
    setStatus(activeSessionsRef.current.has(targetSession.id) ? "streaming" : "ready")
    setError(null)
    if (targetSession.agentID) {
      setSelectedAgent(targetSession.agentID)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (!selectedSessionId) return
    if (pathname !== "/dashboard") return
    if (suppressUrlSyncRef.current) {
      suppressUrlSyncRef.current = false
      return
    }
    const requestedSessionID = searchParams.get("session")
    if (requestedSessionID === selectedSessionId) return
    router.replace(`/dashboard?session=${selectedSessionId}`, { scroll: false })
  }, [selectedSessionId, searchParams, pathname, router])

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
          // Complete a pending selectSession call that arrived before this session was in the list
          if (pendingSessionIdRef.current === info.id) {
            pendingSessionIdRef.current = null
            selectedSessionRef.current = info
            setSelectedSessionId(info.id)
            setStatus(activeSessionsRef.current.has(info.id) ? "streaming" : "ready")
            setError(null)
            if (info.agentID) setSelectedAgent(info.agentID)
          }
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

          // NOTE: activeSessions is driven exclusively by `session.status` events.
          // Message timestamps are not authoritative for loop activity — between
          // iterations (e.g. tool calls) the assistant message completes while the
          // loop is still running, which previously caused the side panel spinner
          // to flicker off.

          if (info.sessionID !== selectedSessionRef.current?.id) break
          // Check before the state update so we can call setStatus outside the updater.
          // Calling setState inside a setState updater is a React anti-pattern that can
          // behave unreliably in Concurrent Mode.
          const isNewIncompleteAssistant =
            info.role === "assistant" &&
            !(info as { time: { completed?: number } }).time.completed &&
            !messagesRef.current.find((m) => m.info.id === info.id)
          setMessages((prev) => {
            // Replace the optimistic placeholder with the real user message
            const withoutOptimistic = info.role === "user"
              ? prev.filter((m) => !m.info.id.startsWith("_optimistic_"))
              : prev
            const idx = withoutOptimistic.findIndex((m) => m.info.id === info.id)
            if (idx === -1) return [...withoutOptimistic, { info, parts: [] }]
            return withoutOptimistic.map((m, i) => (i === idx ? { ...m, info } : m))
          })
          if (isNewIncompleteAssistant) setStatus("streaming")
          break
        }
        case "session.idle": {
          // Deprecated: superseded by `session.status` { type: "idle" }.
          // Kept as a no-op for older servers; the status handler below is authoritative.
          break
        }
        case "session.status": {
          const { sessionID, status } = (event as { type: string; properties: { sessionID: string; status: { type: "idle" | "busy" | "retry"; attempt?: number; message?: string; next?: number } } }).properties
          if (status.type === "idle") {
            setActiveSessions((prev) => {
              if (!prev.has(sessionID)) return prev
              const next = new Set(prev)
              next.delete(sessionID)
              return next
            })
            questionRequestsRef.current[sessionID] = []
            setQuestionRequests((prev) => ({ ...prev, [sessionID]: [] }))
            setSessionRetryStatus((prev) => {
              if (!(sessionID in prev)) return prev
              const next = { ...prev }
              delete next[sessionID]
              return next
            })
            if (selectedSessionRef.current?.id === sessionID) {
              setStatus("ready")
            }
          } else if (status.type === "retry") {
            setActiveSessions((prev) => prev.has(sessionID) ? prev : new Set(prev).add(sessionID))
            if (selectedSessionRef.current?.id === sessionID) {
              const retryMsg = status.message ?? "Retrying..."
              setSessionRetryStatus((prev) => ({
                ...prev,
                [sessionID]: {
                  attempt: status.attempt ?? 0,
                  message: retryMsg,
                  next: status.next ?? 0,
                },
              }))
            }
          } else {
            // busy
            setActiveSessions((prev) => prev.has(sessionID) ? prev : new Set(prev).add(sessionID))
            // Clear any retry banner now that we're back to a normal busy loop.
            setSessionRetryStatus((prev) => {
              if (!(sessionID in prev)) return prev
              const next = { ...prev }
              delete next[sessionID]
              return next
            })
            if (selectedSessionRef.current?.id === sessionID && statusRef.current !== "streaming") {
              setStatus("streaming")
            }
          }
          break
        }
        case "session.error": {
          const { sessionID, error } = (event as { type: string; properties: { sessionID?: string; error?: { name: string; message: string; data?: Record<string, unknown> } } }).properties
          if (sessionID && selectedSessionRef.current?.id === sessionID && error) {
            const msg = (error.data as { message?: string })?.message ?? error.message
            notify?.({ type: "error", title: "Session error", message: msg }) ?? toast.error(msg, { id: `error-${sessionID}`, duration: 8000 })
            setStatus("error")
            setError(msg)
          }
          break
        }
        case "message.part.updated": {
          const { part } = (event as { type: string; properties: { part: Part } }).properties
          if (part.sessionID !== selectedSessionRef.current?.id) break
          deltaSeqRef.current.delete(`${part.id}:text`)
          setMessages((prev) => {
            const msgIdx = prev.findIndex((m) => m.info.id === part.messageID)
            if (msgIdx === -1) return prev
            const m = prev[msgIdx]
            const idx = m.parts.findIndex((p) => p.id === part.id)
            const newParts = idx === -1 ? [...m.parts, part] : m.parts.map((p, i) => (i === idx ? part : p))
            const next = prev.slice()
            next[msgIdx] = { ...m, parts: newParts }
            return next
          })
          break
        }
        case "message.part.delta": {
          const { sessionID, messageID, partID, field, delta, seq } = (event as {
            type: string
            properties: { sessionID: string; messageID: string; partID: string; field: string; delta: string; seq?: number }
          }).properties
          if (sessionID !== selectedSessionRef.current?.id) break
          if (seq !== undefined) {
            const seqKey = `${partID}:${field}`
            const last = deltaSeqRef.current.get(seqKey) ?? 0
            if (seq <= last) break
            deltaSeqRef.current.set(seqKey, seq)
          }
          setMessages((prev) => {
            const msgIdx = prev.findIndex((m) => m.info.id === messageID)
            if (msgIdx === -1) return prev
            const m = prev[msgIdx]
            const idx = m.parts.findIndex((p) => p.id === partID)
            if (idx === -1) return prev
            const part = m.parts[idx] as Part & Record<string, unknown>
            const existing = typeof part[field] === "string" ? (part[field] as string) : ""
            const newPart = { ...part, [field]: existing + delta }
            const newParts = m.parts.map((p, i) => (i === idx ? newPart : p))
            const next = prev.slice()
            next[msgIdx] = { ...m, parts: newParts }
            return next
          })
          break
        }
        case "session.fallback.switched": {
          const { groupID, newSlot, previousSlot } = (event as { type: string; properties: { groupID: string; previousSlot: { providerID: string; modelID: string }; newSlot: { providerID: string; modelID: string } } }).properties
          setFallbackActiveSlots((prev) => ({ ...prev, [groupID]: newSlot }))
          notify
            ? notify({ type: "warning", title: `${previousSlot.providerID} failed`, message: `Switched to ${newSlot.providerID}` })
            : toast.warning(`${previousSlot.providerID} failed — switched to ${newSlot.providerID}`, { duration: 5000 })
          break
        }
        case "provider.timeout": {
          const { providerID, reason, resetInSeconds } = (event as { type: string; properties: { providerID: string; reason: string; resetInSeconds: number; failedModels: string[] } }).properties
          const failedModels: string[] = (event as any).properties.failedModels ?? []
          const until = Date.now() + resetInSeconds * 1000
          setProviderTimeouts((prev) => ({
            ...prev,
            [providerID]: {
              timedOut: true,
              until,
              reason,
              resetInSeconds,
              failedModels,
              // Per-model details will be populated on next REST poll;
              // seed with provider-wide until time for all failed models
              modelCooldowns: Object.fromEntries(
                failedModels.map((mid) => [
                  mid,
                  { until, resetInSeconds, reason, kind: "quota" },
                ]),
              ),
            },
          }))
          notify
            ? notify({ type: "provider_timeout", title: `${providerID} timed out`, message: reason, providerID })
            : toast.warning(`${providerID} timed out: ${reason}`, { duration: 8000 })
          break
        }
        case "provider.recovered": {
          const { providerID } = (event as { type: string; properties: { providerID: string } }).properties
          setProviderTimeouts((prev) => {
            const next = { ...prev }
            delete next[providerID]
            return next
          })
          setAuthExpiredProviders((prev) => {
            const next = { ...prev }
            delete next[providerID]
            return next
          })
          notify
            ? notify({ type: "provider_recovered", title: `${providerID} recovered`, message: "Provider is now available", providerID })
            : toast.success(`${providerID} recovered`, { duration: 4000 })
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
            questionRequestsRef.current = { ...prev, [request.sessionID]: next }
            return { ...prev, [request.sessionID]: next }
          })
          break
        }
        case "question.replied":
        case "question.rejected": {
          const { sessionID, requestID } = event.properties as { sessionID: string; requestID: string }
          setQuestionRequests((prev) => {
            const existing = prev[sessionID] ?? []
            const filtered = existing.filter((item) => item.id !== requestID)
            questionRequestsRef.current = {
              ...prev,
              [sessionID]: filtered,
            }
            return {
              ...prev,
              [sessionID]: filtered,
            }
          })
          break
        }
        case "permission.asked": {
          const request = event.properties as PermissionRequest
          let isNew = false
          setPermissionRequests((prev) => {
            const existing = prev[request.session_id] ?? []
            const idx = existing.findIndex((item) => item.id === request.id)
            isNew = idx === -1
            const next = idx === -1
              ? [...existing, request]
              : existing.map((item, index) => (index === idx ? request : item))
            return { ...prev, [request.session_id]: next }
          })
          if (isNew && notify) {
            const title = describePermissionTitle(request)
            const message = describePermissionMessage(request)
            const targetSessionID = request.session_id
            notify({
              type: "permission_request",
              title,
              message,
              permissionRequestID: request.id,
              sessionID: targetSessionID,
              action: {
                label: "View",
                href: `/dashboard?session=${targetSessionID}`,
              },
            })
          }
          break
        }
        case "permission.replied": {
          const { session_id, request_id } = event.properties as { session_id: string; request_id: string }
          setPermissionRequests((prev) => {
            const existing = prev[session_id] ?? []
            return {
              ...prev,
              [session_id]: existing.filter((item) => item.id !== request_id),
            }
          })
          removeByPermissionID?.(request_id)
          dismissPermissionToast?.(request_id)
          break
        }
        case "permission.rules.updated": {
          // Trigger blade refresh if it is currently open — handled via refreshRef in the sheet.
          // No state update needed here; the sheet itself listens to this event via its refreshRef.
          break
        }
        case "provider.auth.expired": {
          const { providerID, providerName } = (event as { type: string; properties: { providerID: string; providerName: string } }).properties
          setAuthExpiredProviders((prev) => ({ ...prev, [providerID]: true }))
          notify
            ? notify({ type: "error", title: `${providerName} authentication expired`, message: "Go to Settings → Providers to re-authenticate.", action: { label: "Settings", href: "/dashboard/settings/providers" } })
            : toast.error(`${providerName} authentication expired`, {
                description: "Go to Settings → Providers to re-authenticate.",
                duration: 10000,
                action: { label: "Settings", onClick: () => router.push("/dashboard/settings/providers") },
              })
          break
        }
        case "memory.write": {
          const p = (event as { type: string; properties: { sessionID: string; agentID: string; callID?: string; directory?: string; name: string; description: string; scope: string; action: string } }).properties
          if (p.directory) {
            notify?.({
              type: "info",
              title: `Memory ${p.action}: ${p.name}`,
              message: p.description,
              duration: 8000,
              memoryDelete: { directory: p.directory, name: p.name, scope: p.scope, agentID: p.agentID, callID: p.callID },
            })
          }
          break
        }
      }
    }, () => {
      // SSE reconnected — reload active sessions so spinners reflect true server state.
      opendora.session.status().then((statuses) => {
        const activeIds = new Set(
          Object.entries(statuses)
            .filter(([, s]) => s.type !== "idle")
            .map(([id]) => id),
        )
        setActiveSessions(activeIds)
        activeSessionsRef.current = activeIds
      }).catch(() => {})
      // Reset stuck status only; preserve the user's current session.
      // Only navigate to the default agent if nothing is selected (cold start / first open).
      setStatus((prev) => (prev === "streaming" || prev === "submitted" ? "ready" : prev))
      if (selectedSessionRef.current) return
      const defaultId = getStoredDefaultAgent()
      if (defaultId) {
        setSelectedAgent(defaultId)
        opendora.agent.mainSession(defaultId).then((session) => {
          if (session?.id && !selectedSessionRef.current) {
            setMessages([])
            setSelectedSessionId(session.id)
            selectedSessionRef.current = session
          }
        }).catch(() => {
          if (selectedSessionRef.current) return
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

  const selectSession = useCallback((id: string, agentIdHint?: string) => {
    // Guard: re-clicking the currently selected session should not clear messages.
    if (selectedSessionRef.current?.id === id) {
      // If messages somehow ended up empty (e.g. after a failed fetch), restore
      // from cache or re-fetch so the user never sees a permanently blank chat.
      if (messagesRef.current.length === 0) {
        const cached = messageCacheRef.current.get(id)
        if (cached && cached.length > 0) {
          setMessages(cached)
        } else {
          fetchSessionMessages(id).then((msgs) => {
            if (msgs.length > 0) setMessages(msgs)
          }).catch(() => {})
        }
      }
      return
    }

    // Save current session messages to cache — only when non-empty to avoid
    // overwriting a valid cache with the blank state from a still-pending fetch.
    if (selectedSessionRef.current?.id && messagesRef.current.length > 0) {
      messageCacheRef.current.set(selectedSessionRef.current.id, messagesRef.current)
    }

    // Update ref immediately so the URL sync effect doesn't fire an extra router.replace
    const session = sessionsRef.current.find((s) => s.id === id) ?? null
    if (!session) {
      // Session not yet in the list (SSE hasn't arrived). Set a stub with just
      // the id so the URL→state sync guard (selectedSessionRef.current?.id) still
      // matches and doesn't revert back to the previously selected session.
      // The session.created SSE handler upgrades this to the real object.
      selectedSessionRef.current = (agentIdHint ? { id, agentID: agentIdHint } : { id }) as Session
      pendingSessionIdRef.current = id
    } else {
      selectedSessionRef.current = session
      pendingSessionIdRef.current = null
    }

    // Show cached messages immediately (stale-while-revalidate) so the chat
    // area never flashes blank when switching between previously visited sessions.
    const cachedMessages = messageCacheRef.current.get(id)
    setMessages(cachedMessages ?? [])
    setSelectedSessionId(id)
    setStatus(activeSessionsRef.current.has(id) ? "streaming" : "ready")
    setError(null)
    // Use the resolved session's agent if known, otherwise honor the hint so the
    // agent tab updates eagerly even before the new session arrives via SSE.
    const agentForSession = session?.agentID ?? agentIdHint
    if (agentForSession) setSelectedAgent(agentForSession)
    rememberSessionForAgent(session)
    // Only navigate to /dashboard when not already there; the URL sync effect
    // handles updating the ?session= param when already on /dashboard.
    if (pathname !== "/dashboard") {
      router.push(`/dashboard?session=${id}`, { scroll: false })
    }
  }, [rememberSessionForAgent, router, pathname, fetchSessionMessages])

  const createSession = useCallback(async (sessionType?: SessionType, agentID?: string): Promise<string> => {
    const effectiveAgentID = agentID !== undefined ? agentID : selectedAgent
    try {
      const session = await opendora.session.create({
        sessionType: sessionType ?? "scope",
        ...(effectiveAgentID ? { agentID: effectiveAgentID } : {}),
      })
      setSessions((prev) => {
        if (prev.find((s) => s.id === session.id)) return prev
        return [session, ...prev]
      })
      if (effectiveAgentID) setSelectedAgent(effectiveAgentID)
      setSelectedSessionId(session.id)
      router.push(`/dashboard?session=${session.id}`, { scroll: false })
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
  }, [selectedAgent, router])

  const sendMessage = useCallback(
    async (text: string, options?: { model?: { providerID: string; modelID: string }; fallbackGroupID?: string; agent?: string; files?: Array<{ type: "file"; mime: string; filename?: string; url: string }> }) => {
      const session = selectedSessionRef.current
      if (!session) return
      if (statusRef.current !== "ready") return
      setStatus("submitted")
      setError(null)

      // Optimistically insert the user message so the chat updates instantly,
      // before the SSE event for the real message arrives.
      const optimisticId = `_optimistic_${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          info: {
            id: optimisticId,
            sessionID: session.id,
            role: "user" as const,
            time: { created: Date.now() },
            agent: options?.agent ?? selectedAgent,
            model: options?.model ?? { providerID: "", modelID: "" },
          },
          parts: [
            {
              id: `${optimisticId}_0`,
              type: "text" as const,
              text,
              messageID: optimisticId,
              sessionID: session.id,
              time: { created: Date.now() },
            },
          ],
        },
      ])

      try {
        const parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; filename?: string; url: string }> = [
          { type: "text", text },
          ...(options?.files ?? []),
        ]
        await opendora.session.promptAsync(session.id, {
          parts,
          ...(options?.model ? { model: options.model } : {}),
          ...(options?.fallbackGroupID ? { fallbackGroupID: options.fallbackGroupID } : {}),
          agent: options?.agent ?? selectedAgent,
        })
        // Status transitions to "ready" via SSE session.idle event
      } catch (err) {
        // Remove the optimistic message on failure so the user can retry
        setMessages((prev) => prev.filter((m) => m.info.id !== optimisticId))
        if (err instanceof SessionBusyError) {
          setStatus("ready")
          toast.warning("Session is busy — please wait for the current response to finish.")
          return
        }
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

  const compact = useCallback(async (model: { providerID: string; modelID: string }) => {
    const session = selectedSessionRef.current
    if (!session) return
    await opendora.session.compact(session.id, model)
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
    setAgents((prev) => {
      const remaining = prev.filter((a) => a._id !== id)
      // If the deleted agent was selected, fall back to the first remaining visible agent
      setSelectedAgent((current) => current === id ? (remaining[0]?._id ?? "") : current)
      return remaining
    })
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

  const setSessionModel = useCallback(async (sessionID: string, model: string | null): Promise<void> => {
    // Optimistic update so the model useEffect doesn't revert the selector
    setSessions((prev) => prev.map((s) => (s.id === sessionID ? { ...s, model: model ?? undefined } : s)))
    try {
      await opendora.session.update(sessionID, { model: model ?? undefined })
    } catch (err) {
      // Revert on failure
      setSessions((prev) => prev.map((s) => (s.id === sessionID ? { ...s, model: undefined } : s)))
      console.error("Failed to update session model:", err)
    }
  }, [])

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
          // Defer router navigation to prevent setState during render
          setTimeout(() => {
            router.push(`/dashboard?session=${sessionID}`, { scroll: false })
          }, 0)
        }
      }
      return prev
    })
  }, [router])

  const selectAgent = useCallback((agentId: string) => {
    // Save current session to cache — only when non-empty to avoid overwriting
    // a valid cache entry with the blank state from a still-pending fetch.
    if (selectedSessionRef.current?.id && messagesRef.current.length > 0) {
      messageCacheRef.current.set(selectedSessionRef.current.id, messagesRef.current)
    }

    setSelectedAgent(agentId)
    setStatus("ready")
    setError(null)

    // Use stable refs — no async API call needed.
    // sortSessionsForAgent already puts the "role" (main) session first.
    const sorted = sortSessionsForAgent(agentId, sessionsRef.current)
    const active = sorted.filter((s) => activeSessionsRef.current.has(s.id))
    const remembered = lastSessionByAgentRef.current[agentId]
      ? sorted.find((s) => s.id === lastSessionByAgentRef.current[agentId]) ?? null
      : null
    const session = active[0] ?? remembered ?? sorted[0] ?? null

    if (session?.id) {
      setSelectedSessionId(session.id)
      // Do NOT call router.replace here — the URL sync effect handles it after
      // React commits the final batched state. An eager replace here races with
      // any immediately-following selectSession call (e.g. after a workflow run)
      // and triggers the URL→state effect with the wrong session id, reverting
      // the selection before the workflow session even appears in the list.
      selectedSessionRef.current = session
      rememberSessionForAgent(session)
    } else {
      setSelectedSessionId(null)
      selectedSessionRef.current = null
    }
  }, [rememberSessionForAgent, sortSessionsForAgent])

  const setDefaultAgent = useCallback((agentId: string) => {
    storeDefaultAgent(agentId)
    setDefaultAgentId(agentId)
  }, [])

  const toggleChatLayout = useCallback(() => {
    setIsChatCentered((prev) => !prev)
  }, [])

  const toggleFileTree = useCallback(() => {
    setFileTreeOpen((prev) => !prev)
  }, [])

  const toggleSessionTree = useCallback(() => {
    setSessionTreeOpen((prev) => !prev)
  }, [])

  const toggleWebPreview = useCallback(() => {
    setWebPreviewOpen((prev) => !prev)
  }, [])

  const openFilePreview = useCallback((path: string, displayPath?: string) => {
    // `path` is passed to the backend /file/content API.
    // The backend does `path.join(Instance.directory, path)` which does NOT reset
    // on absolute segments, so callers should pass a path relative to the project
    // directory (e.g. FileNode.path) rather than FileNode.absolute.
    setFilePreviewPath(path)
    setFilePreviewDisplay(displayPath ?? path)
    setFilePreviewOpen(true)
    // Mutually exclusive with web preview — the right-side slot is shared.
    setWebPreviewOpen(false)
  }, [])

  const closeFilePreview = useCallback(() => {
    setFilePreviewOpen(false)
  }, [])

  const closePreview = useCallback(() => {
    setFilePreviewOpen(false)
    setWebPreviewOpen(false)
  }, [])

  const refreshModelGroups = useCallback(async () => {
    const configData = await opendora.config.get()
    if (configData.model_groups) {
      setModelGroups(configData.model_groups as { id: string; name: string; models: { providerID: string; modelID: string }[] }[])
    } else {
      setModelGroups([])
    }
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
    setSessionModel,
    activeSessions,
    messages,
    questionRequests: questionRequests[selectedSessionId ?? ""] ?? [],
    allQuestionRequests: questionRequests,
    replyQuestion,
    rejectQuestion,
    permissionRequests: permissionRequests[selectedSessionId ?? ""] ?? [],
    allPermissionRequests: permissionRequests,
    replyPermission: async (requestID: string, reply: PermissionReply) => {
      await opendora.permission.reply(requestID, reply)
    },
    status,
    sendMessage,
    abort,
    abortSession,
    compact,
    agents,
    allAgents,
    selectedAgent,
    selectAgent,
    defaultAgent: defaultAgentId,
    setDefaultAgent,
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
    modelGroups,
    refreshModelGroups,
    providerTimeouts,
    refreshProviderTimeouts,
    authExpiredProviders,
    sessionRetryStatus,
    error,
    isChatCentered,
    toggleChatLayout,
    fileTreeOpen,
    toggleFileTree,
    sessionTreeOpen,
    toggleSessionTree,
    webPreviewOpen,
    toggleWebPreview,
    webPreviewUrl,
    setWebPreviewUrl,
    filePreviewOpen,
    filePreviewPath,
    filePreviewDisplay,
    openFilePreview,
    closeFilePreview,
    closePreview,
    schedules,
    refreshSchedules,
  }
}
