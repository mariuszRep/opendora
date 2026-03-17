"use client"

import { useEffect, useState } from "react"
import { ChevronDownIcon, ChevronRightIcon, Loader2Icon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  const { createAgent, updateAgent, getAgentPersona, generateAgent, providers, connectedProviders, refreshProviders } =
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
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const [persona, setPersona] = useState("")
  const [defaultPath, setDefaultPath] = useState("")
  const [enableDefaultPath, setEnableDefaultPath] = useState(false)
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
      setPersona("")
      setDefaultPath(a.defaultPath ?? "")
      setEnableDefaultPath(!!a.defaultPath)
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
      setPersona("")
      setDefaultPath("")
      setEnableDefaultPath(false)
      setError(null)
    }
  }, [open, isEdit, agentId]) // eslint-disable-line react-hooks/exhaustive-deps

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
        defaultPath: enableDefaultPath && defaultPath.trim() ? defaultPath.trim() : undefined,
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

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-4 pb-2">

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
                  if (open) {
                    refreshProviders().catch(() => {})
                  }
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
                  if (open) {
                    refreshProviders().catch(() => {})
                  }
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

            {/* Default Path */}
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Default Path</p>
                  <p className="text-xs text-muted-foreground">Set a default directory for this agent</p>
                </div>
                <Switch checked={enableDefaultPath} onCheckedChange={setEnableDefaultPath} />
              </div>
              {enableDefaultPath && (
                <Input
                  placeholder="/path/to/directory"
                  value={defaultPath}
                  onChange={(e) => setDefaultPath(e.target.value)}
                  className="mt-1"
                />
              )}
            </div>

            {/* Tools — expandable */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-medium text-left"
                onClick={() => setToolsExpanded((v) => !v)}
              >
                {toolsExpanded ? (
                  <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                )}
                Tools
                {selectedTools.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                    {selectedTools.length} selected
                  </span>
                )}
              </button>

              {toolsExpanded && (
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Leave all unchecked to allow all tools. Select specific tools to restrict this agent.
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {availableTools.map((id) => (
                      <label key={id} className="flex cursor-pointer items-center gap-2 text-xs">
                        <Checkbox
                          checked={selectedTools.includes(id)}
                          onCheckedChange={() => toggleTool(id)}
                        />
                        <span className="font-mono">{id}</span>
                      </label>
                    ))}
                  </div>
                  {selectedTools.length > 0 && (
                    <button
                      type="button"
                      className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => setSelectedTools([])}
                    >
                      Clear selection
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Skills Configuration - TEMPORARILY COMMENTED OUT */}
            {/* <div className="flex flex-col gap-1.5 border-2 border-red-500 bg-red-50 p-2">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80"
                onClick={() => setSkillsExpanded(!skillsExpanded)}
              >
                <ChevronRightIcon className={`size-4 transition-transform ${skillsExpanded ? "rotate-90" : ""}`} />
                Skills Configuration
                {(canDiscoverSkills || canLoadSkills) && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                    {[canDiscoverSkills && "discover", canLoadSkills && "load"].filter(Boolean).join(" + ")}
                  </span>
                )}
              </button>

              {skillsExpanded && (
                <div className="rounded-md border p-3">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Configure how this agent can interact with skills. Note: The agent must also have the "skill" tool selected above to use skills.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can-discover-skills" className="text-sm cursor-pointer">
                        Can discover skills
                        <span className="ml-1 font-normal text-muted-foreground">(see available skills)</span>
                      </Label>
                      <Switch
                        id="can-discover-skills"
                        checked={canDiscoverSkills}
                        onCheckedChange={setCanDiscoverSkills}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="can-load-skills" className="text-sm cursor-pointer">
                        Can load skills
                        <span className="ml-1 font-normal text-muted-foreground">(use skill content)</span>
                      </Label>
                      <Switch
                        id="can-load-skills"
                        checked={canLoadSkills}
                        onCheckedChange={setCanLoadSkills}
                      />
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    <div className="mb-1">💡 <strong>Recommended combinations:</strong></div>
                    <ul className="ml-4 space-y-1">
                      <li>• <strong>Both off:</strong> Agent cannot use skills (default for most agents)</li>
                      <li>• <strong>Discover only:</strong> Agent can see skills but not load them</li>
                      <li>• <strong>Both on:</strong> Full skill access (recommended for workflow agents)</li>
                    </ul>
                  </div>
                </div>
              )}
            </div> */}

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
        </div>

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
