"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { type Session } from "@/lib/projectflows"
import { cn } from "@/lib/utils"
import { RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

const SESSION_TYPE_COLORS: Record<string, string> = {
  scope:      "#3b82f6",
  worker:     "#f59e0b",
  role:       "#8b5cf6",
  scratchpad: "#64748b",
}

const ROW_HEIGHT = 32
const NODE_RADIUS = 5
const LEFT_PAD   = 12
const DEPTH_INDENT = 14
const LINE_WIDTH  = 2
const DOT_EDGE_GAP = 2
const DOT_LINE_GAP = NODE_RADIUS + DOT_EDGE_GAP

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
      color: SESSION_TYPE_COLORS[session.sessionType ?? "scope"] ?? "#64748b",
      isCursor: session.id === selectedSessionId,
      hasChildren: (node?.children.length ?? 0) > 0 || Boolean(node?.hasChildren),
      spacerWidth: x + NODE_RADIUS + 5,
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

function buildSessionIndexes(sessions: Session[]) {
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

  roots.sort((a, b) => b.time.updated - a.time.updated)
  for (const children of childrenMap.values()) {
    children.sort((a, b) => a.time.created - b.time.created)
  }

  return { roots, childrenMap }
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
}

export function SessionTreePanel({
  rootSessionId,
  onSessionClick,
  selectedSessionId,
  activeSessions = new Set(),
  sessions,
}: SessionTreePanelProps) {
  const [store, setStore] = useState<Store>(emptyStore)

  const [rootLoading, setRootLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [rootSessions, setRootSessions] = useState<Session[]>([])
  const sessionIndexes = useMemo(() => buildSessionIndexes(sessions), [sessions])

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
            expanded: previous?.expanded ?? false,
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
  }, [sessions, sessionIndexes, rootSessionId])

  useEffect(() => {
    loadRoots()
  }, [loadRoots])

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

      onSessionClick?.(session)
    },
    [onSessionClick, selectedSessionId, store.nodes],
  )

  const visibleSessions = useMemo(
    () => computeVisibleSessions(rootSessions, store),
    [rootSessions, store],
  )

  const { dots, paths, svgWidth } = useMemo(
    () => computeTreeLayout(visibleSessions, store, selectedSessionId),
    [visibleSessions, store, selectedSessionId],
  )

  const spacerMap = useMemo(
    () => new Map(dots.map(d => [d.sessionId, d.spacerWidth])),
    [dots],
  )

  const svgHeight = visibleSessions.length * ROW_HEIGHT

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sidebar text-sidebar-foreground">
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
                          fill="hsl(var(--sidebar-accent))"
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
                      {dot.hasChildren ? (
                        <>
                          <circle
                            cx={dot.x}
                            cy={dot.y}
                            r={NODE_RADIUS}
                            fill={dot.isCursor ? "hsl(var(--sidebar-accent))" : "hsl(var(--sidebar))"}
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
                const isActive = activeSessions.has(session.id)

                return (
                  <div
                    key={session.id}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    onClick={() => handleSessionClick(session)}
                    className={cn(
                      "group flex w-full items-center gap-1.5 pr-2 text-sm cursor-pointer select-none transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                    )}
                  >
                    <div style={{ width: spacerMap.get(session.id) ?? (LEFT_PAD + NODE_RADIUS + 8) }} className="shrink-0" />

                    <span className="truncate flex-1">{formatSessionTitle(session)}</span>

                    {isActive && (
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0 animate-pulse mx-1" title="Active" />
                    )}

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
}
