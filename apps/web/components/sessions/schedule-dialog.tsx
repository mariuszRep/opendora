"use client"

import * as React from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { CronInput, cronToHuman } from "@/components/ui/cron-input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { opendora, type Schedule, type Session, type Workflow } from "@/lib/opendora"
import { toast } from "sonner"
import { AGENT_COLORS } from "@/lib/agent-colors"
import { PlayIcon, TrashIcon, PencilIcon } from "lucide-react"
import { renderFieldInput, type WorkflowFieldDef } from "@/components/workflow/render-field-input"

const CREATE_NEW_SESSION = "__create_new__"

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
  const isSessionScoped = !!sessionIdProp
  const { agents, sessions } = useOpendoraContext()
  const visibleAgents = agents.filter((a) => !a.hidden)

  const [cronExpr, setCronExpr] = React.useState("0 9 * * 1")
  const [cronDialogOpen, setCronDialogOpen] = React.useState(false)
  const [paramsDialogOpen, setParamsDialogOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState("slate")
  const [isActive, setIsActive] = React.useState(true)
  const [ownerSessionId, setOwnerSessionId] = React.useState<string>("")
  const [explicitAgentId, setExplicitAgentId] = React.useState<string>("")
  const [newSessionName, setNewSessionName] = React.useState<string>("")

  // Workflow state
  const [workflowId, setWorkflowId] = React.useState<string>("")
  const [workflows, setWorkflows] = React.useState<Workflow[]>([])
  const [workflowsLoading, setWorkflowsLoading] = React.useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = React.useState<Workflow | null>(null)
  const [workflowLoading, setWorkflowLoading] = React.useState(false)
  const [inputValues, setInputValues] = React.useState<Record<string, string>>({})

  const isCreatingNewSession = !isSessionScoped && ownerSessionId === CREATE_NEW_SESSION
  const ownerSession = sessions.find((s) => s.id === ownerSessionId) ?? null
  const ownerAgentId = isSessionScoped
    ? (agentIdProp ?? ownerSession?.agentID ?? "")
    : (explicitAgentId || (ownerSession?.agentID ?? ""))

  const filteredSessions = !isSessionScoped && explicitAgentId
    ? sessions.filter((s) => s.agentID === explicitAgentId)
    : sessions

  const scopedSessionTitle = React.useMemo(() => {
    if (!isSessionScoped) return null
    const s = sessions.find((s) => s.id === sessionIdProp)
    return s ? formatSessionTitle(s) : sessionIdProp ?? ""
  }, [isSessionScoped, sessions, sessionIdProp])

  const scopedAgentName = React.useMemo(() => {
    if (!isSessionScoped) return null
    const agId = agentIdProp ?? sessions.find((s) => s.id === sessionIdProp)?.agentID ?? ""
    const ag = agents.find((a) => (a as any)._id === agId)
    return ag?.name ?? null
  }, [isSessionScoped, agents, sessions, agentIdProp, sessionIdProp])

  const currentColorHex = AGENT_COLORS.find((c) => c.id === color)?.hex ?? "#888"

  React.useEffect(() => {
    if (!open) return
    setWorkflowsLoading(true)
    opendora.workflow.list()
      .then(setWorkflows).catch(() => setWorkflows([]))
      .finally(() => setWorkflowsLoading(false))
  }, [open])

  React.useEffect(() => {
    if (!workflowId) { setSelectedWorkflow(null); return }
    setWorkflowLoading(true)
    opendora.workflow.get(workflowId)
      .then(setSelectedWorkflow).catch(() => setSelectedWorkflow(null))
      .finally(() => setWorkflowLoading(false))
  }, [workflowId])

  React.useEffect(() => {
    if (!open) return
    if (schedule) {
      setCronExpr(schedule.cron_expression)
      setName(schedule.name ?? "")
      setColor(schedule.color ?? "slate")
      setIsActive(schedule.is_active ?? true)
      setOwnerSessionId(schedule.session_id ?? "")
      setExplicitAgentId(schedule.agent_id ?? "")
      setNewSessionName("")
      setWorkflowId(schedule.workflow_id ?? "")
      setInputValues(
        schedule.workflow_input
          ? Object.fromEntries(
              Object.entries(schedule.workflow_input).map(([k, v]) => [
                k,
                typeof v === "string" ? v : JSON.stringify(v),
              ])
            )
          : {}
      )
    } else {
      setCronExpr("0 9 * * 1")
      setName("")
      setColor("slate")
      setIsActive(true)
      setOwnerSessionId(sessionIdProp ?? "")
      setExplicitAgentId(agentIdProp ?? "")
      setNewSessionName("")
      setWorkflowId("")
      setInputValues({})
    }
  }, [open, schedule, sessionIdProp, agentIdProp])

  const handleSubmit = async () => {
    if (!workflowId) { toast.error("Select a workflow"); return }

    let finalSessionId: string | undefined

    if (isSessionScoped) {
      finalSessionId = sessionIdProp
    } else {
      if (!ownerSessionId) { toast.error("Select or create a parent session"); return }
      if (isCreatingNewSession) {
        try {
          const created = await opendora.session.create({
            agentID: ownerAgentId || undefined,
            title: newSessionName.trim() || undefined,
          })
          finalSessionId = created.id
        } catch (err: any) {
          toast.error(err.message || "Failed to create session")
          return
        }
      } else {
        finalSessionId = ownerSessionId
      }
    }

    const paramNode = selectedWorkflow?.nodes.find(
      (n) => n.type === "workflow" && (n.data as any)?.nodeType === "parameters"
    )
    const params = ((paramNode?.data as any)?.workflowParameters ?? []) as WorkflowFieldDef[]
    const workflowInput: Record<string, unknown> = Object.fromEntries(
      params
        .filter(({ name: n }) => (inputValues[n] ?? "") !== "")
        .map(({ name: n, type }) => {
          const raw = inputValues[n] ?? ""
          const t = type ?? "string"
          let coerced: unknown = raw
          if (t === "boolean") coerced = raw === "true"
          else if (t === "number" || t === "integer") coerced = Number(raw)
          else if (t === "object" || t === "array") { try { coerced = JSON.parse(raw) } catch { coerced = raw } }
          return [n, coerced]
        })
    )

    try {
      if (isEdit) {
        await opendora.schedule.update(schedule.id, {
          workflow_id: workflowId,
          workflow_input: workflowInput,
          cron_expression: cronExpr,
          color,
          is_active: isActive,
          session_id: finalSessionId,
          agent_id: ownerAgentId || null,
          ...(name.trim() ? { name: name.trim() } : {}),
        })
        toast.success("Schedule updated!")
      } else {
        await opendora.schedule.create({
          session_id: finalSessionId,
          agent_id: ownerAgentId || undefined,
          workflow_id: workflowId,
          workflow_input: workflowInput,
          cron_expression: cronExpr,
          color,
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-lg sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Schedule" : "New Schedule"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 py-2 max-h-[75vh] overflow-y-auto pr-1">

            {/* ── Left column ── */}
            <div className="flex flex-col gap-5">

              {/* Name + color dot */}
              <div className="flex flex-col gap-1.5">
                <Label>
                  Name
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(auto-generated if left blank)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="e.g. Daily standup summary"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title="Change color"
                        className="size-7 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-background transition-all hover:scale-110 focus-visible:outline-none"
                        style={{ backgroundColor: currentColorHex, ringColor: currentColorHex }}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="p-2.5 w-auto" align="end">
                      <div className="flex flex-wrap gap-2" style={{ maxWidth: 168 }}>
                        {AGENT_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            title={c.label}
                            onClick={() => setColor(c.id)}
                            className="size-6 rounded-full transition-all hover:scale-110 focus-visible:outline-none"
                            style={{
                              backgroundColor: c.hex,
                              outline: color === c.id ? `2px solid ${c.hex}` : undefined,
                              outlineOffset: color === c.id ? "3px" : undefined,
                            }}
                          />
                        ))}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {isSessionScoped ? (
                <div className="flex flex-col gap-0.5 rounded-md border px-3 py-2.5 bg-muted/40">
                  <span className="text-xs text-muted-foreground mb-0.5">Attached to</span>
                  <span className="text-sm font-medium truncate">{scopedSessionTitle}</span>
                  {scopedAgentName && (
                    <span className="text-xs text-muted-foreground capitalize">@{scopedAgentName}</span>
                  )}
                </div>
              ) : (
                <>
                  {/* Agent */}
                  <div className="flex flex-col gap-1.5">
                    <Label>
                      Agent
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Select
                      value={explicitAgentId || "__none__"}
                      onValueChange={(v) => {
                        const newAgent = v === "__none__" ? "" : v
                        setExplicitAgentId(newAgent)
                        if (newAgent && ownerSession && ownerSession.agentID !== newAgent) {
                          setOwnerSessionId("")
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select agent…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Any agent —</SelectItem>
                        {visibleAgents.map((a) => (
                          <SelectItem key={(a as any)._id} value={(a as any)._id}>
                            <span className="capitalize">{a.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Parent session */}
                  <div className="flex flex-col gap-1.5">
                    <Label>Parent session</Label>
                    <Select
                      value={ownerSessionId || "__none__"}
                      onValueChange={(v) => setOwnerSessionId(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select or create session…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— None (unattached) —</SelectItem>
                        <SelectItem value={CREATE_NEW_SESSION}>+ Create new session…</SelectItem>
                        {filteredSessions.map((s) => {
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

                    {isCreatingNewSession && (
                      <Input
                        placeholder="Session name (optional)"
                        value={newSessionName}
                        onChange={(e) => setNewSessionName(e.target.value)}
                        autoFocus
                      />
                    )}
                  </div>
                </>
              )}

              {/* Schedule summary + edit */}
              <div className="flex flex-col gap-1.5">
                <Label>Schedule</Label>
                <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 min-h-10">
                  <span className="flex-1 text-sm text-muted-foreground leading-snug">
                    {cronToHuman(cronExpr)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs shrink-0"
                    onClick={() => setCronDialogOpen(true)}
                  >
                    <PencilIcon className="size-3" />
                    Edit
                  </Button>
                </div>
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
            </div>

            {/* ── Right column ── */}
            <div className="flex flex-col gap-5">

              {/* Workflow selector */}
              <div className="flex flex-col gap-1.5">
                <Label>Workflow</Label>
                {workflowsLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
                  <Select value={workflowId || "__none__"} onValueChange={(v) => {
                    setWorkflowId(v === "__none__" ? "" : v)
                    setInputValues({})
                  }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select workflow…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select a workflow —</SelectItem>
                      {workflows.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Parameters summary + configure */}
              {workflowId && (() => {
                const paramNode = selectedWorkflow?.nodes.find(
                  (n) => n.type === "workflow" && (n.data as any)?.nodeType === "parameters"
                )
                const params = ((paramNode?.data as any)?.workflowParameters ?? []) as WorkflowFieldDef[]
                const filledCount = params.filter(({ name: n }) => (inputValues[n] ?? "") !== "").length
                const summary = workflowLoading
                  ? "Loading…"
                  : params.length === 0
                    ? "No parameters"
                    : filledCount === params.length
                      ? `${params.length} parameter${params.length !== 1 ? "s" : ""} set`
                      : `${filledCount} / ${params.length} parameter${params.length !== 1 ? "s" : ""} set`
                return (
                  <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 min-h-10">
                    <span className="flex-1 text-sm text-muted-foreground">{summary}</span>
                    {!workflowLoading && params.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs shrink-0"
                        onClick={() => setParamsDialogOpen(true)}
                      >
                        <PencilIcon className="size-3" />
                        Configure
                      </Button>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>

          <Separator className="mt-1" />

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between">
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

            <div className="flex gap-2 justify-end">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={handleSubmit}>{isEdit ? "Save changes" : "Create schedule"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cron editor dialog */}
      <Dialog open={cronDialogOpen} onOpenChange={setCronDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit schedule</DialogTitle>
          </DialogHeader>
          <CronInput value={cronExpr} onChange={setCronExpr} />
          <DialogFooter>
            <Button onClick={() => setCronDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parameters dialog */}
      <Dialog open={paramsDialogOpen} onOpenChange={setParamsDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Workflow parameters</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {(() => {
              const paramNode = selectedWorkflow?.nodes.find(
                (n) => n.type === "workflow" && (n.data as any)?.nodeType === "parameters"
              )
              const params = ((paramNode?.data as any)?.workflowParameters ?? []) as WorkflowFieldDef[]
              return params.map((field) => (
                <div key={field.name} className="flex flex-col gap-1.5">
                  <Label className="flex items-center gap-1.5">
                    <span className="font-mono text-sm">{field.name}</span>
                    {field.required !== false && <span className="text-destructive">*</span>}
                    {field.type && field.type !== "string" && (
                      <span className="text-xs text-muted-foreground font-normal font-mono">{field.type}</span>
                    )}
                  </Label>
                  {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                  {renderFieldInput(field, inputValues, setInputValues)}
                </div>
              ))
            })()}
          </div>
          <DialogFooter>
            <Button onClick={() => setParamsDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
