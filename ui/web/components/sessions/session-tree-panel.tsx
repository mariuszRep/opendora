"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { opendora, type Session } from "@/lib/opendora"
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

type TreeRowProps = {
  sessionId: string
  depth: number
  store: Store
  onToggle: (sessionId: string) => void
  onSessionClick: (session: Session) => void
  selectedSessionId?: string
  activeSessions: Set<string>
}

function TreeRow({
  sessionId,
  depth,
  store,
  onToggle,
  onSessionClick,
  selectedSessionId,
  activeSessions,
}: TreeRowProps) {
  const node = store.nodes[sessionId]
  if (!node) return null

  const { session, children, expanded, loading, hasChildren } = node
  const showChildren = hasChildren || children.length > 0
  const isSelected = selectedSessionId === sessionId
  const isActive = activeSessions.has(sessionId)

  const sessionType = (session.sessionType || "scope") as keyof typeof SESSION_TYPE_CONFIG
  const Icon = SESSION_TYPE_CONFIG[sessionType]?.icon || MessageSquareIcon

  return (
    <>
      <div className="relative">
        {/* Tree lines - matching SessionTreeView exactly */}
        {depth > 0 && (
          <>
            {/* Vertical line from parent */}
            <div 
              className="absolute top-0 bottom-0 w-px bg-border"
              style={{ left: depth * 20 - 10 }}
            />
            {/* Horizontal line to item */}
            <div 
              className="absolute top-1/2 h-px bg-border"
              style={{ 
                left: depth * 20 - 10,
                width: '14px'
              }}
            />
          </>
        )}

        <div
          onClick={() => onSessionClick(session)}
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded text-sm transition-colors cursor-pointer",
            "hover:bg-muted/50",
            isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          )}
          style={{ paddingLeft: depth * 20 + 8 }}
        >
          {showChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggle(sessionId)
              }}
              className="shrink-0 hover:bg-muted rounded p-0.5 -m-0.5"
            >
              <ChevronRightIcon
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  expanded && "rotate-90",
                )}
              />
            </button>
          ) : (
            <span className="size-3.5 shrink-0" />
          )}

          <Icon className="size-4 shrink-0 text-muted-foreground" />

          <span className="truncate flex-1">{formatSessionTitle(session)}</span>

          {isActive && (
            <div className="size-2 rounded-full bg-green-500 shrink-0 animate-pulse" title="Active" />
          )}

          {loading && (
            <RefreshCwIcon className="ml-auto size-3 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {showChildren && expanded && (
        <div className="relative">
          {children.map((childNode, idx) => {
            const isLast = idx === children.length - 1
            return (
              <div key={childNode.session.id} className="relative">
                {/* Shorten vertical line for last child */}
                {isLast && (
                  <div 
                    className="absolute top-0 h-1/2 w-px bg-background"
                    style={{ left: (depth + 1) * 20 - 10 }}
                  />
                )}
                <TreeRow
                  sessionId={childNode.session.id}
                  depth={depth + 1}
                  store={store}
                  onToggle={onToggle}
                  onSessionClick={onSessionClick}
                  selectedSessionId={selectedSessionId}
                  activeSessions={activeSessions}
                />
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

type SessionTreePanelProps = {
  rootSessionId?: string
  onSessionClick?: (session: Session) => void
  selectedSessionId?: string
  activeSessions?: Set<string>
}

export function SessionTreePanel({
  rootSessionId,
  onSessionClick,
  selectedSessionId,
  activeSessions = new Set(),
}: SessionTreePanelProps) {
  const [store, _setStore] = useState<Store>(emptyStore)
  const storeRef = useRef<Store>(store)

  const [rootLoading, setRootLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [rootSessions, setRootSessions] = useState<Session[]>([])

  const setStore = useCallback((update: (prev: Store) => Store) => {
    const next = update(storeRef.current)
    storeRef.current = next
    _setStore(next)
  }, [])

  const loadRoots = useCallback(async () => {
    setRootLoading(true)
    setLoadError(undefined)
    try {
      const sessions = await opendora.session.list()
      
      // Filter to only root sessions (no parentSessionID)
      const roots = sessions.filter((s) => !s.parentSessionID)
      
      // Sort by most recently updated
      roots.sort((a, b) => b.time.updated - a.time.updated)

      setStore(() => {
        const nodes: Record<string, SessionNode> = {}
        
        // Build a map of parent -> children to know which sessions have children
        const childrenMap = new Map<string, Session[]>()
        for (const session of sessions) {
          if (session.parentSessionID) {
            const existing = childrenMap.get(session.parentSessionID) || []
            existing.push(session)
            childrenMap.set(session.parentSessionID, existing)
          }
        }
        
        for (const session of roots) {
          const hasChildren = childrenMap.has(session.id)
          nodes[session.id] = {
            session,
            children: [],
            expanded: false,
            loaded: false,
            loading: false,
            hasChildren, // Track if this session has children
          }
        }
        return { nodes }
      })
      setRootSessions(roots)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setRootLoading(false)
    }
  }, [setStore])

  useEffect(() => {
    storeRef.current = emptyStore()
    _setStore(emptyStore())
    setRootSessions([])
    setLoadError(undefined)
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

        // Check which children have their own children
        const childrenWithGrandchildren = await Promise.all(
          children.map(async (child) => {
            try {
              const grandchildren = await opendora.session.children(child.id)
              return { child, hasChildren: grandchildren.length > 0 }
            } catch {
              return { child, hasChildren: false }
            }
          })
        )

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
    [setStore],
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

    const expandPathToSession = async (sessionId: string) => {
      try {
        const allSessions = await opendora.session.list()
        const targetSession = allSessions.find((s) => s.id === sessionId)
        if (!targetSession) return

        // Build path from root to target
        const path: string[] = []
        let current = targetSession
        
        while (current.parentSessionID) {
          path.unshift(current.parentSessionID)
          const parent = allSessions.find((s) => s.id === current.parentSessionID)
          if (!parent) break
          current = parent
        }

        // Expand each node in the path
        for (const nodeId of path) {
          const node = storeRef.current.nodes[nodeId]
          if (node && !node.expanded) {
            await handleToggle(nodeId)
          }
        }
      } catch (err) {
        console.error("Failed to expand path to session:", err)
      }
    }

    expandPathToSession(selectedSessionId)
  }, [selectedSessionId, handleToggle])

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
          rootSessions.map((session) => (
            <TreeRow
              key={session.id}
              sessionId={session.id}
              depth={0}
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
