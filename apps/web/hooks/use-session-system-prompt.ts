"use client"

import { useEffect, useRef, useState } from "react"
import { opendora } from "@/lib/projectflows"

export interface SessionSystemPromptData {
  sections: { label: string; content: string }[]
  injection: string
  skills: { name: string; description: string; content: string; tools?: string[] }[]
  tools: { id: string; description: string; source: "internal" | "mcp"; mcpServer?: string; agentManaged: boolean; skillUnlocked: boolean }[]
  loadedSkillNames: string[]
}

const EMPTY_DATA: SessionSystemPromptData = { sections: [], injection: "", skills: [], tools: [], loadedSkillNames: [] }

export function useSessionSystemPrompt(sessionID: string | undefined, active: boolean): SessionSystemPromptData {
  const [data, setData] = useState<SessionSystemPromptData>(EMPTY_DATA)
  const activeRef = useRef(false)

  function fetchPromptData(sid: string) {
    opendora.session.systemPrompt(sid)
      .then((res) => setData({
        ...res,
        loadedSkillNames: res.loadedSkillNames ?? [],
        tools: (res.tools ?? []).map((t) => ({ ...t, agentManaged: t.agentManaged ?? true, skillUnlocked: t.skillUnlocked ?? false })),
      }))
      .catch(() => setData(EMPTY_DATA))
  }

  useEffect(() => {
    activeRef.current = active
    if (active && sessionID) fetchPromptData(sessionID)
  }, [active, sessionID])

  // Re-fetch whenever the session goes idle (tool calls finished) and the panel is active
  useEffect(() => {
    return opendora.events.subscribe((event) => {
      if (event.type !== "session.idle") return
      const ev = event as { type: string; properties: { sessionID: string } }
      if (!activeRef.current || ev.properties.sessionID !== sessionID) return
      fetchPromptData(ev.properties.sessionID)
    })
  }, [sessionID])

  return data
}
