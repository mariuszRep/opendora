"use client"

import { useEffect, useState } from "react"
import { Loader2Icon, Trash2Icon, FolderOpenIcon, ComponentIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import type { Session, SessionType, RetentionPolicy } from "@/lib/projectflows"
import { opendora } from "@/lib/projectflows"
import { useModelList } from "@/hooks/use-model-list"
import { FolderPickerDialog } from "./folder-picker-dialog"

interface SessionGeneralPanelProps {
  session: Session | null
  onOpenChange: (open: boolean) => void
}

export function SessionGeneralPanel({ session, onOpenChange }: SessionGeneralPanelProps) {
  const { agents, setAgentMainSession, modelGroups, fallbackActiveSlots, providerTimeouts } = useOpendoraContext()
  const { modelList, modelsByProvider } = useModelList()

  const [title, setTitle] = useState("")
  const [agentID, setAgentID] = useState("")
  const [sessionType, setSessionType] = useState<SessionType>("scope")
  const [model, setModel] = useState("")
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)
  const [selectedModelID, setSelectedModelID] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [systemPrompt, setSystemPrompt] = useState("")
  const [autoArchive, setAutoArchive] = useState(false)
  const [autoDelete, setAutoDelete] = useState(false)
  const [maxMessages, setMaxMessages] = useState("")
  const [ttlHours, setTtlHours] = useState("")
  const [path, setPath] = useState("")
  const [readPath, setReadPath] = useState("")
  const [cwd, setCwd] = useState("")
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visibleAgents = agents.filter((a) => !a.hidden)

  useEffect(() => {
    if (session) {
      setTitle(session.title ?? "")
      setAgentID(session.agentID ?? "__none__")
      setSessionType(session.sessionType ?? "scope")
      setModel(session.model ?? "")
      // Parse model into selector state
      if (session.model) {
        const parts = session.model.split(":")
        if (parts.length === 2) {
          if (parts[0] === "fallback") {
            setSelectedGroupId(parts[1])
            setSelectedProviderID(null)
            setSelectedModelID(null)
          } else {
            setSelectedGroupId(null)
            setSelectedProviderID(parts[0])
            setSelectedModelID(parts[1])
          }
        }
      } else {
        setSelectedGroupId(null)
        setSelectedProviderID(null)
        setSelectedModelID(null)
      }
      setSystemPrompt(session.systemPrompt ?? "")
      setPath(session.path ?? "")
      setReadPath(session.readPath ?? "")
      setCwd(session.cwd ?? "")
      setAutoArchive(session.retention?.autoArchive ?? false)
      setAutoDelete(session.retention?.autoDelete ?? false)
      setMaxMessages(session.retention?.maxMessages?.toString() ?? "")
      setTtlHours(session.retention?.ttlMs ? (session.retention.ttlMs / (1000 * 60 * 60)).toString() : "")
    }
    setError(null)
  }, [session])

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
        cwd: cwd !== (session.cwd ?? "") ? (cwd.trim() || null) : undefined,
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

  const currentAgentID = agentID === "__none__" ? null : agentID
  const isAlreadyMain = session?.sessionType === "role"

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 pb-4">
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
          <ModelSelector open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
            <ModelSelectorTrigger className="w-full justify-between">
              {(() => {
                if (selectedGroupId) {
                  const group = modelGroups.find((g) => g.id === selectedGroupId)
                  return group?.name || "Unknown group"
                }
                if (selectedProviderID && selectedModelID) {
                  const m = modelsByProvider.get(selectedProviderID)?.find((m) => m.modelID === selectedModelID)
                  return m?.modelName || `${selectedProviderID}/${selectedModelID}`
                }
                const agent = agents.find((a) => (a as any)._id === agentID || a.id === agentID)
                if (agent?.model) {
                  if (agent.model.providerID === "fallback") {
                    const group = modelGroups.find((g) => g.id === agent.model?.modelID)
                    return `Default (${group?.name || agent.model.modelID})`
                  }
                  const m = modelsByProvider.get(agent.model.providerID)?.find((m) => m.modelID === agent.model?.modelID)
                  return `Default (${m?.modelName || `${agent.model.providerID}/${agent.model.modelID}`})`
                }
                return "Default (system)"
              })()}
            </ModelSelectorTrigger>
            <ModelSelectorContent>
              <ModelSelectorInput placeholder="Search models..." />
              <ModelSelectorList>
                <ModelSelectorEmpty>No models found</ModelSelectorEmpty>
                {/* Fallback Groups */}
                {modelGroups.map((g) => {
                  const active = selectedGroupId === g.id
                  return (
                    <ModelSelectorItem
                      key={`group:${g.id}`}
                      value={`group:${g.name} ${g.id}`}
                      onSelect={() => {
                        setSelectedGroupId(g.id)
                        setSelectedProviderID(null)
                        setSelectedModelID(null)
                        setModel(`fallback:${g.id}`)
                        setModelSelectorOpen(false)
                      }}
                    >
                      <ComponentIcon className="size-3 shrink-0" />
                      <ModelSelectorName>{g.name}</ModelSelectorName>
                    </ModelSelectorItem>
                  )
                })}
                {/* Provider Models */}
                {Array.from(modelsByProvider.entries()).map(([providerID, models]) => (
                  <ModelSelectorGroup key={providerID} heading={providerID}>
                    {models.map((m) => (
                      <ModelSelectorItem
                        key={`${m.providerID}:${m.modelID}`}
                        onSelect={() => {
                          setSelectedProviderID(m.providerID)
                          setSelectedModelID(m.modelID)
                          setSelectedGroupId(null)
                          setModel(`${m.providerID}:${m.modelID}`)
                          setModelSelectorOpen(false)
                        }}
                        value={`${m.providerID}:${m.modelID}`}
                      >
                        <ModelSelectorLogo provider={m.providerID} />
                        <ModelSelectorName>{m.modelName}</ModelSelectorName>
                      </ModelSelectorItem>
                    ))}
                  </ModelSelectorGroup>
                ))}
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Override the default model for this session.
            </p>
            {model && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto py-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setModel("")
                  setSelectedGroupId(null)
                  setSelectedProviderID(null)
                  setSelectedModelID(null)
                }}
              >
                Clear override
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>System Prompt</Label>
          <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Additional instructions prepended to agent prompts..." rows={3} />
          <p className="text-[11px] text-muted-foreground">Boundary prompt prepended to all agent system prompts.</p>
        </div>

        {/* ── Working Directory ── */}
        <div className="flex flex-col gap-1.5">
          <Label>Working Directory</Label>
          <div className="flex gap-2">
            <Input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="Default (project root)"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setFolderPickerOpen(true)}
              title="Browse"
            >
              <FolderOpenIcon className="size-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Working directory for tool execution. Leave empty to use the project root.
          </p>
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

      <div className="flex shrink-0 flex-col gap-2 border-t bg-muted/50 px-4 py-3 sm:flex-row">
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
      </div>

      <FolderPickerDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        initialPath={cwd || session?.directory || "/"}
        onSelect={(selected) => setCwd(selected)}
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
    </div>
  )
}
