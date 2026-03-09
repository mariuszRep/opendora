"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, Loader2Icon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { opendora, type AgentConfig } from "@/lib/opendora"

const MODE_OPTIONS: { value: AgentConfig["mode"]; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "subagent", label: "Sub-agent" },
  { value: "all", label: "All" },
]

const HIDDEN_TOOLS = new Set(["invalid", "plan_exit", "skill"])

type ModelValue = { providerID: string; modelID: string } | undefined

export default function AgentSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { updateAgent, getAgentPersona, generateAgent, providers, connectedProviders, agents, refreshProviders } =
    useOpendoraContext()

  const agent = agents.find((a) => a.name === id) as any

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<AgentConfig["mode"]>("all")
  const [color, setColor] = useState("")
  const [hidden, setHidden] = useState(false)
  const [temperature, setTemperature] = useState("")
  const [steps, setSteps] = useState("")
  const [model, setModel] = useState<ModelValue>(undefined)
  const [fallbackModel, setFallbackModel] = useState<ModelValue>(undefined)
  const [modelOpen, setModelOpen] = useState(false)
  const [fallbackModelOpen, setFallbackModelOpen] = useState(false)
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [availableTools, setAvailableTools] = useState<string[]>([])
  const [toolsExpanded, setToolsExpanded] = useState(true)
  const [persona, setPersona] = useState("")
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const modelList = useMemo(
    () =>
      providers
        .filter((p) => connectedProviders.includes(p.id))
        .flatMap((p) =>
          Object.values(p.models).map((m) => ({
            providerID: p.id,
            providerName: p.name,
            modelID: m.id,
            modelName: (m as { name?: string }).name ?? m.id,
          })),
        ),
    [providers, connectedProviders],
  )

  const modelsByProvider = useMemo(() => {
    const groups = new Map<string, typeof modelList>()
    for (const m of modelList) {
      if (!groups.has(m.providerName)) groups.set(m.providerName, [])
      groups.get(m.providerName)!.push(m)
    }
    return groups
  }, [modelList])

  // Load available tools
  useEffect(() => {
    opendora.agent.tools().then((ids) => {
      setAvailableTools(ids.filter((t) => !HIDDEN_TOOLS.has(t)))
    }).catch(() => {})
  }, [])

  // Load agent data — re-run when agent loads (agents list may arrive after mount)
  useEffect(() => {
    if (!id || !agent) return
    setName(agent.name)
    setDescription(agent.description ?? "")
    setMode(agent.mode ?? "all")
    setColor(agent.color ?? "")
    setHidden(agent.hidden ?? false)
    setTemperature(agent.temperature != null ? String(agent.temperature) : "")
    setSteps(agent.steps != null ? String(agent.steps) : "")
    setModel(agent.model ?? undefined)
    setFallbackModel(agent.fallback_model ?? undefined)
    setSelectedTools(agent.tools ?? [])
  }, [id, agent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load persona separately (network call, only on id change)
  useEffect(() => {
    if (!id) return
    getAgentPersona(id).then(setPersona).catch(() => {})
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTool(toolId: string) {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId],
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
        model,
        fallback_model: fallbackModel,
        tools: selectedTools,
      }
      await updateAgent(id, config, persona)
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function renderModelSelector(
    label: string,
    value: ModelValue,
    open: boolean,
    onOpenChange: (v: boolean) => void,
    onChange: (v: ModelValue) => void,
    noneLabel: string,
  ) {
    const selected = value
      ? modelList.find((m) => m.providerID === value.providerID && m.modelID === value.modelID)
      : undefined

    return (
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <ModelSelector
          open={open}
          onOpenChange={(nextOpen) => {
            onOpenChange(nextOpen)
            if (nextOpen) {
              refreshProviders().catch(() => {})
            }
          }}
        >
          <ModelSelectorTrigger asChild>
            <Button variant="outline" className="w-full justify-start font-normal">
              {selected ? (
                <>
                  <ModelSelectorLogo provider={selected.providerID} />
                  <ModelSelectorName>{selected.modelName}</ModelSelectorName>
                </>
              ) : (
                <span className="text-muted-foreground">{noneLabel}</span>
              )}
            </Button>
          </ModelSelectorTrigger>
          <ModelSelectorContent>
            <ModelSelectorInput placeholder="Search models…" />
            <ModelSelectorList>
              <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
              <ModelSelectorGroup heading="">
                <ModelSelectorItem
                  value="__none__"
                  onSelect={() => { onChange(undefined); onOpenChange(false) }}
                >
                  <span className="text-muted-foreground">{noneLabel}</span>
                  {!value && <CheckIcon className="ml-auto size-4" />}
                </ModelSelectorItem>
              </ModelSelectorGroup>
              {[...modelsByProvider.entries()].map(([providerName, models]) => (
                <ModelSelectorGroup heading={providerName} key={providerName}>
                  {models.map((m) => {
                    const active = value?.providerID === m.providerID && value?.modelID === m.modelID
                    return (
                      <ModelSelectorItem
                        key={`${m.providerID}:${m.modelID}`}
                        value={`${m.providerID}:${m.modelID}`}
                        onSelect={() => {
                          onChange({ providerID: m.providerID, modelID: m.modelID })
                          onOpenChange(false)
                        }}
                      >
                        <ModelSelectorLogo provider={m.providerID} />
                        <ModelSelectorName>{m.modelName}</ModelSelectorName>
                        {active ? <CheckIcon className="ml-auto size-4" /> : <div className="ml-auto size-4" />}
                      </ModelSelectorItem>
                    )
                  })}
                </ModelSelectorGroup>
              ))}
            </ModelSelectorList>
          </ModelSelectorContent>
        </ModelSelector>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb header */}
      <div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                href="/dashboard"
                className="cursor-pointer"
                onClick={(e) => { e.preventDefault(); router.back() }}
              >
                Agents
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="capitalize">{id}</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8 flex flex-col gap-6">

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
                {generating ? <Loader2Icon className="size-3 animate-spin" /> : <SparklesIcon className="size-3" />}
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
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Mode</Label>
              <Select value={mode ?? "all"} onValueChange={(v) => setMode(v as AgentConfig["mode"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value!}>{o.label}</SelectItem>
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
          <div className="grid grid-cols-2 gap-4">
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

          {/* Model + Fallback */}
          <div className="grid grid-cols-2 gap-4">
            {renderModelSelector("Preferred model", model, modelOpen, setModelOpen, setModel, "Use default")}
            {renderModelSelector("Fallback model", fallbackModel, fallbackModelOpen, setFallbackModelOpen, setFallbackModel, "None")}
          </div>

          {/* Hidden toggle */}
          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Hidden</p>
              <p className="text-xs text-muted-foreground">Hide this agent from the sidebar</p>
            </div>
            <Switch checked={hidden} onCheckedChange={setHidden} />
          </div>

          {/* Tools */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-medium text-left"
              onClick={() => setToolsExpanded((v) => !v)}
            >
              {toolsExpanded
                ? <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                : <ChevronRightIcon className="size-3.5 text-muted-foreground" />}
              Tools
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                {selectedTools.length === availableTools.length ? "all" : selectedTools.length} selected
              </span>
            </button>

            {toolsExpanded && (
              <div className="rounded-md border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    No tools selected = agent has no tools.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => setSelectedTools([])}
                    >
                      None
                    </button>
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => setSelectedTools([...availableTools])}
                    >
                      Select all
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
                  {availableTools.map((toolId) => (
                    <label key={toolId} className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={selectedTools.includes(toolId)}
                        onCheckedChange={() => toggleTool(toolId)}
                      />
                      <span className="font-mono">{toolId}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
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
              className="h-72 resize-none overflow-y-auto font-mono text-xs"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}
