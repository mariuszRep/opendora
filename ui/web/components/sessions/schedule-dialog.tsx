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
import { CronInput } from "@/components/ui/cron-input"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { opendora, type Schedule } from "@/lib/opendora"
import { toast } from "sonner"
import { Wrench, Pencil, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { AGENT_COLORS } from "@/lib/agent-colors"

// ── Delegate params stored as JSON in prompt when action_type === "tool" ──
interface DelegateParams {
  agent?: string
  session_id?: string
  session_type?: "worker" | "scope" | "scratchpad" | "role"
  title?: string
  prompt: string
  description?: string
  wait?: boolean
}

function parseDelegateParams(raw: string): DelegateParams {
  try { return JSON.parse(raw) } catch { return { prompt: raw } }
}

// ─────────────────────────────────────────────────────────────
// Inner dialog for configuring the delegate tool
// ─────────────────────────────────────────────────────────────
function DelegateToolDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  agents,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: DelegateParams
  onSave: (p: DelegateParams) => void
  agents: any[]
}) {
  const [agent, setAgent] = React.useState("")
  const [sessionTarget, setSessionTarget] = React.useState<"none" | "existing" | "new">("none")
  const [sessionId, setSessionId] = React.useState("")
  const [sessionType, setSessionType] = React.useState<DelegateParams["session_type"]>("worker")
  const [title, setTitle] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [wait, setWait] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    const p = initial ?? { prompt: "" }
    setAgent(p.agent ?? "")
    setTitle(p.title ?? "")
    setPrompt(p.prompt ?? "")
    setDescription(p.description ?? "")
    setWait(p.wait ?? false)
    if (p.session_id) { setSessionTarget("existing"); setSessionId(p.session_id) }
    else if (p.session_type) { setSessionTarget("new"); setSessionType(p.session_type) }
    else { setSessionTarget("none") }
  }, [open, initial])

  const handleSave = () => {
    if (!agent && !sessionId) { toast.error("Select a target agent or session"); return }
    if (!prompt.trim()) { toast.error("Prompt cannot be empty"); return }
    const params: DelegateParams = { prompt: prompt.trim() }
    if (agent) params.agent = agent
    if (sessionTarget === "existing" && sessionId.trim()) params.session_id = sessionId.trim()
    if (sessionTarget === "new") params.session_type = sessionType
    if (title.trim()) params.title = title.trim()
    if (description.trim()) params.description = description.trim()
    if (wait) params.wait = true
    onSave(params)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Delegate Tool
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <Label>Session title <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Input placeholder="e.g. Daily standup summary" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* Agent */}
          <div className="flex flex-col gap-1.5">
            <Label>Target agent <span className="text-destructive">*</span></Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={(a as any)._id ?? a.name} value={(a as any)._id ?? a.name}>
                    <span className="capitalize">{a.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Session target */}
          <div className="flex flex-col gap-1.5">
            <Label>Session target</Label>
            <Select value={sessionTarget} onValueChange={v => setSessionTarget(v as typeof sessionTarget)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Agent default session</SelectItem>
                <SelectItem value="existing">Existing session (by ID)</SelectItem>
                <SelectItem value="new">Create new session</SelectItem>
              </SelectContent>
            </Select>
            {sessionTarget === "existing" && (
              <Input className="mt-1" placeholder="Session ID" value={sessionId} onChange={e => setSessionId(e.target.value)} />
            )}
            {sessionTarget === "new" && (
              <Select value={sessionType} onValueChange={v => setSessionType(v as typeof sessionType)}>
                <SelectTrigger className="w-full mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker">Worker — short-lived task</SelectItem>
                  <SelectItem value="scope">Scope — project-based</SelectItem>
                  <SelectItem value="scratchpad">Scratchpad — experimental</SelectItem>
                  <SelectItem value="role">Role — ongoing</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Prompt */}
          <div className="flex flex-col gap-1.5">
            <Label>Prompt <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Message to send to the target agent"
              className="resize-none min-h-20"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label>Description <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Input placeholder="Short label for logs and UI" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {/* Wait */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <Label>Wait for reply</Label>
              <p className="text-xs text-muted-foreground">Block until the agent responds.</p>
            </div>
            <Switch checked={wait} onCheckedChange={setWait} />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleSave}>Save tool</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────
// Main schedule dialog
// ─────────────────────────────────────────────────────────────
export function ScheduleDialog({
  open,
  onOpenChange,
  sessionId: sessionIdProp,
  agentId: agentIdProp,
  schedule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId?: string
  agentId?: string
  schedule?: Schedule
}) {
  const isEdit = !!schedule
  const { agents } = useOpendoraContext()
  const visibleAgents = agents.filter((a) => !a.hidden)

  const [cronExpr, setCronExpr] = React.useState("0 9 * * 1")
  const [message, setMessage] = React.useState("")
  const [delegateParams, setDelegateParams] = React.useState<DelegateParams | null>(null)
  const [toolDialogOpen, setToolDialogOpen] = React.useState(false)
  const [color, setColor] = React.useState("slate")

  // Populate from existing schedule
  React.useEffect(() => {
    if (!open) return
    if (schedule) {
      setCronExpr(schedule.cron_expression)
      setColor(schedule.color ?? "slate")
      if (schedule.action_type === "tool") {
        setDelegateParams(parseDelegateParams(schedule.prompt))
        setMessage("")
      } else {
        setMessage(schedule.prompt)
        setDelegateParams(null)
      }
    } else {
      setCronExpr("0 9 * * 1")
      setMessage("")
      setDelegateParams(null)
      setColor("slate")
    }
  }, [open, schedule])

  const handleSubmit = async () => {
    let prompt: string
    let action_type: "message" | "tool"

    if (delegateParams) {
      action_type = "tool"
      prompt = JSON.stringify(delegateParams)
    } else {
      if (!message.trim()) { toast.error("Message cannot be empty"); return }
      action_type = "message"
      prompt = message.trim()
    }

    try {
      if (isEdit) {
        await opendora.schedule.update(schedule.id, {
          prompt, cron_expression: cronExpr, action_type,
          tool_name: delegateParams ? "delegate" : undefined,
          color,
        })
        toast.success("Schedule updated!")
      } else {
        await opendora.schedule.create({
          agent_id: agentIdProp,
          session_id: sessionIdProp,
          prompt, cron_expression: cronExpr, action_type,
          tool_name: delegateParams ? "delegate" : undefined,
          color,
        })
        toast.success("Schedule created!")
      }
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || (isEdit ? "Failed to update" : "Failed to create"))
    }
  }

  // Summary line for the delegate card
  const delegateSummary = delegateParams
    ? [
        delegateParams.agent ? `→ ${delegateParams.agent}` : null,
        delegateParams.session_type ? `(new ${delegateParams.session_type})` : null,
        delegateParams.title ? `"${delegateParams.title}"` : null,
      ].filter(Boolean).join(" ")
    : ""

  return (
    <>
      <DelegateToolDialog
        open={toolDialogOpen}
        onOpenChange={setToolDialogOpen}
        initial={delegateParams ?? undefined}
        onSave={setDelegateParams}
        agents={visibleAgents}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Schedule" : "New Schedule"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 py-2">
            {/* Cron */}
            <div className="flex flex-col gap-1.5">
              <Label>Schedule (cron)</Label>
              <CronInput value={cronExpr} onChange={setCronExpr} />
            </div>

            {/* Message / Tool card */}
            <div className="flex flex-col gap-1.5">
              <Label>{delegateParams ? "Delegate Tool" : "Message"}</Label>

              {delegateParams ? (
                /* ── Tool card ── */
                <div
                  className={cn(
                    "relative rounded-md border border-border bg-muted/40 p-3 pr-16",
                    "flex flex-col gap-1"
                  )}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Wrench className="h-3 w-3" />
                    <span>Delegate</span>
                    {delegateSummary && (
                      <span className="text-muted-foreground/70">{delegateSummary}</span>
                    )}
                  </div>
                  <p className="text-sm leading-snug line-clamp-3">{delegateParams.prompt}</p>

                  {/* Action buttons */}
                  <div className="absolute right-2 top-2 flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setToolDialogOpen(true)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => setDelegateParams(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Plain message textarea ── */
                <div className="relative">
                  <Textarea
                    placeholder="Message to send to the agent on schedule"
                    className="resize-none min-h-24 pr-10"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground"
                    title="Configure delegate tool"
                    onClick={() => setToolDialogOpen(true)}
                  >
                    <Wrench className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

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

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSubmit}>{isEdit ? "Save changes" : "Create schedule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
