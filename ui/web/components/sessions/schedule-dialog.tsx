"use client"

import * as React from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { CronInput } from "@/components/ui/cron-input"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { opendora, type Schedule, type Session } from "@/lib/opendora"
import { toast } from "sonner"
import { AGENT_COLORS } from "@/lib/agent-colors"
import { PlayIcon, TrashIcon } from "lucide-react"

type RunMode = "direct" | "sub-session"
type SubTarget = "new" | "existing"
type SubSessionType = "worker" | "scope" | "scratchpad"

function formatSessionTitle(session: Session): string {
  if (session.title && !session.title.startsWith("New session")) return session.title
  return new Date(session.time.created).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

export function ScheduleDialog({
  open,
  onOpenChange,
  sessionId: sessionIdProp,
  agentId: agentIdProp,
  schedule,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId?: string
  agentId?: string
  schedule?: Schedule
  onDeleted?: () => void
}) {
  const isEdit = !!schedule
  const { agents, sessions } = useOpendoraContext()
  const visibleAgents = agents.filter((a) => !a.hidden)

  const [cronExpr, setCronExpr] = React.useState("0 9 * * 1")
  const [name, setName] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [color, setColor] = React.useState("slate")
  const [isActive, setIsActive] = React.useState(true)
  const [ownerSessionId, setOwnerSessionId] = React.useState<string>("")
  const [runMode, setRunMode] = React.useState<RunMode>("direct")
  const [subTarget, setSubTarget] = React.useState<SubTarget>("new")
  const [subSessionType, setSubSessionType] = React.useState<SubSessionType>("worker")
  const [subExistingSessionId, setSubExistingSessionId] = React.useState<string>("")
  const [subAgentOverride, setSubAgentOverride] = React.useState<string>("")

  const ownerSession = sessions.find((s) => s.id === ownerSessionId) ?? null
  const ownerAgentId = ownerSession?.agentID ?? agentIdProp ?? ""

  React.useEffect(() => {
    if (!open) return
    if (schedule) {
      setCronExpr(schedule.cron_expression)
      setName(schedule.name ?? "")
      setColor(schedule.color ?? "slate")
      setIsActive(schedule.is_active ?? true)
      setOwnerSessionId(schedule.session_id ?? "")
      if (schedule.action_type === "tool") {
        try {
          const p = JSON.parse(schedule.prompt)
          setMessage(p.prompt ?? "")
          setSubAgentOverride(p.agent ?? "")
          setRunMode("sub-session")
          if (p.session_id) {
            setSubTarget("existing")
            setSubExistingSessionId(p.session_id)
            setSubSessionType("worker")
          } else {
            setSubTarget("new")
            setSubSessionType((p.session_type as SubSessionType) ?? "worker")
            setSubExistingSessionId("")
          }
        } catch {
          setMessage(schedule.prompt)
          setRunMode("direct")
        }
      } else {
        setMessage(schedule.prompt)
        setRunMode("direct")
        setSubTarget("new")
        setSubSessionType("worker")
        setSubExistingSessionId("")
        setSubAgentOverride("")
      }
    } else {
      setCronExpr("0 9 * * 1")
      setName("")
      setMessage("")
      setColor("slate")
      setIsActive(true)
      setOwnerSessionId(sessionIdProp ?? "")
      setRunMode("direct")
      setSubTarget("new")
      setSubSessionType("worker")
      setSubExistingSessionId("")
      setSubAgentOverride("")
    }
  }, [open, schedule, sessionIdProp])

  const handleSubmit = async () => {
    if (!message.trim()) { toast.error("Message cannot be empty"); return }
    if (!ownerSessionId) { toast.error("Select a parent session"); return }

    let prompt: string
    let action_type: "message" | "tool"
    let tool_name: string | undefined

    if (runMode === "sub-session") {
      const agentId = subAgentOverride || ownerAgentId
      if (!agentId && subTarget === "new") {
        toast.error("No agent available — select an agent override or attach to a session with an agent")
        return
      }
      action_type = "tool"
      tool_name = "delegate"
      const params: Record<string, unknown> = { prompt: message.trim() }
      if (agentId) params.agent = agentId
      if (subTarget === "new") {
        params.session_type = subSessionType
      } else {
        if (!subExistingSessionId) { toast.error("Select an existing target session"); return }
        params.session_id = subExistingSessionId
      }
      prompt = JSON.stringify(params)
    } else {
      action_type = "message"
      tool_name = undefined
      prompt = message.trim()
    }

    try {
      if (isEdit) {
        await opendora.schedule.update(schedule.id, {
          prompt, cron_expression: cronExpr, action_type, tool_name, color,
          is_active: isActive,
          session_id: ownerSessionId,
          agent_id: ownerAgentId || null,
          name: name.trim() || null,
        })
        toast.success("Schedule updated!")
      } else {
        await opendora.schedule.create({
          session_id: ownerSessionId,
          agent_id: ownerAgentId || undefined,
          prompt, cron_expression: cronExpr, action_type, tool_name, color,
          name: name.trim() || undefined,
        })
        toast.success("Schedule created!")
      }
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || (isEdit ? "Failed to update" : "Failed to create"))
    }
  }

  const handleRunNow = async () => {
    if (!schedule) return
    try {
      await opendora.schedule.run(schedule.id)
      toast.success("Schedule triggered!")
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger schedule")
    }
  }

  const handleDelete = async () => {
    if (!schedule) return
    try {
      await opendora.schedule.remove(schedule.id)
      toast.success("Schedule deleted")
      onDeleted ? onDeleted() : onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || "Failed to delete schedule")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Schedule" : "New Schedule"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 py-2 max-h-[75vh] overflow-y-auto pr-1">

          {/* ── Left column ── */}
          <div className="flex flex-col gap-5">

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label>
                Name
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(auto-generated if left blank)</span>
              </Label>
              <Input
                placeholder="e.g. Daily standup summary"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            {/* Parent session */}
            <div className="flex flex-col gap-1.5">
              <Label>Parent session</Label>
              <Select
                value={ownerSessionId || "__none__"}
                onValueChange={(v) => setOwnerSessionId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a session…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None (unattached) —</SelectItem>
                  {sessions.map((s) => {
                    const agent = agents.find((a) => (a as any)._id === s.agentID)
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-baseline gap-1.5">
                          <span>{formatSessionTitle(s)}</span>
                          {agent && (
                            <span className="text-xs text-muted-foreground capitalize">@{agent.name}</span>
                          )}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Cron */}
            <div className="flex flex-col gap-1.5">
              <Label>Schedule (cron)</Label>
              <CronInput value={cronExpr} onChange={setCronExpr} />
            </div>

            {/* Active toggle — edit only */}
            {isEdit && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Active</span>
                  <span className="text-xs text-muted-foreground">Enable or pause this schedule</span>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}

            {/* Color */}
            <div className="flex flex-col gap-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {AGENT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    onClick={() => setColor(c.id)}
                    className="size-5 rounded-full transition-all"
                    style={{
                      backgroundColor: c.hex,
                      outline: color === c.id ? `2px solid ${c.hex}` : undefined,
                      outlineOffset: color === c.id ? "2px" : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="flex flex-col gap-5">

            {/* Run mode */}
            <div className="flex flex-col gap-1.5">
              <Label>Run in</Label>
              <Select value={runMode} onValueChange={(v) => setRunMode(v as RunMode)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">This session — send directly</SelectItem>
                  <SelectItem value="sub-session">Delegate to another session</SelectItem>
                </SelectContent>
              </Select>

              {runMode === "sub-session" && (
                <div className="flex flex-col gap-3 mt-1 pl-3 border-l-2 border-muted">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Target session</Label>
                    <Select value={subTarget} onValueChange={(v) => setSubTarget(v as SubTarget)}>
                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Create new sub-session each run</SelectItem>
                        <SelectItem value="existing">Use an existing session</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {subTarget === "new" && (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Sub-session type</Label>
                      <Select value={subSessionType} onValueChange={(v) => setSubSessionType(v as SubSessionType)}>
                        <SelectTrigger className="w-full h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="worker">Worker — short-lived task</SelectItem>
                          <SelectItem value="scope">Scope — project-based</SelectItem>
                          <SelectItem value="scratchpad">Scratchpad — experimental</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {subTarget === "existing" && (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Target session</Label>
                      <Select
                        value={subExistingSessionId || "__none__"}
                        onValueChange={(v) => setSubExistingSessionId(v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="w-full h-8 text-sm"><SelectValue placeholder="Pick session…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Select session —</SelectItem>
                          {sessions.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {formatSessionTitle(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">
                      Agent override <span className="font-normal">(optional)</span>
                    </Label>
                    <Select
                      value={subAgentOverride || "__inherit__"}
                      onValueChange={(v) => setSubAgentOverride(v === "__inherit__" ? "" : v)}
                    >
                      <SelectTrigger className="w-full h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__inherit__">Inherit from session</SelectItem>
                        {visibleAgents.map((a) => (
                          <SelectItem key={(a as any)._id} value={(a as any)._id}>
                            <span className="capitalize">{a.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1.5 flex-1">
              <Label>Message</Label>
              <Textarea
                placeholder="Message to send on schedule"
                className="resize-none flex-1 min-h-32"
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Separator before footer on mobile keeps layout clean */}
        <Separator className="mt-1" />

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between">
          {/* Destructive actions — left side (edit only) */}
          {isEdit ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRunNow} className="gap-1.5">
                <PlayIcon className="size-3.5" />
                Run now
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete} className="gap-1.5">
                <TrashIcon className="size-3.5" />
                Delete
              </Button>
            </div>
          ) : (
            <div />
          )}

          {/* Primary actions — right side */}
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSubmit}>{isEdit ? "Save changes" : "Create schedule"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
