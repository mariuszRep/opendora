"use client"

import { useState } from "react"
import { BicepsFlexedIcon, FolderGitIcon, NotebookPenIcon, UserPenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  const [sessionType, setSessionType] = useState<SessionType>("scratchpad")

  function handleCreate(openSettings: boolean) {
    onCreateSession(sessionType, openSettings)
    onOpenChange(false)
  }

  const SelectedIcon = SESSION_TYPE_CONFIG[sessionType].icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create new session</DialogTitle>
          <DialogDescription>
            Choose the type of session you want to create
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="session-type" className="text-sm font-medium">
              Session Type
            </label>
            <Select value={sessionType} onValueChange={(v) => setSessionType(v as SessionType)}>
              <SelectTrigger id="session-type">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <SelectedIcon className="size-4" />
                    <span>{SESSION_TYPE_CONFIG[sessionType].label}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SESSION_TYPE_CONFIG).map(([type, config]) => {
                  const Icon = config.icon
                  return (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <Icon className="size-4" />
                        <div className="flex flex-col">
                          <span className="font-medium">{config.label}</span>
                          <span className="text-xs text-muted-foreground">{config.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {SESSION_TYPE_CONFIG[sessionType].description}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => handleCreate(false)} className="flex-1">
            Create
          </Button>
          <Button onClick={() => handleCreate(true)} className="flex-1">
            Create & Configure
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { SESSION_TYPE_CONFIG }
