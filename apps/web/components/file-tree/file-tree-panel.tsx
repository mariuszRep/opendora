"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { opendora, type FileNode } from "@/lib/projectflows"
import { cn } from "@/lib/utils"
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  RefreshCwIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"

// ── Flat store (ported from opencode tree-store.ts) ──────────────────────────
//
// Keyed by node.absolute (always unique). The ref mirrors state for synchronous
// reads inside event handlers without the async-setState-updater anti-pattern.

type DirState = {
  expanded: boolean
  loaded: boolean
  loading: boolean
  children?: string[] // absolute paths
}

type Store = {
  nodes: Record<string, FileNode> // absolute → FileNode
  dirs: Record<string, DirState>  // absolute → DirState
}

function emptyStore(): Store {
  return { nodes: {}, dirs: {} }
}

// ── Row component ────────────────────────────────────────────────────────────

type TreeRowProps = {
  absolute: string
  depth: number
  store: Store
  onToggle: (node: FileNode) => void
  onFileClick: (node: FileNode) => void
  selectedAbsolute?: string
}

function TreeRow({ absolute, depth, store, onToggle, onFileClick, selectedAbsolute }: TreeRowProps) {
  const node = store.nodes[absolute]
  if (!node) return null

  const isDir = node.type === "directory"
  const dirState = isDir ? store.dirs[absolute] : undefined
  const expanded = dirState?.expanded ?? false
  const loading = dirState?.loading ?? false
  const children = dirState?.children ?? []
  const isSelected = selectedAbsolute === absolute

  return (
    <>
      <button
        type="button"
        title={node.absolute}
        onClick={() => (isDir ? onToggle(node) : onFileClick(node))}
        className={cn(
          "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground",
          node.ignored && "opacity-40",
        )}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {isDir ? (
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}

        {isDir ? (
          expanded ? (
            <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="truncate">{node.name}</span>

        {loading && (
          <RefreshCwIcon className="ml-auto size-3 shrink-0 animate-spin text-muted-foreground" />
        )}
      </button>

      {isDir && expanded && children.length > 0 && (
        <>
          {children.map((childAbs) => (
            <TreeRow
              key={childAbs}
              absolute={childAbs}
              depth={depth + 1}
              store={store}
              onToggle={onToggle}
              onFileClick={onFileClick}
              selectedAbsolute={selectedAbsolute}
            />
          ))}
        </>
      )}
    </>
  )
}

// ── Panel ────────────────────────────────────────────────────────────────────

type FileTreePanelProps = {
  rootPath: string
  rootLabel?: string
  onFileClick?: (node: FileNode) => void
}

export function FileTreePanel({ rootPath, rootLabel, onFileClick }: FileTreePanelProps) {
  const [store, _setStore] = useState<Store>(emptyStore)
  // storeRef mirrors state for synchronous reads in event handlers.
  // React setState updaters run asynchronously (during reconciliation), so we
  // cannot rely on them to set a flag and immediately check it in the same tick.
  const storeRef = useRef<Store>(store)

  const [rootLoading, setRootLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [rootChildren, setRootChildren] = useState<string[]>([])
  const [selectedAbsolute, setSelectedAbsolute] = useState<string>()

  // Wrapper: always updates ref synchronously so event handlers can read current state
  const setStore = useCallback((update: (prev: Store) => Store) => {
    const next = update(storeRef.current)
    storeRef.current = next
    _setStore(next)
  }, [])

  const loadRoot = useCallback(async () => {
    setRootLoading(true)
    setLoadError(undefined)
    try {
      // Pass rootPath directly — the backend uses path.resolve so absolute paths work.
      const raw = await opendora.file.list(rootPath)
      const sorted = [...raw].sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setStore(() => {
        const nodes: Record<string, FileNode> = {}
        const dirs: Record<string, DirState> = {}
        for (const node of sorted) {
          nodes[node.absolute] = node
          if (node.type === "directory") dirs[node.absolute] = { expanded: false, loaded: false, loading: false }
        }
        return { nodes, dirs }
      })
      setRootChildren(sorted.map((n) => n.absolute))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setRootLoading(false)
    }
  }, [rootPath, setStore])

  useEffect(() => {
    // Reset on rootPath change
    storeRef.current = emptyStore()
    _setStore(emptyStore())
    setRootChildren([])
    setLoadError(undefined)
    loadRoot()
  }, [loadRoot])

  // Ported from opencode expandDir / collapseDir / listDir.
  // expandDir: always sets expanded=true, then calls listDir (which dedupes via loading flag).
  // No "needsLoad" flag needed — we read storeRef.current synchronously.
  const handleToggle = useCallback(
    async (node: FileNode) => {
      const abs = node.absolute
      const current = storeRef.current.dirs[abs]
      if (!current) return

      if (current.expanded) {
        // Collapse
        setStore((prev) => ({
          ...prev,
          dirs: { ...prev.dirs, [abs]: { ...prev.dirs[abs]!, expanded: false } },
        }))
        return
      }

      // Expand
      setStore((prev) => ({
        ...prev,
        dirs: { ...prev.dirs, [abs]: { ...prev.dirs[abs]!, expanded: true } },
      }))

      // Already loaded — nothing more to do
      if (current.loaded || current.loading) return

      // Mark loading
      setStore((prev) => ({
        ...prev,
        dirs: { ...prev.dirs, [abs]: { ...prev.dirs[abs]!, loading: true } },
      }))

      try {
        // node.path is relative from Instance.directory (e.g. "../../.projectflows/skill/agent-author")
        // path.resolve on the backend converts it to the correct absolute path
        const raw = await opendora.file.list(node.path)
        const sorted = [...raw].sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1
          return a.name.localeCompare(b.name)
        })

        setStore((prev) => {
          const nodes = { ...prev.nodes }
          const dirs = { ...prev.dirs }
          for (const child of sorted) {
            nodes[child.absolute] = child
            if (child.type === "directory" && !dirs[child.absolute]) {
              dirs[child.absolute] = { expanded: false, loaded: false, loading: false }
            }
          }
          dirs[abs] = {
            ...dirs[abs]!,
            loaded: true,
            loading: false,
            children: sorted.map((n) => n.absolute),
          }
          return { nodes, dirs }
        })
      } catch {
        setStore((prev) => ({
          ...prev,
          dirs: { ...prev.dirs, [abs]: { ...prev.dirs[abs]!, expanded: false, loading: false } },
        }))
      }
    },
    [setStore],
  )

  const handleFileClick = useCallback(
    (node: FileNode) => {
      setSelectedAbsolute(node.absolute)
      onFileClick?.(node)
    },
    [onFileClick],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sidebar text-sidebar-foreground">
      {rootLabel && (
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {rootLabel}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-5 shrink-0"
            onClick={loadRoot}
            title="Refresh"
            disabled={rootLoading}
          >
            <RefreshCwIcon className={cn("size-3", rootLoading && "animate-spin")} />
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {rootLoading && rootChildren.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <p className="px-2 py-4 text-center text-xs text-destructive" title={loadError}>
            {loadError.includes("Access denied")
              ? "Path outside project boundary"
              : loadError.includes("not found")
                ? "Path not found"
                : "Failed to load files"}
          </p>
        ) : rootChildren.length === 0 && !rootLoading ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Empty directory</p>
        ) : (
          rootChildren.map((abs) => (
            <TreeRow
              key={abs}
              absolute={abs}
              depth={0}
              store={store}
              onToggle={handleToggle}
              onFileClick={handleFileClick}
              selectedAbsolute={selectedAbsolute}
            />
          ))
        )}
      </div>
    </div>
  )
}
