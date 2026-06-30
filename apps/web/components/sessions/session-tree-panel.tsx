"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { opendora, type Session } from "@/lib/projectflows"
import { cn } from "@/lib/utils"
import {
  ChevronRightIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  BotIcon,
  FolderIcon,
  FolderOpenIcon,
  FileTextIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SESSION_TYPE_CONFIG } from "./session-create-dialog"
import { type SessionTreeNode } from "./session-tree-view"

function sessionToTreeNode(session: Session, children: SessionNode[]): SessionTreeNode {
  return {
    id: session.id,
    title: session.title || null,
    type: session.sessionType || null,
    status: null,
    agentId: session.agentID || null,
    children: children.map(child => sessionToTreeNode(child.session, child.children))
  }
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

  for (const session of sessions) {
    if (!session.parentSessionID) {
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

type TreeRowProps = {
  sessionId: string
  depth: number
  store: Store
  onToggle: (sessionId: string) => void
  onSessionClick: (session: Session) => void
  selectedSessionId?: string
  activeSessions: Set<string>
  isLast?: boolean
  activeLines?: boolean[]
}

function TreeRow({
  sessionId,
  depth,
  store,
  onToggle,
  onSessionClick,
  selectedSessionId,
  activeSessions,
  isLast = false,
  activeLines = []
}: TreeRowProps) {
  const node = store.nodes[sessionId]
  if (!node) return null

  const { session, children, expanded, loading, hasChildren } = node
  const showChildren = hasChildren || children.length > 0
  const isSelected = selectedSessionId === sessionId
  const isActive = activeSessions.has(sessionId)

  const sessionType = (session.sessionType || "scope") as keyof typeof SESSION_TYPE_CONFIG
  const Icon = SESSION_TYPE_CONFIG[sessionType]?.icon || MessageSquareIcon

  const childActiveLines = depth === 0 ? [] : [...activeLines, !isLast]

  return (
    <>
      <div className="relative flex w-full flex-col gap-0">
        <div
          onClick={() => onSessionClick(session)}
          style={{ paddingLeft: `calc(0.5rem + ${depth * 1.25}rem)` }}
          className={cn(
            "group relative flex w-full items-center gap-1.5 rounded-md pr-2 py-1 text-sm outline-none transition-colors cursor-pointer select-none",
            "hover:bg-accent hover:text-accent-foreground",
            isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          )}
        >
          {/* Draw Ancestor vertical continuous lines */}
          {activeLines.map((isActiveLine, i) => {
            if (!isActiveLine) return null
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-[1px] bg-muted-foreground transition-colors pointer-events-none"
                style={{ left: `calc(0.5rem + ${i * 1.25}rem + 0.625rem)` }}
              />
            )
          })}

          {/* Draw the L/T-connector for this specific node if it's not the root */}
          {depth > 0 && (
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `calc(0.5rem + ${(depth - 1) * 1.25}rem + 0.625rem)` }}>
              <div className="absolute top-0 w-[1px] bg-muted-foreground transition-colors" style={{ height: isLast ? '50%' : '100%' }} />
              <div 
                className="absolute top-1/2 h-[1px] bg-muted-foreground transition-colors" 
                style={{ width: '1.25rem' }} 
              />
            </div>
          )}

          {/* Actual Node Interactive Content */}
          <div className="relative z-10 flex flex-1 overflow-hidden items-center gap-1.5">
            {showChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(sessionId)
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted/80 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <ChevronRightIcon
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    expanded && "rotate-90",
                  )}
                />
              </button>
            ) : (
              <div className="h-5 w-5 shrink-0" />
            )}

            <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" />

            <span className="truncate flex-1">{formatSessionTitle(session)}</span>

            {isActive && (
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0 animate-pulse mx-1" title="Active" />
            )}

            {loading && (
              <RefreshCwIcon className="ml-auto h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {showChildren && expanded && (
          <div className="w-full flex flex-col gap-0">
            {children.map((childNode, idx) => (
              <TreeRow
                key={childNode.session.id}
                sessionId={childNode.session.id}
                depth={depth + 1}
                isLast={idx === children.length - 1}
                activeLines={childActiveLines}
                store={store}
                onToggle={onToggle}
                onSessionClick={onSessionClick}
                selectedSessionId={selectedSessionId}
                activeSessions={activeSessions}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
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
  const [store, _setStore] = useState<Store>(emptyStore)
  const storeRef = useRef<Store>(store)

  const [rootLoading, setRootLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [rootSessions, setRootSessions] = useState<Session[]>([])
  const sessionIndexes = useMemo(() => buildSessionIndexes(sessions), [sessions])

  const setStore = useCallback((update: (prev: Store) => Store) => {
    const next = update(storeRef.current)
    storeRef.current = next
    _setStore(next)
  }, [])

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
            loaded: previous?.loaded ?? false,
            loading: previous?.loading ?? false,
            hasChildren: childrenMap.has(session.id),
          }
        }

        for (const session of sessions) {
          const node = nodes[session.id]
          if (!node || !node.loaded) continue

          node.children = (childrenMap.get(session.id) ?? [])
            .map((child) => nodes[child.id])
            .filter((childNode): childNode is SessionNode => Boolean(childNode))
        }

        return { nodes }
      })
      setRootSessions(roots)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setRootLoading(false)
    }
  }, [setStore, sessions, sessionIndexes])

  useEffect(() => {
    loadRoots()
  }, [loadRoots])

  const handleToggle = useCallback(
    async (sessionId: string) => {
      const current = storeRef.current.nodes[sessionId]
      if (!current) return

      if (current.expanded) {
        // Collapse - recursively collapse all descendants
        const collapseDescendants = (nodeId: string, nodes: Record<string, SessionNode>): Record<string, SessionNode> => {
          const node = nodes[nodeId]
          if (!node) return nodes
          
          const updatedNodes = {
            ...nodes,
            [nodeId]: { ...node, expanded: false }
          }

          for (const child of node.children) {
            Object.assign(updatedNodes, collapseDescendants(child.session.id, updatedNodes))
          }
          
          return updatedNodes
        }

        setStore((prev) => ({
          nodes: collapseDescendants(sessionId, prev.nodes)
        }))
        return
      }

      // Expand
      setStore((prev) => ({
        nodes: {
          ...prev.nodes,
          [sessionId]: { ...prev.nodes[sessionId]!, expanded: true },
        },
      }))

      // Already loaded
      if (current.loaded || current.loading) return

      const knownChildren = sessionIndexes.childrenMap.get(sessionId)
      if (knownChildren) {
        setStore((prev) => ({
          nodes: (() => {
            const childNodes = knownChildren
              .map((child) => prev.nodes[child.id])
              .filter((childNode): childNode is SessionNode => Boolean(childNode))

            return {
              ...prev.nodes,
              [sessionId]: {
                ...prev.nodes[sessionId]!,
                loaded: true,
                loading: false,
                children: childNodes,
              },
            }
          })(),
        }))
        return
      }

      // Mark loading
      setStore((prev) => ({
        nodes: {
          ...prev.nodes,
          [sessionId]: { ...prev.nodes[sessionId]!, loading: true },
        },
      }))

      try {
        const children = await opendora.session.children(sessionId)
        
        // Sort children by creation time
        children.sort((a: Session, b: Session) => a.time.created - b.time.created)

        // Check which children have their own children using the sessions prop (no extra API calls)
        const childrenWithGrandchildren = children.map((child) => {
          const hasChildren = sessionIndexes.childrenMap.has(child.id)
          return { child, hasChildren }
        })

        setStore((prev) => {
          const nodes = { ...prev.nodes }
          const childNodes: SessionNode[] = []

          for (const { child, hasChildren } of childrenWithGrandchildren) {
            if (!nodes[child.id]) {
              nodes[child.id] = {
                session: child,
                children: [],
                expanded: false,
                loaded: false,
                loading: false,
                hasChildren,
              }
            }
            childNodes.push(nodes[child.id]!)
          }

          nodes[sessionId] = {
            ...nodes[sessionId]!,
            loaded: true,
            loading: false,
            children: childNodes,
          }

          return { nodes }
        })
      } catch (err) {
        console.error("Failed to load session children:", err)
        setStore((prev) => ({
          nodes: {
            ...prev.nodes,
            [sessionId]: { ...prev.nodes[sessionId]!, expanded: false, loading: false },
          },
        }))
      }
    },
    [setStore, sessionIndexes],
  )

  const handleSessionClick = useCallback(
    (session: Session) => {
      onSessionClick?.(session)
    },
    [onSessionClick],
  )

  // Auto-expand path to selected session
  useEffect(() => {
    if (!selectedSessionId) return

    const expandPathToSession = (sessionId: string) => {
      try {
        const targetSession = sessions.find((s) => s.id === sessionId)
        if (!targetSession) return

        // Build path from root to target using sessions prop
        const path: string[] = []
        let current = targetSession
        
        while (current.parentSessionID) {
          path.unshift(current.parentSessionID)
          const parent = sessions.find((s) => s.id === current.parentSessionID)
          if (!parent) break
          current = parent
        }

        // Expand each node in the path in parallel (not sequential)
        for (const nodeId of path) {
          const node = storeRef.current.nodes[nodeId]
          if (node && !node.expanded) {
            handleToggle(nodeId)
          }
        }
      } catch (err) {
        console.error("Failed to expand path to session:", err)
      }
    }

    expandPathToSession(selectedSessionId)
  }, [selectedSessionId, sessions, handleToggle])

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

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {rootLoading && rootSessions.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Loading sessions…</p>
        ) : loadError ? (
          <p className="px-2 py-4 text-center text-xs text-destructive" title={loadError}>
            Failed to load sessions
          </p>
        ) : rootSessions.length === 0 && !rootLoading ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No sessions yet</p>
        ) : (
          rootSessions.map((session, idx) => (
            <TreeRow
              key={session.id}
              sessionId={session.id}
              depth={0}
              isLast={idx === rootSessions.length - 1}
              activeLines={[]}
              store={store}
              onToggle={handleToggle}
              onSessionClick={handleSessionClick}
              selectedSessionId={selectedSessionId}
              activeSessions={activeSessions}
            />
          ))
        )}
      </div>
    </div>
  )
}
