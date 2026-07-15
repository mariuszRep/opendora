"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react"
import { motion } from "motion/react"
import { type Agent, type Session } from "@/lib/projectflows"
import { getAgentColor } from "@/lib/agent-colors"
import { cn } from "@/lib/utils"
import { RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSessionTreeSettings } from "@/hooks/use-session-tree-settings"

const ROW_HEIGHT = 32
const NODE_RADIUS = 5
const DEPTH_INDENT = 14
const LINE_WIDTH  = 2
const DOT_EDGE_GAP = 2
const DOT_LINE_GAP = NODE_RADIUS + DOT_EDGE_GAP
const SPINNER_RADIUS = NODE_RADIUS + 2
const SPINNER_CIRCUMFERENCE = 2 * Math.PI * SPINNER_RADIUS
const SPINNER_ARC = SPINNER_CIRCUMFERENCE * 0.28
const SPINNER_GAP = SPINNER_CIRCUMFERENCE - SPINNER_ARC
// Largest ring ever drawn around a dot (the cursor-selection background halo) —
// used to keep the dot's clearance from the row edge and from the text label
// constant across states instead of it shrinking/growing with which ring is active.
const MAX_RING_RADIUS = NODE_RADIUS + 5
const RING_GAP = 6 // matches the row's own flex `gap-1.5` (6px) between spacer and text
const LEFT_PAD = MAX_RING_RADIUS + RING_GAP
// Spacer only needs to clear the ring itself — the row's flex `gap-1.5` already
// supplies the same RING_GAP before the text, so it isn't added again here.
const TEXT_OFFSET = MAX_RING_RADIUS

interface VisibleSession {
  session: Session
  depth: number
}

interface SessionDot {
  sessionId: string
  x: number
  y: number
  color: string
  isCursor: boolean
  isActive: boolean
  hasChildren: boolean
  spacerWidth: number
}

interface SessionPath {
  id: string
  d: string
  color: string
}

function computeTreeLayout(
  visibleSessions: VisibleSession[],
  store: Store,
  selectedSessionId: string | undefined,
  sessionColors: Map<string, string>,
  activeSessions: Set<string>,
): { dots: SessionDot[]; paths: SessionPath[]; svgWidth: number } {
  const rowMap = new Map<string, number>()
  visibleSessions.forEach(({ session }, i) => rowMap.set(session.id, i))

  const getY = (row: number) => (row + 0.5) * ROW_HEIGHT
  const maxDepth = visibleSessions.reduce((max, item) => Math.max(max, item.depth), 0)

  const dots: SessionDot[] = visibleSessions.map(({ session, depth }) => {
    const x = LEFT_PAD + depth * DEPTH_INDENT
    const node = store.nodes[session.id]
    return {
      sessionId: session.id,
      x,
      y: getY(rowMap.get(session.id) ?? 0),
      color: sessionColors.get(session.id) ?? getAgentColor(undefined).hex,
      isCursor: session.id === selectedSessionId,
      isActive: activeSessions.has(session.id),
      hasChildren: (node?.children.length ?? 0) > 0 || Boolean(node?.hasChildren),
      spacerWidth: x + TEXT_OFFSET,
    }
  })

  const dotMap = new Map(dots.map(d => [d.sessionId, d]))
  const paths: SessionPath[] = []

  for (const { session } of visibleSessions) {
    const node = store.nodes[session.id]
    const visibleChildren = (node?.children ?? []).filter(c => rowMap.has(c.session.id))
    if (visibleChildren.length === 0) continue

    const parentDot = dotMap.get(session.id)
    if (!parentDot) continue

    const childDots = visibleChildren
      .map(child => dotMap.get(child.session.id))
      .filter((dot): dot is SessionDot => Boolean(dot))
    const firstChildDot = childDots[0]
    const lastChildDot = childDots[childDots.length - 1]
    if (!firstChildDot || !lastChildDot) continue

    const parentAnchorX = NODE_RADIUS * 0.8
    const parentAnchorY = NODE_RADIUS * 0.25
    const parentAnchorLength = Math.hypot(parentAnchorX, parentAnchorY) || 1
    const parentGapScale = (NODE_RADIUS + DOT_EDGE_GAP) / parentAnchorLength
    const armStartX = parentDot.x + parentAnchorX * parentGapScale
    const armStartY = parentDot.y + parentAnchorY * parentGapScale
    const railStartY = firstChildDot.y - DOT_LINE_GAP

    paths.push({
      id: `${session.id}-branch-arm`,
      d: [
        `M ${armStartX} ${armStartY}`,
        `C ${armStartX + 8} ${armStartY + 4}, ${firstChildDot.x} ${railStartY - 14}, ${firstChildDot.x} ${railStartY}`,
      ].join(" "),
      color: parentDot.color,
    })

    const railSegments: string[] = []
    for (let i = 0; i < childDots.length - 1; i++) {
      const from = childDots[i]!
      const to = childDots[i + 1]!
      railSegments.push(`M ${from.x} ${from.y + DOT_LINE_GAP} L ${to.x} ${to.y - DOT_LINE_GAP}`)
    }

    if (railSegments.length > 0) {
      paths.push({
        id: `${session.id}-child-rail`,
        d: railSegments.join(" "),
        color: parentDot.color,
      })
    }
  }

  const svgWidth = LEFT_PAD + maxDepth * DEPTH_INDENT + NODE_RADIUS + 12

  return { dots, paths, svgWidth }
}

