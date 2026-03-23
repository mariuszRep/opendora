"use client"

import { useEffect, useState } from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { XIcon } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { opendora, type Agent, type AgentConfig, type Provider } from "@/lib/opendora"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent?: Agent & { id?: string; _id?: string }
  onSaved?: () => void
}

const MODE_OPTIONS: { value: AgentConfig["mode"]; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "worker", label: "Worker" },
  { value: "system", label: "System" },
  { value: "subagent", label: "Sub-agent (Legacy)" },
  { value: "all", label: "All" },
]

const HIDDEN_TOOLS = new Set(["invalid", "plan_exit"])
const DELEGATION_TOOLS = new Set(["delegate", "session_search", "session_get", "reply"])
const FILESYSTEM_TOOL_IDS = new Set([
  "read", "write", "edit", "glob", "grep", "list",
  "apply_patch", "multiedit", "codesearch",
])

const NONE = "__none__"

function buildModelOptions(providers: Provider[], connected: string[]) {
  return connected.flatMap((pid) => {
    const provider = providers.find((p) => p.id === pid)
    if (!provider) return []
    return Object.entries(provider.models).map(([modelID, m]) => ({
      value: `${pid}::${modelID}`,
      label: `${pid} / ${(m as any).name ?? modelID}`,
      providerID: pid,
      modelID,
    }))
  })
}

function modelToValue(m?: { providerID: string; modelID: string }) {
  return m ? `${m.providerID}::${m.modelID}` : NONE
}

function valueToModel(v: string) {
  if (v === NONE) return undefined
  const [providerID, modelID] = v.split("::")
  return { providerID, modelID }
}

