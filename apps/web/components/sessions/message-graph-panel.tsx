"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { opendora, type MessageWithParts, type Edge } from "@/lib/projectflows"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import { ExecutionCanvas } from "@/components/execution-graph/graph-sidebar"
import { messagesToExecutionState } from "@/lib/execution-graph/messages-to-state"
import { createInitialState } from "@/lib/execution-graph/engine"
import type { LayoutOptions } from "@/lib/execution-graph/types"

type GraphData = { messages: MessageWithParts[]; edges: Edge[] }

const DEFAULT_OPTIONS: LayoutOptions = {
  orientation: "vertical",
  rowHeight: 32,
  columnWidth: 16,
  nodeRadius: 4,
  lineWidth: 2,
  nodeHeaderHeight: 24,
  showLabels: true,
  showComments: true,
  theme: "github",
}

export function MessageGraphPanel() {
  const { selectedSession, messages } = useOpendoraContext()
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const fetchingRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedSession) {
      setGraphData(null)
      return
    }

    const sid = selectedSession.id
    fetchingRef.current = sid

    opendora.session
      .graph(sid)
      .then((data) => {
        if (fetchingRef.current === sid) setGraphData(data)
      })
      .catch(() => {
        if (fetchingRef.current === sid) {
          setGraphData({ messages, edges: [] })
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession?.id, messages.length])

  const executionState = useMemo(() => {
    if (!selectedSession) return createInitialState()
    if (!graphData || graphData.messages.length === 0) return createInitialState()
    return messagesToExecutionState(graphData.messages, graphData.edges, selectedSession.id)
  }, [graphData, selectedSession])

  if (!selectedSession) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-zinc-500 bg-[#09090b]">
        Select a session
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ExecutionCanvas
        state={executionState}
        options={DEFAULT_OPTIONS}
      />
    </div>
  )
}
