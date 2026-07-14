import type { Session } from "@/lib/projectflows"
import type { ExecutionState, Step, Run } from "@/lib/execution-graph/types"
import { RUN_COLORS } from "@/lib/execution-graph/engine"

function formatSessionTitle(session: Session): string {
  if (session.title && !session.title.startsWith("New session")) return session.title
  return new Date(session.time.created).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function sessionsToExecutionState(
  sessions: Session[],
  selectedSessionId?: string,
  activeSessions?: Set<string>,
): ExecutionState {
  if (sessions.length === 0) return { steps: {}, runs: {}, cursor: "", stepOrder: [] }

  const childrenMap = new Map<string, Session[]>()
  const roots: Session[] = []

  for (const s of sessions) {
    if (!s.parentSessionID) {
      roots.push(s)
      continue
    }
    const arr = childrenMap.get(s.parentSessionID) ?? []
    arr.push(s)
    childrenMap.set(s.parentSessionID, arr)
  }

  roots.sort((a, b) => b.time.updated - a.time.updated)
  for (const arr of childrenMap.values()) {
    arr.sort((a, b) => a.time.created - b.time.created)
  }

  const steps: Record<string, Step> = {}
  const runs: Record<string, Run> = {}
  const stepOrder: string[] = []
  const colorMap = new Map<string, string>()
  let rootColorIdx = 0

  const dfs = (session: Session) => {
    const parentColor = session.parentSessionID ? colorMap.get(session.parentSessionID) : undefined
    const color = parentColor ?? RUN_COLORS[rootColorIdx++ % RUN_COLORS.length]
    colorMap.set(session.id, color)

    steps[session.id] = {
      id: session.id,
      parents: session.parentSessionID ? [session.parentSessionID] : [],
      type: "generic",
      content: formatSessionTitle(session),
      author: session.agentID ?? undefined,
      timestamp: new Date(session.time.created).toISOString(),
      runId: session.id,
      labels: [],
      typeColor: activeSessions?.has(session.id) ? "#22c55e" : undefined,
    }

    runs[session.id] = {
      id: session.id,
      name: formatSessionTitle(session),
      color,
      head: session.id,
      parentRunId: session.parentSessionID ?? undefined,
    }

    stepOrder.push(session.id)

    for (const child of childrenMap.get(session.id) ?? []) {
      dfs(child)
    }
  }

  for (const root of roots) dfs(root)

  return {
    steps,
    runs,
    cursor: selectedSessionId && runs[selectedSessionId] ? selectedSessionId : (roots[0]?.id ?? ""),
    stepOrder,
  }
}