export function AgentUpsertDialog({ open, onOpenChange, agent, onSaved }: Props) {
  const { createAgent, updateAgent, getAgentPersona, generateAgent, providers, connectedProviders, refreshProviders, allAgents } =
    useOpendoraContext()

  const isEdit = !!agent
  const agentId = agent?._id || agent?.id || agent?.name

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<AgentConfig["mode"]>("all")
  const [color, setColor] = useState("")
  const [hidden, setHidden] = useState(false)
  const [temperature, setTemperature] = useState("")
  const [steps, setSteps] = useState("")
  const [model, setModel] = useState<string>(NONE)
  const [fallbackModel, setFallbackModel] = useState<string>(NONE)
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [availableTools, setAvailableTools] = useState<string[]>([])
  const [expandedGroup, setExpandedGroup] = useState<"delegation" | "filesystem" | "others" | null>(null)
  const [delegateAllowedAgents, setDelegateAllowedAgents] = useState<string[]>([])
  const [fsAllowedPaths, setFsAllowedPaths] = useState<string[]>([])
  const [newPathInput, setNewPathInput] = useState("")
  const [persona, setPersona] = useState("")
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const modelOptions = buildModelOptions(providers, connectedProviders)

  // Load available tools once
  useEffect(() => {
    opendora.agent.tools().then((ids) => {
      setAvailableTools(ids.filter((id) => !HIDDEN_TOOLS.has(id)))
    }).catch(() => {})
  }, [])

  // Pre-fill on open
  useEffect(() => {
    if (!open) return
    if (isEdit && agent) {
      const a = agent as any
      setName(agent.name)
      setDescription(agent.description ?? "")
      setMode(agent.mode ?? "all")
      setColor(a.color ?? "")
      setHidden(a.hidden ?? false)
      setTemperature(a.temperature != null ? String(a.temperature) : "")
      setSteps(a.steps != null ? String(a.steps) : "")
      setModel(modelToValue(a.model))
      setFallbackModel(modelToValue(a.fallback_model))
      setSelectedTools(a.tools ?? [])
      setDelegateAllowedAgents((a as any).config?.toolConfig?.delegate?.allowedAgents ?? a.toolConfig?.delegate?.allowedAgents ?? [])
      setPersona("")
      setFsAllowedPaths((a as any).config?.filesystemConfig?.allowedPaths ?? (a as any).filesystemConfig?.allowedPaths ?? [])
      setError(null)
      if (agentId) getAgentPersona(agentId).then(setPersona).catch(() => {})
    } else {
      setName("")
      setDescription("")
      setMode("all")
      setColor("")
      setHidden(false)
      setTemperature("")
      setSteps("")
      setModel(NONE)
      setFallbackModel(NONE)
      setSelectedTools([])
      setDelegateAllowedAgents([])
      setPersona("")
      setFsAllowedPaths([])
      setNewPathInput("")
      setError(null)
    }
  }, [open, isEdit, agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDelegateAgent(name: string) {
    setDelegateAllowedAgents((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    )
  }

  function toggleTool(id: string) {
    setSelectedTools((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  async function handleGenerate() {
    if (!description.trim()) return
    setGenerating(true)
    setError(null)
    try {
      const result = await generateAgent(description)
      setName((prev) => prev || result.identifier)
      setDescription(result.whenToUse)
      setPersona(result.systemPrompt)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const temp = parseFloat(temperature)
      const stepsNum = parseInt(steps, 10)
      const config: AgentConfig = {
        name: name.trim(),
        description: description.trim() || undefined,
        mode,
        color: color.trim() || undefined,
        hidden: hidden || undefined,
        temperature: !isNaN(temp) ? temp : undefined,
        steps: !isNaN(stepsNum) && stepsNum > 0 ? stepsNum : undefined,
        model: valueToModel(model),
        fallback_model: valueToModel(fallbackModel),
        tools: selectedTools.length > 0 ? selectedTools : undefined,
        toolConfig: delegateAllowedAgents.length > 0
          ? { delegate: { allowedAgents: delegateAllowedAgents } }
          : undefined,
        filesystemConfig: (() => {
          const fsSelectedTools = selectedTools.filter((id) => FILESYSTEM_TOOL_IDS.has(id))
          if (fsSelectedTools.length === 0 && fsAllowedPaths.length === 0) return undefined
          return {
            enabledTools: fsSelectedTools.length > 0 ? fsSelectedTools : undefined,
            allowedPaths: fsAllowedPaths.length > 0 ? fsAllowedPaths : undefined,
          }
        })(),
      }
      if (isEdit && agentId) {
        await updateAgent(agentId, config, persona)
      } else {
        await createAgent(config, persona)
      }
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit agent" : "New agent"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="main" className="flex flex-1 flex-col overflow-hidden">
          <TabsList variant="line" className="shrink-0 px-0">
            <TabsTrigger value="main">Main</TabsTrigger>
            <TabsTrigger value="tools">
              Tools
              {selectedTools.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                  {selectedTools.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Main tab ── */}
          <TabsContent value="main" className="flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-4 pb-2 pt-3">

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  placeholder="my-agent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="agent-desc">Description</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 px-2 text-xs"
                    disabled={!description.trim() || generating}
                    onClick={handleGenerate}
                  >
                    {generating ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <SparklesIcon className="size-3" />
                    )}
                    AI fill
                  </Button>
                </div>
                <Textarea
                  id="agent-desc"
                  placeholder="When to use this agent…"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Mode + Color */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Mode</Label>
                  <Select value={mode ?? "all"} onValueChange={(v) => setMode(v as AgentConfig["mode"])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value!}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="agent-color">Color</Label>
                  <Input
                    id="agent-color"
                    placeholder="#7c3aed"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </div>
              </div>

              {/* Temperature + Steps */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="agent-temp">Temperature</Label>
                  <Input
                    id="agent-temp"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    placeholder="default"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="agent-steps">Max steps</Label>
                  <Input
                    id="agent-steps"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="default"
                    value={steps}
                    onChange={(e) => setSteps(e.target.value)}
                  />
                </div>
              </div>

              {/* Model */}
              <div className="flex flex-col gap-1.5">
                <Label>Preferred model</Label>
                <Select
                  value={model}
                  onValueChange={setModel}
                  onOpenChange={(open) => {
                    if (open) refreshProviders().catch(() => {})
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Use default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Use default</SelectItem>
                    {modelOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fallback model */}
              <div className="flex flex-col gap-1.5">
                <Label>Fallback model</Label>
                <Select
                  value={fallbackModel}
                  onValueChange={setFallbackModel}
                  onOpenChange={(open) => {
                    if (open) refreshProviders().catch(() => {})
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {modelOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hidden toggle */}
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Hidden</p>
                  <p className="text-xs text-muted-foreground">Hide this agent from the sidebar</p>
                </div>
                <Switch checked={hidden} onCheckedChange={setHidden} />
              </div>

              {/* Persona */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="agent-persona">
                  Persona
                  <span className="ml-1 font-normal text-muted-foreground">(PERSONA.md)</span>
                </Label>
                <Textarea
                  id="agent-persona"
                  placeholder="You are a…"
                  className="h-48 resize-none overflow-y-auto font-mono text-xs"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </TabsContent>

          {/* ── Tools tab ── */}
          <TabsContent value="tools" className="flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-3 pb-2 pt-3">
              <p className="text-xs text-muted-foreground">
                Leave all unchecked to allow all tools. Select specific tools to restrict this agent.
              </p>

              {(["delegation", "filesystem", "others"] as const).map((group) => {
                const groupTools = availableTools.filter((id) =>
                  group === "delegation"
                    ? DELEGATION_TOOLS.has(id)
                    : group === "filesystem"
                      ? FILESYSTEM_TOOL_IDS.has(id)
                      : !DELEGATION_TOOLS.has(id) && !FILESYSTEM_TOOL_IDS.has(id),
                )
                const selectedCount = groupTools.filter((id) => selectedTools.includes(id)).length
                const isExpanded = expandedGroup === group

                return (
                  <Card key={group} size="sm" className="cursor-pointer">
                    <CardHeader
                      className="flex-row items-center justify-between"
                      onClick={() => setExpandedGroup(isExpanded ? null : group)}
                    >
                      <div>
                        <CardTitle className="capitalize">{group}</CardTitle>
                        <CardDescription>{groupTools.length} tools</CardDescription>
                      </div>
                      {selectedCount > 0 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          {selectedCount} selected
                        </span>
                      )}
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="border-t pt-2">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          {groupTools.map((id) => (
                            <Label key={id} className="flex cursor-pointer items-center gap-2 font-normal">
                              <Checkbox
                                checked={selectedTools.includes(id)}
                                onCheckedChange={() => toggleTool(id)}
                              />
                              <span className="font-mono text-xs">{id}</span>
                            </Label>
                          ))}
                        </div>
                        {selectedCount > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-auto px-0 text-xs text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedTools((prev) => prev.filter((id) => !groupTools.includes(id)))
                            }}
                          >
                            Clear group
                          </Button>
                        )}

                        {group === "filesystem" && isExpanded && (
                          <div className="mt-3 border-t pt-3">
                            <p className="mb-0.5 text-xs font-medium">Allowed paths</p>
                            <p className="mb-2 text-xs text-muted-foreground">
                              Leave empty to allow all paths. Add absolute paths to restrict this agent.
                            </p>
                            {fsAllowedPaths.map((p) => (
                              <div key={p} className="mb-1 flex items-center gap-2">
                                <span className="flex-1 truncate font-mono text-xs">{p}</span>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setFsAllowedPaths((prev) => prev.filter((x) => x !== p))
                                  }}
                                >
                                  <XIcon className="size-3" />
                                </Button>
                              </div>
                            ))}
                            <div className="mt-2 flex gap-2">
                              <Input
                                placeholder="/absolute/path"
                                value={newPathInput}
                                onChange={(e) => setNewPathInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault()
                                    const p = newPathInput.trim()
                                    if (p && !fsAllowedPaths.includes(p)) {
                                      setFsAllowedPaths((prev) => [...prev, p])
                                      setNewPathInput("")
                                    }
                                  }
                                }}
                                className="h-7 text-xs"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const p = newPathInput.trim()
                                  if (p && !fsAllowedPaths.includes(p)) {
                                    setFsAllowedPaths((prev) => [...prev, p])
                                    setNewPathInput("")
                                  }
                                }}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        )}

                        {group === "delegation" && selectedTools.includes("delegate") && (
                          <div className="mt-3 border-t pt-3">
                            <p className="mb-0.5 text-xs font-medium">Allowed agents for delegate</p>
                            <p className="mb-2 text-xs text-muted-foreground">
                              Leave empty to allow all agents.
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                              {allAgents
                                .filter((a) => a.name !== name.trim())
                                .map((a) => (
                                  <Label key={(a as any)._id || a.name} className="flex cursor-pointer items-center gap-2 font-normal">
                                    <Checkbox
                                      checked={delegateAllowedAgents.includes(a.name)}
                                      onCheckedChange={() => toggleDelegateAgent(a.name)}
                                    />
                                    <span className="font-mono text-xs">{a.name}</span>
                                  </Label>
                                ))}
                            </div>
                            {delegateAllowedAgents.length > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mt-1 h-auto px-0 text-xs text-muted-foreground"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDelegateAllowedAgents([])
                                }}
                              >
                                Clear allowed agents
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
            {isEdit ? "Save changes" : "Create agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
