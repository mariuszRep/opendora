"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronRightIcon, ChevronDownIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { opendora, type MemoryEntry } from "@/lib/opendora"
import { MessageResponse } from "@/components/ai-elements/message"
import { MemoryEntryEditor } from "./memory-entry-editor"

const TYPE_COLORS: Record<string, string> = {
  user: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  feedback: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  project: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  reference: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

function formatAge(ms: number): string {
  const diffMs = Date.now() - ms
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  return `${diffDay}d ago`
}

type Props = {
  entry: MemoryEntry
  directory: string
  scope: "global" | "local"
  agentID?: string
  onUpdated: (entry: MemoryEntry) => void
  onDeleted: (name: string) => void
}

export function MemoryEntryCard({ entry, directory, scope, agentID, onUpdated, onDeleted }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await opendora.memory.delete(directory, entry.name, scope, agentID)
      onDeleted(entry.name)
    } catch {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className={cn("border rounded-lg bg-background transition-colors", expanded && "border-border/80")}>
        <div
          className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded
            ? <ChevronDownIcon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
            : <ChevronRightIcon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          }
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className={cn("text-[10px] px-1.5 py-0 h-4 rounded-sm font-medium", TYPE_COLORS[entry.type] ?? "")}
              >
                {entry.type}
              </Badge>
              <span className="text-sm font-medium font-mono">{entry.name}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{entry.description}</p>
            <p className="mt-1 text-[10px] text-muted-foreground/50">
              updated {formatAge(entry.updatedAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setEditing(true)}
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </div>
        </div>
        {expanded && (
          <div className="border-t px-4 py-3">
            <MessageResponse className="prose dark:prose-invert max-w-none text-sm">
              {entry.content}
            </MessageResponse>
          </div>
        )}
      </div>

      <MemoryEntryEditor
        open={editing}
        onOpenChange={setEditing}
        directory={directory}
        scope={scope}
        agentID={agentID}
        entry={entry}
        onSaved={onUpdated}
      />
    </>
  )
}
