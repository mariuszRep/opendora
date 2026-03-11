"use client"

import { useEffect, useState } from "react"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import type { Session } from "@/lib/opendora"

interface SessionEditSheetProps {
  session: Session | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SessionEditSheet({ session, open, onOpenChange }: SessionEditSheetProps) {
  const { agents, setSessionAgent, setAgentMainSession } = useOpendoraContext()

  const [title, setTitle] = useState("")
  const [agentID, setAgentID] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visibleAgents = agents.filter((a) => !a.hidden)

  useEffect(() => {
    if (session) {
      setTitle(session.title ?? "")
      setAgentID(session.agentID ?? "__none__")
    }
    setError(null)
  }, [session, open])

  async function handleSave() {
    if (!session) return
    setSaving(true)
    setError(null)
    try {
      const newAgentID = agentID === "__none__" ? null : agentID
      // Update agent if changed
      if (newAgentID !== (session.agentID ?? null)) {
        await setSessionAgent(session.id, newAgentID)
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function handlePromoteToMain() {
    if (!session || !agentID || agentID === "__none__") return
    setSaving(true)
    setError(null)
    try {
      await setAgentMainSession(agentID === "__none__" ? (session.agentID ?? "") : agentID, session.id)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote session")
    } finally {
      setSaving(false)
    }
  }

  const currentAgentID = agentID === "__none__" ? null : agentID
  const isAlreadyMain = session?.sessionType === "role"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Session settings</SheetTitle>
          <SheetDescription className="sr-only">Edit session properties</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-6 flex-1 overflow-y-auto pb-4">
          {/* Title (read-only display for now — title is set by the backend from message content) */}
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input
              value={title || "Untitled session"}
              readOnly
              className="text-muted-foreground"
            />
            <p className="text-[11px] text-muted-foreground">Title is derived from the conversation.</p>
          </div>

          {/* Default Agent */}
          <div className="flex flex-col gap-1.5">
            <Label>Default agent</Label>
            <Select value={agentID} onValueChange={setAgentID}>
              <SelectTrigger>
                <SelectValue placeholder="No agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No agent</SelectItem>
                {visibleAgents.map((agent) => (
                  <SelectItem key={agent.name} value={agent.name}>
                    <span className="capitalize">{agent.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              The agent that handles messages in this session.
            </p>
          </div>

          {/* Main session status */}
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-xs font-medium">{isAlreadyMain ? "Main session" : "Regular session"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {isAlreadyMain
                    ? "This is the default session for its agent."
                    : "Promote to make this the default session for the selected agent."}
                </p>
              </div>
              {!isAlreadyMain && currentAgentID && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePromoteToMain}
                  disabled={saving}
                  className="shrink-0 ml-3"
                >
                  {saving ? <Loader2Icon className="size-3 animate-spin" /> : "Set as main"}
                </Button>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <SheetFooter className="px-6 py-4 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
