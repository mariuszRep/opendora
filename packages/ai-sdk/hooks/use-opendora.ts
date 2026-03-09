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
  type Session,
} from "@/lib/opendora"

export type ChatStatus = "ready" | "submitted" | "streaming" | "error"

export type UseOpendoraResult = {
  // Sessions
  sessions: Session[]
  selectedSession: Session | null
  selectSession: (id: string) => void
  createSession: () => Promise<void>
  // Messages
  messages: MessageWithParts[]
  status: ChatStatus
  sendMessage: (text: string, options?: { model?: { providerID: string; modelID: string }; agent?: string }) => Promise<void>
  abort: () => void
  // Agents — read
  agents: Agent[]
  selectedAgent: string
  selectAgent: (name: string) => void
  // Agents — CRUD
  createAgent: (config: AgentConfig, persona?: string) => Promise<AgentEntry>
  updateAgent: (id: string, config: Partial<AgentConfig>, persona?: string) => Promise<AgentEntry>
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
}

export function useOpendora(): UseOpendoraResult {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageWithParts[]>([])
  const [status, setStatus] = useState<ChatStatus>("ready")
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [connectedProviders, setConnectedProviders] = useState<string[]>([])
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({})
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>("build")

  const selectedSessionRef = useRef<Session | null>(null)

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null

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
        const [providerData, agentData, sessionData] = await Promise.all([
          opendora.provider.list(),
          opendora.agent.list(),
          opendora.session.list(),
        ])
        if (cancelled) return

        setProviders(providerData.all)
        setConnectedProviders(providerData.connected)
        setDefaultModels(providerData.default)

        const visibleAgents = agentData.filter((a) => !a.hidden)
        setAgents(visibleAgents)

        const sorted = [...sessionData].sort((a, b) => b.time.updated - a.time.updated)
        setSessions(sorted)
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
      refreshProviders().catch(() => {})
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
    }).catch(() => {})
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
                const existing = m.parts[idx] as { type: "text"; text: string; [k: string]: unknown }
                return { ...m, parts: m.parts.map((p, i) => (i === idx ? { ...part, text: existing.text + delta } : p)) }
              }
              return { ...m, parts: m.parts.map((p, i) => (i === idx ? part : p)) }
            }),
          )
          break
        }
      }
    })
  }, [])

  const selectSession = useCallback((id: string) => {
    setSelectedSessionId(id)
    setStatus("ready")
    setError(null)
  }, [])

  const createSession = useCallback(async () => {
    try {
      const session = await opendora.session.create()
      setSessions((prev) => {
        if (prev.find((s) => s.id === session.id)) return prev
        return [session, ...prev]
      })
      setSelectedSessionId(session.id)
      setMessages([])
      setStatus("ready")
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const sendMessage = useCallback(
    async (text: string, options?: { model?: { providerID: string; modelID: string }; agent?: string }) => {
      const session = selectedSessionRef.current
      if (!session) return
      setStatus("submitted")
      setError(null)
      try {
        await opendora.session.prompt(session.id, {
          parts: [{ type: "text", text }],
          ...(options?.model ? { model: options.model } : {}),
          agent: options?.agent ?? selectedAgent,
        })
        setStatus("ready")
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus("error")
      }
    },
    [selectedAgent],
  )

  const abort = useCallback(() => {
    const session = selectedSessionRef.current
    if (session) opendora.session.abort(session.id).catch(() => {})
    setStatus("ready")
  }, [])

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  const createAgent = useCallback(async (config: AgentConfig, persona = ""): Promise<AgentEntry> => {
    const entry = await opendora.agent.create({ config, persona })
    // Optimistically add to local list
    setAgents((prev) => [...prev, { name: entry.config.name, description: entry.config.description, mode: entry.config.mode, hidden: entry.config.hidden, color: entry.config.color, temperature: entry.config.temperature, model: entry.config.model }])
    return entry
  }, [])

  const updateAgent = useCallback(async (id: string, config: Partial<AgentConfig>, persona?: string): Promise<AgentEntry> => {
    const entry = await opendora.agent.update(id, { config, persona })
    // Optimistically patch local list
    setAgents((prev) =>
      prev.map((a) =>
        a.name === id
          ? { ...a, name: entry.config.name, description: entry.config.description, mode: entry.config.mode, hidden: entry.config.hidden, color: entry.config.color, temperature: entry.config.temperature, model: entry.config.model }
          : a,
      ),
    )
    return entry
  }, [])

  const deleteAgent = useCallback(async (id: string): Promise<void> => {
    await opendora.agent.remove(id)
    // Optimistically remove from local list
    setAgents((prev) => prev.filter((a) => a.name !== id))
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

  return {
    sessions,
    selectedSession,
    selectSession,
    createSession,
    messages,
    status,
    sendMessage,
    abort,
    agents,
    selectedAgent,
    selectAgent: setSelectedAgent,
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
  }
}
