"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { opendora, type ToolPart } from "@/lib/opendora"
import { useNotifications } from "@/hooks/use-notifications"
import { BrainIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { MessageResponse } from "@/components/ai-elements/message"

export const MEMORY_WRITE_ACTION_EVENT = "memory-write:action"

export type MemoryWriteActionDetail = { callID: string; action: "kept" | "discarded" }

export function dispatchMemoryWriteAction(callID: string, action: "kept" | "discarded") {
  window.dispatchEvent(new CustomEvent<MemoryWriteActionDetail>(MEMORY_WRITE_ACTION_EVENT, { detail: { callID, action } }))
}

const MEMORY_WRITE_TOOLS = new Set(["memory_write"])

export function isMemoryWriteTool(toolName: string): boolean {
  return MEMORY_WRITE_TOOLS.has(toolName)
}

export function getMemoryWriteToolTitle(tool: ToolPart): string {
  const metadata = "metadata" in tool.state ? tool.state.metadata : undefined
  const action = (metadata as any)?.action as string | undefined
  const name = (metadata as any)?.name as string | undefined
  if (name) return `Memory ${action ?? "saved"}: ${name}`
  const input = "input" in tool.state ? (tool.state.input as any) : undefined
  if (input?.name) return `Memory: ${input.name}`
  return "Memory write"
}

function readStoredAction(callID: string): "kept" | "discarded" | null {
  try {
    return (localStorage.getItem(`memory-action:${callID}`) as "kept" | "discarded" | null) ?? null
  } catch {
    return null
  }
}

function writeStoredAction(callID: string, action: "kept" | "discarded") {
  try {
    localStorage.setItem(`memory-action:${callID}`, action)
  } catch {}
}

export function MemoryWriteToolContent({ tool }: { tool: ToolPart }) {
  const callID = tool.callID
  const [actionTaken, setActionTaken] = useState<"kept" | "discarded" | null>(null)
  const [contentExpanded, setContentExpanded] = useState(false)
  const { removeByMemoryCallID } = useNotifications()

  const isCompleted = tool.state.status === "completed"
  const metadata = isCompleted ? (tool.state.metadata as Record<string, unknown> | undefined) : undefined
  const name = metadata?.name as string | undefined
  const scope = metadata?.scope as string | undefined
  const agentID = metadata?.agentID as string | undefined
  const directory = metadata?.directory as string | undefined
  const action = metadata?.action as string | undefined
  const input = "input" in tool.state ? (tool.state.input as Record<string, unknown>) : {}

  const displayName = name ?? (input?.name as string | undefined) ?? "unknown"
  const displayDescription = input?.description as string | undefined
  const displayContent = input?.content as string | undefined

  useEffect(() => {
    if (!callID) return
    const stored = readStoredAction(callID)
    if (stored) setActionTaken(stored)
  }, [callID])

  useEffect(() => {
    if (!callID) return
    const handler = (e: Event) => {
      const { callID: eCallID, action: eAction } = (e as CustomEvent<MemoryWriteActionDetail>).detail
      if (eCallID === callID) {
        writeStoredAction(callID, eAction)
        setActionTaken(eAction)
      }
    }
    window.addEventListener(MEMORY_WRITE_ACTION_EVENT, handler)
    return () => window.removeEventListener(MEMORY_WRITE_ACTION_EVENT, handler)
  }, [callID])

  const handleKeep = () => {
    setActionTaken("kept")
    if (callID) {
      writeStoredAction(callID, "kept")
      dispatchMemoryWriteAction(callID, "kept")
      removeByMemoryCallID(callID)
    }
  }

  const handleDiscard = async () => {
    if (directory && name && scope) {
      await opendora.memory.delete(directory, name, scope, agentID).catch(() => {})
    }
    setActionTaken("discarded")
    if (callID) {
      writeStoredAction(callID, "discarded")
      dispatchMemoryWriteAction(callID, "discarded")
      removeByMemoryCallID(callID)
    }
  }

  if (actionTaken === "discarded") {
    return (
      <div className="rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground">
        Memory entry <span className="font-mono text-xs">{displayName}</span> was discarded.
      </div>
    )
  }

  if (actionTaken === "kept") {
    return (
      <div className="rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground">
        Memory entry <span className="font-mono text-xs">{displayName}</span> kept.
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border bg-background px-4 py-3">
      <div className="flex items-start gap-2">
        <BrainIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{displayName}</p>
          {displayDescription && (
            <p className="mt-0.5 text-xs text-muted-foreground">{displayDescription}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            {action ?? "saved"} · {scope ?? "global"}
          </p>
        </div>
      </div>

      {displayContent && (
        <div>
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
            onClick={() => setContentExpanded(v => !v)}
          >
            {contentExpanded ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
            {contentExpanded ? "Hide content" : "Show content"}
          </button>
          {contentExpanded && (
            <MessageResponse className="prose dark:prose-invert mt-2 max-w-none text-sm">
              {displayContent}
            </MessageResponse>
          )}
        </div>
      )}

      {isCompleted && name && scope && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleKeep}>
            Keep
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleDiscard}
          >
            Discard
          </Button>
        </div>
      )}
    </div>
  )
}
