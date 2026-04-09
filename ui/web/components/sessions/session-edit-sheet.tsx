"use client"

import { useEffect, useState } from "react"
import { Loader2Icon, Trash2Icon, PlusIcon, PlayIcon, TrashIcon, BellRingIcon, CalendarClockIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import type { Session, SessionType, RetentionPolicy, Schedule } from "@/lib/opendora"
import { opendora } from "@/lib/opendora"
import { ScheduleDialog } from "./schedule-dialog"
import { toast } from "sonner"


interface SessionEditSheetProps {
  session: Session | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SessionEditSheet({ session, open, onOpenChange }: SessionEditSheetProps) {
  const { agents, setSessionAgent, setAgentMainSession } = useOpendoraContext()

  const [title, setTitle] = useState("")
  const [agentID, setAgentID] = useState("")
  const [sessionType, setSessionType] = useState<SessionType>("scope")
  const [model, setModel] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [autoArchive, setAutoArchive] = useState(false)
  const [autoDelete, setAutoDelete] = useState(false)
  const [maxMessages, setMaxMessages] = useState("")
  const [ttlHours, setTtlHours] = useState("")
  const [path, setPath] = useState("")
  const [readPath, setReadPath] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Schedules tab state
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | undefined>(undefined)

  const visibleAgents = agents.filter((a) => !a.hidden)

  useEffect(() => {
    if (session) {
      setTitle(session.title ?? "")
      setAgentID(session.agentID ?? "__none__")
      setSessionType(session.sessionType ?? "scope")
      setModel(session.model ?? "")
      setSystemPrompt(session.systemPrompt ?? "")
      setPath(session.path ?? "")
      setReadPath(session.readPath ?? "")
      setAutoArchive(session.retention?.autoArchive ?? false)
      setAutoDelete(session.retention?.autoDelete ?? false)
      setMaxMessages(session.retention?.maxMessages?.toString() ?? "")
      setTtlHours(session.retention?.ttlMs ? (session.retention.ttlMs / (1000 * 60 * 60)).toString() : "")
    }
    setError(null)
  }, [session, open])

  // Load schedules for this session when the sheet opens
  useEffect(() => {
    if (!open || !session) return
    opendora.schedule.list()
      .then((all) => setSchedules(all.filter((s) => s.session_id === session.id)))
      .catch(console.error)
  }, [open, session, scheduleDialogOpen]) // re-fetch after dialog closes

  async function handleSave() {
    if (!session) return
    setSaving(true)
    setError(null)
    try {
      if (maxMessages && (isNaN(parseInt(maxMessages, 10)) || parseInt(maxMessages, 10) <= 0)) {
        setError("Max messages must be a positive number")
        setSaving(false)
        return
      }
      if (ttlHours && (isNaN(parseFloat(ttlHours)) || parseFloat(ttlHours) <= 0)) {
        setError("TTL must be a positive number")
        setSaving(false)
        return
      }
      if (autoArchive && autoDelete) {
        setError("Cannot enable both auto-archive and auto-delete")
        setSaving(false)
        return
      }

      const newAgentID = agentID === "__none__" ? null : agentID

      const retention: Partial<RetentionPolicy> = {}
      if (autoArchive !== (session.retention?.autoArchive ?? false)) retention.autoArchive = autoArchive
      if (autoDelete !== (session.retention?.autoDelete ?? false)) retention.autoDelete = autoDelete
      if (maxMessages) retention.maxMessages = parseInt(maxMessages, 10)
      if (ttlHours) retention.ttlMs = parseFloat(ttlHours) * 60 * 60 * 1000

      await opendora.session.update(session.id, {
        title: title !== session.title ? title : undefined,
        agentID: newAgentID !== (session.agentID ?? null) ? newAgentID : undefined,
        sessionType: sessionType !== session.sessionType ? sessionType : undefined,
        model: model !== (session.model ?? "") ? model : undefined,
        systemPrompt: systemPrompt !== (session.systemPrompt ?? "") ? systemPrompt : undefined,
        path: path !== (session.path ?? "") ? (path.trim() || null) : undefined,
        readPath: readPath !== (session.readPath ?? "") ? (readPath.trim() || null) : undefined,
        retention: Object.keys(retention).length > 0 ? retention : undefined,
      })

      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!session) return
    setDeleting(true)
    setError(null)
    try {
      await opendora.session.delete(session.id)
      setShowDeleteConfirm(false)
      onOpenChange(false)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session")
      setShowDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  async function handlePromoteToMain() {
    if (!session) return
    const targetAgentID = agentID === "__none__" ? session.agentID : agentID
    if (!targetAgentID) return
    
    setSaving(true)
    setError(null)
    try {
      await setAgentMainSession(targetAgentID, session.id)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote session")
    } finally {
      setSaving(false)
    }
  }

  async function toggleSchedule(id: string, active: boolean) {
    setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, is_active: active } : s))
    try {
      await opendora.schedule.update(id, { is_active: active })
    } catch (err) {
      console.error(err)
      setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, is_active: !active } : s))
    }
  }

  async function runScheduleNow(id: string) {
    try {
      await opendora.schedule.run(id)
      toast.success("Schedule triggered!")
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger schedule")
    }
  }

  async function deleteSchedule(id: string) {
    setSchedules((prev) => prev.filter((s) => s.id !== id))
    try {
      await opendora.schedule.remove(id)
    } catch (err) {
      console.error(err)
      opendora.schedule.list()
        .then((all) => setSchedules(all.filter((s) => s.session_id === session?.id)))
        .catch(console.error)
    }
  }

  const currentAgentID = agentID === "__none__" ? null : agentID
  const isAlreadyMain = session?.sessionType === "role"

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex flex-col sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Session settings</SheetTitle>
            <SheetDescription className="sr-only">Edit session properties</SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="general" className="flex flex-col flex-1 min-h-0">
            <TabsList className="mx-6 mb-2 shrink-0 w-[calc(100%-3rem)]">
              <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
              <TabsTrigger value="schedules" className="flex-1">Schedules</TabsTrigger>
            </TabsList>

            {/* ── General Tab ── */}
            <TabsContent value="general" className="flex flex-col flex-1 min-h-0 mt-0">
              <div className="flex flex-col gap-5 px-6 flex-1 overflow-y-auto pb-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session title" />
                  <p className="text-[11px] text-muted-foreground">Custom title for this session.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Session Type</Label>
                  <Select value={sessionType} onValueChange={(v) => setSessionType(v as SessionType)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="role">Role - Long-lived agent session</SelectItem>
                      <SelectItem value="scope">Scope - Project-scoped session</SelectItem>
                      <SelectItem value="worker">Worker - Short-lived job</SelectItem>
                      <SelectItem value="scratchpad">Scratchpad - Temporary throwaway</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Determines retention behavior and lifecycle.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Default agent</Label>
                  <Select value={agentID} onValueChange={setAgentID}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="No agent" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No agent</SelectItem>
                      {visibleAgents.map((agent) => (
                        <SelectItem key={(agent as any)._id || agent.name} value={(agent as any)._id || agent.name}>
                          <span className="capitalize">{agent.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">The agent that handles messages in this session.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Model Override</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g., anthropic/claude-3-5-sonnet-20241022" />
                  <p className="text-[11px] text-muted-foreground">Override the default model for this session.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>System Prompt</Label>
                  <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Additional instructions prepended to agent prompts..." rows={3} />
                  <p className="text-[11px] text-muted-foreground">Boundary prompt prepended to all agent system prompts.</p>
                </div>

                {/* ── Path Boundaries ── */}
                <div className="flex flex-col gap-3">
                  <Label>Path Boundaries</Label>
                  <p className="text-[11px] text-muted-foreground -mt-2">
                    Leave empty to inherit from parent session or agent. Child sessions inherit these values automatically.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] font-medium">Write Path</p>
                    <Input
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      placeholder="Inherited from parent / agent"
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Hard write boundary — writes outside this path are blocked. Cannot be broader than parent.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] font-medium">Read Path</p>
                    <Input
                      value={readPath}
                      onChange={(e) => setReadPath(e.target.value)}
                      placeholder="Inherited from parent / agent"
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Soft read boundary — reads outside this path require user approval.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Label>Retention Policy</Label>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium">Auto-archive</p>
                      <p className="text-[11px] text-muted-foreground">Archive automatically when done</p>
                    </div>
                    <Switch checked={autoArchive} onCheckedChange={setAutoArchive} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium">Auto-delete</p>
                      <p className="text-[11px] text-muted-foreground">Delete instead of archive</p>
                    </div>
                    <Switch checked={autoDelete} onCheckedChange={setAutoDelete} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="maxMessages" className="text-sm">Max Messages</Label>
                    <Input id="maxMessages" type="number" value={maxMessages} onChange={(e) => setMaxMessages(e.target.value)} placeholder="e.g., 500" />
                    <p className="text-[11px] text-muted-foreground">Cap on messages; oldest evicted when exceeded</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ttlHours" className="text-sm">TTL (hours)</Label>
                    <Input id="ttlHours" type="number" step="0.1" value={ttlHours} onChange={(e) => setTtlHours(e.target.value)} placeholder="e.g., 6" />
                    <p className="text-[11px] text-muted-foreground">Auto-close after this duration of inactivity</p>
                  </div>
                </div>

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
                      <Button size="sm" variant="outline" onClick={handlePromoteToMain} disabled={saving} className="shrink-0 ml-3">
                        {saving ? <Loader2Icon className="size-3 animate-spin" /> : "Set as main"}
                      </Button>
                    )}
                  </div>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <SheetFooter className="px-6 py-4 border-t flex-col sm:flex-row gap-2 shrink-0">
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} disabled={saving || deleting} className="sm:mr-auto">
                  <Trash2Icon className="mr-1.5 size-3.5" />
                  Delete Session
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving || deleting}>
                    {saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              </SheetFooter>
            </TabsContent>

            {/* ── Schedules Tab ── */}
            <TabsContent value="schedules" className="flex flex-col flex-1 min-h-0 mt-0">
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-6 pb-3 shrink-0">
                  <Button size="sm" className="w-full" onClick={() => { setEditingSchedule(undefined); setScheduleDialogOpen(true) }}>
                    <PlusIcon className="mr-1.5 size-3.5" />
                    Add Schedule
                  </Button>
                </div>

                <div className="flex flex-col gap-3 px-6 flex-1 overflow-y-auto pb-4">
                  {schedules.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No schedules yet. Add one to send timed messages to this session.
                    </p>
                  )}
                  {schedules.map((schedule) => (
                    <Card
                      key={schedule.id}
                      className="flex flex-col cursor-pointer"
                      onDoubleClick={() => { setEditingSchedule(schedule); setScheduleDialogOpen(true) }}
                    >
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="flex flex-col gap-1">
                          <CardTitle className="text-sm flex items-center gap-1.5">
                            <CalendarClockIcon className="size-3.5 text-muted-foreground" />
                            {schedule.cron_expression}
                          </CardTitle>
                          {schedule.agent_id && (
                            <CardDescription className="text-xs">@{schedule.agent_id}</CardDescription>
                          )}
                        </div>
                        <Switch checked={schedule.is_active} onCheckedChange={(v) => toggleSchedule(schedule.id, v)} />
                      </CardHeader>
                      <CardContent className="pb-2">
                        <div className="text-xs bg-muted/50 p-2 rounded-md line-clamp-2">
                          {schedule.prompt}
                        </div>
                      </CardContent>
                      <CardFooter className="flex items-center justify-between border-t pt-2">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <BellRingIcon className={`size-3 ${schedule.is_active ? "text-emerald-500" : ""}`} />
                          {schedule.is_active ? "Active" : "Paused"}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => runScheduleNow(schedule.id)} title="Run now">
                            <PlayIcon className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => deleteSchedule(schedule.id)}>
                            <TrashIcon className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <ScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={(v) => { setScheduleDialogOpen(v); if (!v) setEditingSchedule(undefined) }}
        sessionId={session?.id}
        agentId={session?.agentID ?? undefined}
        schedule={editingSchedule}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the session "{session?.title || "Untitled"}" and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
