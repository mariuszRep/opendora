"use client"

import { useEffect, useRef, useState } from "react"
import { opendora, type MessageWithParts, type Part, type Event } from "@/lib/projectflows"
import { subscribeToEvents } from "@/lib/session-event-bus"

/**
 * Per-session message state, independent of the app's single globally-selected
 * session (use-projectflows.ts). Lets multiple SessionPane instances each show a
 * different session at once. Mirrors the reducer in use-projectflows.ts's SSE
 * handler, scoped to an explicit sessionId instead of a global ref.
 */
export function useSessionMessages(sessionId: string) {
  const [messages, setMessages] = useState<MessageWithParts[]>([])
  const deltaSeqRef = useRef(new Map<string, number>())

  useEffect(() => {
    let cancelled = false
    setMessages([])
    opendora.session
      .messages(sessionId)
      .then((msgs) => {
        if (!cancelled) setMessages(msgs)
      })
      .catch(() => {
        // session may not exist yet / server not ready
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    return subscribeToEvents((event: Event) => {
      switch (event.type) {
        case "message.updated": {
          const { info } = (event as { type: string; properties: { info: MessageWithParts["info"] } }).properties
          if (info.sessionID !== sessionId) return
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.info.id === info.id)
            if (idx === -1) return [...prev, { info, parts: [] }]
            return prev.map((m, i) => (i === idx ? { ...m, info } : m))
          })
          break
        }
        case "message.removed": {
          const { sessionID, messageID } = (
            event as { type: string; properties: { sessionID: string; messageID: string } }
          ).properties
          if (sessionID !== sessionId) return
          setMessages((prev) => prev.filter((m) => m.info.id !== messageID))
          break
        }
        case "message.part.updated": {
          const { part } = (event as { type: string; properties: { part: Part } }).properties
          if (part.sessionID !== sessionId) return
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
          const { sessionID, messageID, partID, field, delta, seq } = (
            event as {
              type: string
              properties: { sessionID: string; messageID: string; partID: string; field: string; delta: string; seq?: number }
            }
          ).properties
          if (sessionID !== sessionId) return
          if (seq !== undefined) {
            const seqKey = `${partID}:${field}`
            const last = deltaSeqRef.current.get(seqKey) ?? 0
            if (seq <= last) return
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
      }
    })
  }, [sessionId])

  return messages
}
