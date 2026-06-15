"use client"

import { useEffect, useState } from "react"
import { BicepsFlexedIcon, CheckIcon, FolderGitIcon, NotebookPenIcon, UserPenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { getAgentColor } from "@/lib/agent-colors"
import type { Agent, SessionType } from "@/lib/opendora"

interface SessionCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateSession: (sessionType: SessionType, agentID: string | undefined) => void
  agents: (Agent & { _id: string })[]
  selectedAgentId?: string
}

export const SESSION_TYPE_CONFIG = {
  scope: {
    label: "Scope",
    description: "Project-scoped session",
    icon: FolderGitIcon,
    accent: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  scratchpad: {
    label: "Scratchpad",
    description: "Temporary throwaway session",
    icon: NotebookPenIcon,
    accent: "text-slate-500",
    bg: "bg-slate-500/10",
  },
  worker: {
    label: "Worker",
    description: "Short-lived job",
    icon: BicepsFlexedIcon,
    accent: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  role: {
    label: "Role",
    description: "Long-lived agent session",
    icon: UserPenIcon,
    accent: "text-violet-500",
    bg: "bg-violet-500/10",
  },
} as const

export function SessionCreateDialog({
  open,
  onOpenChange,
  onCreateSession,
  agents,
  selectedAgentId,
}: SessionCreateDialogProps) {
  const [chosenAgent, setChosenAgent] = useState<string | undefined>(selectedAgentId)
  const [chosenType, setChosenType] = useState<SessionType>("scope")

  useEffect(() => {
    if (open) {
      setChosenAgent(selectedAgentId)
      setChosenType("scope")
    }
  }, [open, selectedAgentId])

  function handleCreate() {
    onCreateSession(chosenType, chosenAgent)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>New Session</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-4">
          {agents.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Agent
              </p>
              <div className="h-[120px] overflow-hidden rounded-lg border border-border">
                <ScrollArea className="h-full">
                  <div className="grid grid-cols-2 gap-1.5 p-1.5">
                    {agents.map((agent) => {
                      const isSelected = agent._id === chosenAgent
                      const color = getAgentColor(agent.color)
                      return (
                        <button
                          key={agent._id}
                          type="button"
                          onClick={() => setChosenAgent(agent._id)}
                          className={cn(
                            "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-all outline-none",
                            "focus-visible:ring-2 focus-visible:ring-ring",
                            isSelected
                              ? "bg-primary/10 text-foreground ring-1 ring-primary/30"
                              : "hover:bg-accent/60",
                          )}
                        >
                          <div
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span className="truncate text-sm font-medium capitalize">{agent.name}</span>
                          {isSelected && (
                            <CheckIcon className="ml-auto size-3 shrink-0 text-primary" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          {agents.length > 0 && <Separator />}

          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Session Type
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.entries(SESSION_TYPE_CONFIG) as [SessionType, (typeof SESSION_TYPE_CONFIG)[SessionType]][]).map(
                ([type, config]) => {
                  const Icon = config.icon
                  const isSelected = type === chosenType
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setChosenType(type)}
                      className={cn(
                        "group flex flex-col items-center gap-1.5 rounded-lg border py-3 px-2 text-center transition-all outline-none",
                        "focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected
                          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-primary/30 hover:bg-accent/50",
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-7 items-center justify-center rounded-md transition-colors",
                          isSelected ? cn(config.bg, config.accent) : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                      </div>
                      <span className="text-xs font-medium leading-none">{config.label}</span>
                    </button>
                  )
                },
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-muted/20 gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate}>
            Create Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
