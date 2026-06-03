"use client"

import { useState } from "react"
import { useOpendoraContext } from "./opendora-context"
import { FileTreePanel } from "@/components/file-tree/file-tree-panel"
import { SessionTreePanel } from "@/components/sessions/session-tree-panel"
import type { FileNode } from "@/lib/opendora"
import { sessionOwnPaths, agentPaths, mergePaths } from "@/lib/paths"
import type { ReactNode } from "react"
import { ChevronDownIcon, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type DashboardShellProps = {
  children: ReactNode
}

type PathKind = "edit" | "explore"

type PathOption = {
  path: string    // absolute path
  name: string    // last path segment, shown as label
  kind: PathKind
}

function lastName(p: string) {
  return p.replace(/\/$/, "").split("/").filter(Boolean).pop() ?? p
}

const KIND_BADGE: Record<PathKind, { label: string; className: string }> = {
  edit:    { label: "edit",    className: "bg-primary/10 text-primary" },
  explore: { label: "explore", className: "bg-muted text-muted-foreground" },
}

export function DashboardShell({ children }: DashboardShellProps) {
  const { fileTreeOpen, sessionTreeOpen, selectedSession, agents, selectedAgent, activeSessions, selectSession, openFilePreview } = useOpendoraContext()

  const currentAgent = agents.find((a) => a._id === selectedAgent)

  // Build display path list: session own paths + agent paths (merged, deduped)
  // Then fall back to session.directory if nothing else is available.
  // Note: we show all paths here for navigation — access-control ceiling enforcement
  // happens at the backend, not in the UI path picker.
  const sessionEntries = selectedSession ? sessionOwnPaths(selectedSession) : []
  const agentEntries = currentAgent ? agentPaths(currentAgent) : []
  let displayPaths = mergePaths(sessionEntries, agentEntries)

  // Filter out relative paths — they can't be used as file tree roots in the UI
  displayPaths = displayPaths.filter((e) => e.path.startsWith("/"))

  // Fallback: session.directory (absolute) so the tree always has something to show
  if (displayPaths.length === 0 && selectedSession?.directory?.startsWith("/")) {
    displayPaths = [{ path: selectedSession.directory, edit: false }]
  }

  // If session has an explicit cwd, prepend it as the primary tree root
  if (selectedSession?.cwd?.startsWith("/")) {
    displayPaths = [
      { path: selectedSession.cwd, edit: true },
      ...displayPaths.filter((e) => e.path !== selectedSession!.cwd),
    ]
  }

  // Convert PathEntry[] → PathOption[] for display
  const pathOptions: PathOption[] = displayPaths.map((entry) => ({
    path: entry.path,
    name: lastName(entry.path),
    kind: entry.edit ? "edit" : "explore",
  }))

  const [selectedPathIdx, setSelectedPathIdx] = useState(0)
  const [treeKey, setTreeKey] = useState(0)

  const activeIdx = Math.min(selectedPathIdx, Math.max(0, pathOptions.length - 1))
  const active = pathOptions[activeIdx]

  const handleFileClick = (node: FileNode) => {
    if (node.type === "file") {
      // node.path is relative to Instance.directory (required by /file/content);
      // node.absolute is shown in the preview header for the user.
      openFilePreview(node.path, node.absolute)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {sessionTreeOpen && (
        <div className="flex w-60 shrink-0 flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground">
          <SessionTreePanel
            onSessionClick={(session) => selectSession(session.id)}
            selectedSessionId={selectedSession?.id}
            activeSessions={activeSessions}
          />
        </div>
      )}

      {fileTreeOpen && (
        <div className="flex w-60 shrink-0 flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground">

          {/* ── Path selector ── */}
          {pathOptions.length > 0 && (
            <div className="flex items-center gap-1 border-b px-2 py-1">
              {pathOptions.length === 1 ? (
                // Single path — just show name + badge, no dropdown
                <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
                  <span className="truncate text-xs font-medium text-muted-foreground">{active?.name}</span>
                  {active && <Badge kind={active.kind} />}
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex flex-1 items-center gap-1.5 overflow-hidden rounded px-1 py-0.5 text-left text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                      <span className="truncate">{active?.name ?? "Files"}</span>
                      {active && <Badge kind={active.kind} />}
                      <ChevronDownIcon className="ml-auto size-3 shrink-0 opacity-50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72 p-1">
                    {pathOptions.map((opt, i) => (
                      <DropdownMenuItem
                        key={opt.path}
                        onClick={() => { setSelectedPathIdx(i); setTreeKey((k) => k + 1) }}
                        className="flex flex-col items-start gap-0.5 rounded px-2 py-1.5"
                      >
                        {/* Row 1: name + badge */}
                        <div className="flex w-full items-center gap-1.5">
                          <span className={`truncate text-xs font-medium ${i === activeIdx ? "text-foreground" : ""}`}>
                            {opt.name}
                          </span>
                          <Badge kind={opt.kind} />
                        </div>
                        {/* Row 2: full path */}
                        <span className="truncate text-[10px] text-muted-foreground font-mono w-full">
                          {opt.path}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                size="icon-sm"
                variant="ghost"
                className="size-5 shrink-0"
                onClick={() => setTreeKey((k) => k + 1)}
                title="Refresh"
              >
                <RefreshCwIcon className="size-3" />
              </Button>
            </div>
          )}

          {/* ── File tree ── */}
          {active ? (
            <FileTreePanel
              key={`${active.path}:${treeKey}`}
              rootPath={active.path}
              onFileClick={handleFileClick}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
              Select a session to browse files
            </div>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function Badge({ kind }: { kind: PathKind }) {
  const badge = KIND_BADGE[kind]
  return (
    <span className={`shrink-0 rounded px-1 py-px text-[9px] font-medium ${badge.className}`}>
      {badge.label}
    </span>
  )
}