type SessionNode = {
  session: Session
  children: SessionNode[]
  expanded: boolean
  loaded: boolean
  loading: boolean
  hasChildren?: boolean
}

type Store = {
  nodes: Record<string, SessionNode>
}

function emptyStore(): Store {
  return { nodes: {} }
}

function formatSessionTitle(session: Session): string {
  if (session.title && !session.title.startsWith("New session")) return session.title
  return new Date(session.time.created).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function buildSessionIndexes(sessions: Session[], activeSessions: Set<string>) {
  const roots: Session[] = []
  const childrenMap = new Map<string, Session[]>()
  const sessionIds = new Set(sessions.map((session) => session.id))

  for (const session of sessions) {
    if (!session.parentSessionID || !sessionIds.has(session.parentSessionID)) {
      roots.push(session)
      continue
    }

    const existing = childrenMap.get(session.parentSessionID) ?? []
    existing.push(session)
    childrenMap.set(session.parentSessionID, existing)
  }

  // Active sessions always float to the top of their sibling group.
  const activeRank = (session: Session) => (activeSessions.has(session.id) ? 0 : 1)

  roots.sort((a, b) => activeRank(a) - activeRank(b) || b.time.updated - a.time.updated)
  for (const children of childrenMap.values()) {
    children.sort((a, b) => activeRank(a) - activeRank(b) || a.time.created - b.time.created)
  }

  return { roots, childrenMap }
}

// Ancestor ids that must be force-expanded so an active session deeper in the
// tree stays visible without the user manually expanding every branch.
function computeForcedExpandIds(sessions: Session[], activeSessions: Set<string>): Set<string> {
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const result = new Set<string>()

  for (const activeId of activeSessions) {
    let current = byId.get(activeId)
    while (current?.parentSessionID) {
      const parentId = current.parentSessionID
      if (result.has(parentId)) break
      result.add(parentId)
      current = byId.get(parentId)
    }
  }

  return result
}

// Ids of every ancestor of `session`, walking up via parentSessionID. These must
// stay expanded so `session` remains visible when collapsing everything else
// down to a single expanded path (see `handleSessionClick`'s exclusive-expand branch).
function ancestorChainIds(session: Session, byId: Map<string, Session>): Set<string> {
  const result = new Set<string>()
  let current = session.parentSessionID ? byId.get(session.parentSessionID) : undefined
  while (current) {
    result.add(current.id)
    current = current.parentSessionID ? byId.get(current.parentSessionID) : undefined
  }
  return result
}

function computeVisibleSessions(roots: Session[], store: Store): VisibleSession[] {
  const result: VisibleSession[] = []
  const visit = (session: Session, depth: number) => {
    result.push({ session, depth })
    const node = store.nodes[session.id]
    if (!node?.expanded) return
    for (const child of node?.children ?? []) visit(child.session, depth + 1)
  }
  for (const root of roots) visit(root, 0)
  return result
}

type SessionTreePanelProps = {
  rootSessionId?: string
  onSessionClick?: (session: Session) => void
  selectedSessionId?: string
  activeSessions?: Set<string>
  sessions: Session[] // Accept sessions from parent to avoid duplicate fetch
  agents?: Array<Agent & { _id?: string }>
  /** Hide the "Session Tree" title bar + refresh button, for embedding under an existing header. */
  showHeader?: boolean
}

export type SessionTreePanelHandle = {
  expandAll: () => void
  collapseAll: () => void
}

export const SessionTreePanel = forwardRef<SessionTreePanelHandle, SessionTreePanelProps>(function SessionTreePanel({
  rootSessionId,
  onSessionClick,
  selectedSessionId,
  activeSessions = new Set(),
  sessions,
  agents = [],
  showHeader = true,
}, ref) {
  const [store, setStore] = useState<Store>(emptyStore)

  const [rootLoading, setRootLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [rootSessions, setRootSessions] = useState<Session[]>([])
  const { settings: treeSettings } = useSessionTreeSettings()
  const sessionIndexes = useMemo(() => buildSessionIndexes(sessions, activeSessions), [sessions, activeSessions])
  const sessionsById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions])
  const forcedExpandIds = useMemo(
    () => treeSettings.autoExpandActiveSessions ? computeForcedExpandIds(sessions, activeSessions) : new Set<string>(),
    [sessions, activeSessions, treeSettings.autoExpandActiveSessions],
  )
  const sessionColors = useMemo(() => {
    const agentsById = new Map<string, Agent & { _id?: string }>()
    const agentsByName = new Map<string, Agent & { _id?: string }>()

    for (const agent of agents) {
      if (agent._id) agentsById.set(agent._id, agent)
      if (agent.id) agentsById.set(agent.id, agent)
      agentsByName.set(agent.name, agent)
    }

    return new Map(sessions.map((session) => {
      const agent = session.agentID
        ? agentsById.get(session.agentID) ?? agentsByName.get(session.agentID)
        : undefined
      return [session.id, getAgentColor(agent?.color).hex]
    }))
  }, [agents, sessions])

  const loadRoots = useCallback(() => {
    setRootLoading(true)
    setLoadError(undefined)
    try {
      const { roots, childrenMap } = sessionIndexes

      setStore((prev) => {
        const nodes: Record<string, SessionNode> = {}

        for (const session of sessions) {
          const previous = prev.nodes[session.id]
          nodes[session.id] = {
            session,
            children: [],
            expanded: (previous?.expanded ?? false) || forcedExpandIds.has(session.id),
            loaded: true,
            loading: previous?.loading ?? false,
            hasChildren: childrenMap.has(session.id),
          }
        }

        for (const session of sessions) {
          const node = nodes[session.id]
          if (!node) continue

          node.children = (childrenMap.get(session.id) ?? [])
            .map((child) => nodes[child.id])
            .filter((childNode): childNode is SessionNode => Boolean(childNode))
        }

        return { nodes }
      })
      const scopedRoot = rootSessionId ? sessions.find((session) => session.id === rootSessionId) : undefined
      setRootSessions(scopedRoot ? [scopedRoot] : roots)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setRootLoading(false)
    }
  }, [sessions, sessionIndexes, rootSessionId, forcedExpandIds])

  useEffect(() => {
    loadRoots()
  }, [loadRoots])

  useImperativeHandle(ref, () => ({
    expandAll: () => {
      setStore((prev) => {
        const nodes: Record<string, SessionNode> = {}
        for (const [id, node] of Object.entries(prev.nodes)) {
          const hasChildren = node.children.length > 0 || Boolean(node.hasChildren)
          nodes[id] = hasChildren ? { ...node, expanded: true } : node
        }
        return { nodes }
      })
    },
    collapseAll: () => {
      setStore((prev) => {
        const nodes: Record<string, SessionNode> = {}
        for (const [id, node] of Object.entries(prev.nodes)) {
          nodes[id] = node.expanded ? { ...node, expanded: false } : node
        }
        return { nodes }
      })
    },
  }), [])

  const handleSessionClick = useCallback(
    (session: Session) => {
      const node = store.nodes[session.id]
      const hasChildren = (node?.children.length ?? 0) > 0 || node?.hasChildren

      if (selectedSessionId === session.id && hasChildren) {
        setStore((prev) => {
          const current = prev.nodes[session.id]
          if (!current) return prev
          const expanded = !current.expanded
          const nodes = {
            ...prev.nodes,
            [session.id]: { ...current, expanded },
          }

          if (expanded) {
            for (const child of current.children) {
              nodes[child.session.id] = { ...child, expanded: false }
            }
          }

          return {
            nodes,
          }
        })
        return
      }

      if (treeSettings.exclusiveExpand) {
        setStore((prev) => {
          const current = prev.nodes[session.id]
          if (!current) return prev
          const keepIds = ancestorChainIds(session, sessionsById)
          keepIds.add(session.id)

          const nodes = { ...prev.nodes }
          for (const [id, n] of Object.entries(nodes)) {
            if (keepIds.has(id) || forcedExpandIds.has(id)) continue
            if (n.expanded) nodes[id] = { ...n, expanded: false }
          }
          if (hasChildren) nodes[session.id] = { ...current, expanded: true }

          return { nodes }
        })
      }

      onSessionClick?.(session)
    },
    [onSessionClick, selectedSessionId, store.nodes, treeSettings.exclusiveExpand, sessionsById, forcedExpandIds],
  )

  const visibleSessions = useMemo(
    () => computeVisibleSessions(rootSessions, store),
    [rootSessions, store],
  )

  const { dots, paths, svgWidth } = useMemo(
    () => computeTreeLayout(visibleSessions, store, selectedSessionId, sessionColors, activeSessions),
    [visibleSessions, store, selectedSessionId, sessionColors, activeSessions],
  )

  const spacerMap = useMemo(
    () => new Map(dots.map(d => [d.sessionId, d.spacerWidth])),
    [dots],
  )

  const svgHeight = visibleSessions.length * ROW_HEIGHT

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sidebar text-sidebar-foreground">
      {showHeader && (
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Session Tree
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-5 shrink-0"
            onClick={loadRoots}
            title="Refresh"
            disabled={rootLoading}
          >
            <RefreshCwIcon className={cn("size-3", rootLoading && "animate-spin")} />
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rootLoading && rootSessions.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Loading sessions…</p>
        ) : loadError ? (
          <p className="px-2 py-4 text-center text-xs text-destructive" title={loadError}>
            Failed to load sessions
          </p>
        ) : rootSessions.length === 0 && !rootLoading ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No sessions yet</p>
        ) : (
          <div className="relative" style={{ minHeight: `${svgHeight}px` }}>
            {/* SVG overlay: bezier connections + colored dots */}
            <div
              className="absolute left-0 top-0 pointer-events-none z-10"
              style={{ width: svgWidth, height: svgHeight }}
            >
              <svg width={svgWidth} height={svgHeight} className="absolute inset-0">
                <g>
                  {paths.map((p) => (
                    <path
                      key={p.id}
                      d={p.d}
                      fill="none"
                      stroke={p.color}
                      strokeWidth={LINE_WIDTH}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.8}
                    />
                  ))}
                </g>
                <g>
                  {dots.map((dot) => (
                    <g key={`dot-${dot.sessionId}`}>
                      {dot.isCursor && (
                        <circle
                          cx={dot.x}
                          cy={dot.y}
                          r={NODE_RADIUS + 5}
                          fill="var(--sidebar-accent)"
                        />
                      )}
                      {dot.isCursor && (
                        <motion.circle
                          cx={dot.x}
                          cy={dot.y}
                          r={NODE_RADIUS + 4}
                          fill="none"
                          stroke={dot.color}
                          strokeWidth="1.5"
                          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        />
                      )}
                      {dot.isActive && (
                        <motion.circle
                          cx={dot.x}
                          cy={dot.y}
                          r={SPINNER_RADIUS}
                          fill="none"
                          stroke={dot.color}
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeDasharray={`${SPINNER_ARC} ${SPINNER_GAP}`}
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                        />
                      )}
                      {dot.hasChildren ? (
                        <>
                          <circle
                            cx={dot.x}
                            cy={dot.y}
                            r={NODE_RADIUS}
                            fill={dot.isCursor ? "var(--sidebar-accent)" : "var(--sidebar)"}
                            stroke={dot.color}
                            strokeWidth="1.75"
                          />
                          <circle
                            cx={dot.x}
                            cy={dot.y}
                            r={Math.max(NODE_RADIUS - 3, 1)}
                            fill={dot.color}
                          />
                        </>
                      ) : (
                        <circle
                          cx={dot.x}
                          cy={dot.y}
                          r={NODE_RADIUS}
                          fill={dot.color}
                        />
                      )}
                      {dot.isCursor && (
                        <circle
                          cx={dot.x}
                          cy={dot.y}
                          r={Math.max(NODE_RADIUS - 2, 1)}
                          fill={dot.color}
                        />
                      )}
                    </g>
                  ))}
                </g>
              </svg>
            </div>

            {/* Row list */}
            <div className="absolute inset-0 flex flex-col">
              {visibleSessions.map(({ session }) => {
                const node = store.nodes[session.id]
                if (!node) return null
                const { loading } = node
                const isSelected = selectedSessionId === session.id

                return (
                  <div
                    key={session.id}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    onClick={() => handleSessionClick(session)}
                    className={cn(
                      "group flex w-full items-center gap-1.5 rounded-md pr-2 text-sm cursor-pointer select-none transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                    )}
                  >
                    <div style={{ width: spacerMap.get(session.id) ?? (LEFT_PAD + TEXT_OFFSET) }} className="shrink-0" />

                    <span className="truncate flex-1">{formatSessionTitle(session)}</span>

                    {loading && (
                      <RefreshCwIcon className="ml-auto h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
