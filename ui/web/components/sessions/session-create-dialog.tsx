"use client"

import { BicepsFlexedIcon, FolderGitIcon, NotebookPenIcon, UserPenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { SessionType } from "@/lib/opendora"

interface SessionCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateSession: (sessionType: SessionType, openSettings: boolean) => void
}

const SESSION_TYPE_CONFIG = {
  scratchpad: {
    label: "Scratchpad",
    description: "Temporary throwaway session",
    icon: NotebookPenIcon,
  },
  scope: {
    label: "Scope",
    description: "Project-scoped session",
    icon: FolderGitIcon,
  },
  worker: {
    label: "Worker",
    description: "Short-lived job",
    icon: BicepsFlexedIcon,
  },
  role: {
    label: "Role",
    description: "Long-lived agent session",
    icon: UserPenIcon,
  },
} as const

export function SessionCreateDialog({ open, onOpenChange, onCreateSession }: SessionCreateDialogProps) {
  function handleCreateSession(sessionType: SessionType) {
    onCreateSession(sessionType, false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create new session</DialogTitle>
          <DialogDescription>
            Choose the type of session you want to create
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-4">
          {Object.entries(SESSION_TYPE_CONFIG).map(([type, config]) => {
            const Icon = config.icon
            return (
              <Button
                key={type}
                variant="outline"
                onClick={() => handleCreateSession(type as SessionType)}
                className="flex flex-col items-center gap-2 h-auto p-4 hover:bg-accent"
              >
                <Icon className="size-6" />
                <div className="flex flex-col text-center">
                  <span className="font-medium">{config.label}</span>
                  <span className="text-xs text-muted-foreground">{config.description}</span>
                </div>
              </Button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { SESSION_TYPE_CONFIG }
