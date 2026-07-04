"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CheckIcon, ClockAlertIcon, ComponentIcon, ExternalLinkIcon, KeyIcon, Loader2Icon, MessageSquareIcon, SearchIcon, SparklesIcon, StarIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AgentDeleteDialog } from "@/components/agents/agent-delete-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ColorSelector } from "@/components/ui/color-selector"
import type { AgentColorId } from "@/lib/agent-colors"
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
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import { opendora, type AgentConfig, type Skill, type Workflow } from "@/lib/projectflows"
import { SettingsCard } from "@/components/settings/settings-card"
import { useToolSchemas } from "@/hooks/use-tool-schemas"
import {
  HIDDEN_TOOLS,
  groupToolsBySource,
  sortSourceGroups,
  sourceGroupLabel,
} from "@/lib/tool-groups"

const MODE_OPTIONS: { value: AgentConfig["mode"]; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "worker", label: "Worker" },
  { value: "system", label: "System" },
  { value: "subagent", label: "Sub-agent (Legacy)" },
  { value: "all", label: "All" },
]

type ModelValue = { providerID: string; modelID: string } | undefined

export default function AgentSettingsClient() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { createAgent, updateAgent, getAgentPersona, generateAgent, providers, connectedProviders, modelFilters, allAgents, refreshProviders, modelGroups, refreshModelGroups, providerTimeouts, authExpiredProviders, refreshProviderTimeouts, sessions, setAgentMainSession, selectSession } =
    useOpendoraContext()

  const isNew = id === "new"

  const agent = isNew ? undefined : allAgents.find((a) => (a as any)._id === id || (a as any).id === id || a.name === id) as any

  // Get the actual agent ID (either _id or name match)
  const agentId = useMemo(() => {
    return agent?._id || agent?.name || id
  }, [agent, id])

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<AgentConfig["mode"]>("all")
  const [color, setColor] = useState<AgentColorId>("violet")
  const [hidden, setHidden] = useState(false)
  const [temperature, setTemperature] = useState("")
  const [steps, setSteps] = useState("")
  const [model, setModel] = useState<ModelValue>(undefined)
  const [fallbackModel, setFallbackModel] = useState<ModelValue>(undefined)
  const [modelOpen, setModelOpen] = useState(false)
  const [fallbackModelOpen, setFallbackModelOpen] = useState(false)
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const { schemas: toolSchemas } = useToolSchemas()
  const availableToolSchemas = toolSchemas.filter((t) => !HIDDEN_TOOLS.has(t.id))
  const availableTools = availableToolSchemas.map((t) => t.id)
  const groupedBySource = groupToolsBySource(availableToolSchemas)
  const allSourceGroups = sortSourceGroups([...groupedBySource.keys()])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  // Maps skill name -> agent-scoped permission rule id (source of truth for enabled skills)
  const [skillRuleIds, setSkillRuleIds] = useState<Record<string, string>>({})
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([])
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [skillSearch, setSkillSearch] = useState("")
  const [skillFilter, setSkillFilter] = useState<"all" | "selected" | "deselected">("all")
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([])
  const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>([])
  const [workflowSearch, setWorkflowSearch] = useState("")
  const [workflowFilter, setWorkflowFilter] = useState<"all" | "selected" | "deselected">("all")
  const [delegateAllowedAgents, setDelegateAllowedAgents] = useState<string[]>([])
  const [replyStopAfterReply, setReplyStopAfterReply] = useState(false)
  const [defaultPaths, setDefaultPaths] = useState<string[]>([])
  const [newPathInput, setNewPathInput] = useState("")
  const [persona, setPersona] = useState("")
  const [injectInstructions, setInjectInstructions] = useState(true)
  const [enableInjection, setEnableInjection] = useState(false)
  const [injection, setInjection] = useState("")
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promotingSession, setPromotingSession] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Sessions that belong to this agent
  const agentSessions = sessions.filter((s) => s.agentID === agentId)

  const modelList = useMemo(() => {
    const isFreeModel = (m: { id: string; [k: string]: unknown }) => {
      const cost = (m as any).cost as { input: number; output: number } | undefined
      return !!(cost && cost.input === 0 && cost.output === 0)
    }
    return providers
      .filter((p) => connectedProviders.includes(p.id) && p.id !== "fallback")
      .flatMap((p) => {
        const filter = modelFilters[p.id] ?? "all"
        if (filter === "none") return []
        const models = Object.values(p.models)
        const filtered = filter === "free" ? models.filter(isFreeModel) : models
        return filtered.map((m) => ({
          providerID: p.id,
          providerName: p.name,
          modelID: m.id,
          modelName: (m as { name?: string }).name ?? m.id,
        }))
      })
  }, [providers, connectedProviders, modelFilters])

  const modelsByProvider = useMemo(() => {
    const groups = new Map<string, typeof modelList>()
    for (const m of modelList) {
      if (!groups.has(m.providerName)) groups.set(m.providerName, [])
      groups.get(m.providerName)!.push(m)
    }
    return groups
  }, [modelList])

  // Load skills
  useEffect(() => {
    opendora.skill.list().then(setAvailableSkills).catch(() => { })

    // Re-fetch skills whenever files change on disk
    const unsub = opendora.events.subscribe((event) => {
      if (event.type === "skill.updated") {
        opendora.skill.list().then(setAvailableSkills).catch(() => {})
      }
    })
    return unsub
  }, [])

  // Load workflows
  useEffect(() => {
    opendora.workflow.list().then(setAvailableWorkflows).catch(() => { })
  }, [])

  // Load agent data — re-run when agent loads (agents list may arrive after mount)
  useEffect(() => {
    if (!id || !agent || isNew) return
    setName(agent.name)
    setDescription(agent.description ?? "")
    setMode(agent.mode ?? "all")
    setColor((agent.color ?? "violet") as AgentColorId)
    setHidden(agent.hidden ?? false)
    setTemperature(agent.temperature != null ? String(agent.temperature) : "")
    setSteps(agent.steps != null ? String(agent.steps) : "")
    setModel(agent.model ?? undefined)
    setFallbackModel(agent.fallback_model ?? undefined)
    setSelectedTools(agent.tools ?? [])
    setSelectedSkills(agent.skills ?? (agent as any).config?.skills ?? [])
    setSelectedWorkflows(agent.workflows ?? (agent as any).config?.workflows ?? [])
    setDelegateAllowedAgents((agent as any).config?.toolConfig?.delegate?.allowedAgents ?? agent.toolConfig?.delegate?.allowedAgents ?? [])
    setReplyStopAfterReply((agent as any).config?.toolConfig?.reply?.stopAfterReply ?? agent.toolConfig?.reply?.stopAfterReply ?? false)
    setDefaultPaths((agent as any).config?.defaultPaths ?? (agent as any).defaultPaths ?? [])
    setNewPathInput("")
    setInjectInstructions((agent as any).config?.injectInstructions ?? (agent as any).injectInstructions ?? true)
    setEnableInjection((agent as any).enableInjection ?? false)
    setInjection((agent as any).injection ?? "")
  }, [agentId, agent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load enabled skills from agent-scoped `skill` permission rules (source of truth).
  // Keeps the toggle in sync when rules change elsewhere (e.g. permissions sheet).
  useEffect(() => {
    if (!agentId || isNew) return
    let cancelled = false
    const load = async () => {
      try {
        const rules = await opendora.permission.listRules("agent", agentId)
        if (cancelled) return
        const ids: Record<string, string> = {}
        for (const r of rules) {
          if (r.resource === "skill" && r.action === "allow") ids[r.pattern] = r.id
        }
        setSkillRuleIds(ids)
        setSelectedSkills(Object.keys(ids))
      } catch { /* ignore — fall back to agent.skills already set */ }
    }
    load()
    const unsub = opendora.events.subscribe((event) => {
      if (event.type === "permission.rules.updated") {
        const props = event.properties as { scope?: string; scope_id?: string } | undefined
        if (props?.scope === "agent" && props?.scope_id === agentId) {
          load()
        }
      }
    })
    return () => { cancelled = true; unsub() }
  }, [agentId, isNew])

  // Load persona separately (network call, only on id change)
  useEffect(() => {
    if (!id || isNew) return
    getAgentPersona(agentId).then(setPersona).catch(() => { })
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load injection separately (network call, only on id change)
  useEffect(() => {
    if (!id || isNew) return
    opendora.agent.getInjection(agentId).then(setInjection).catch(() => { })
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDelegateAgent(agentName: string) {
    setDelegateAllowedAgents((prev) =>
      prev.includes(agentName) ? prev.filter((n) => n !== agentName) : [...prev, agentName],
    )
  }

  function toggleTool(toolId: string) {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId],
    )
  }

  // Enabling a skill creates an agent-scoped `skill` allow rule (the load
  // permission); disabling removes it. Rules are the source of truth, so the
  // toggle, system prompt, and skill_load stay in sync. For a not-yet-created
  // agent we just track local state and seed rules on first save/load.
  async function handleToggleSkill(name: string) {
    const enabled = selectedSkills.includes(name)
    const newSkills = enabled ? selectedSkills.filter((s) => s !== name) : [...selectedSkills, name]

    if (isNew) {
      setSelectedSkills(newSkills)
      return
    }

    if (enabled) {
      const ruleId = skillRuleIds[name]
      setSelectedSkills(newSkills)
      setSkillRuleIds((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
      if (ruleId) {
        await opendora.permission.removeRule(ruleId, "agent", agentId).catch(() => { })
      }
    } else {
      setSelectedSkills(newSkills)
      try {
        const rule = await opendora.permission.addRule({
          scope: "agent",
          scope_id: agentId,
          resource: "skill",
          access: "execute",
          pattern: name,
          action: "allow",
        })
        setSkillRuleIds((prev) => ({ ...prev, [name]: rule.id }))
      } catch { /* permission.rules.updated refresh will reconcile */ }
    }
    // Immediately update the agent's skills array in storage to keep it in sync
    // with the permission rules. This ensures the session system prompt sees the
    // correct skills without waiting for the agent to be reloaded.
    try {
      console.log(`[UI] Updating agent ${agentId} skills to:`, newSkills)
      await updateAgent(agentId, { skills: newSkills })
      console.log(`[UI] Successfully updated agent ${agentId} skills`)
    } catch (err) {
      console.error(`[UI] Failed to update agent ${agentId} skills:`, err)
      // If update fails, the permission rule is still the source of truth
    }
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
        color,
        // Send the actual boolean so JSON.stringify includes false — `hidden || undefined`
        // drops false and the server merge would keep the existing hidden:true value.
        hidden: hidden,
        // null signals "clear this field" to AgentStorage.update (undefined would be
        // stripped by JSON.stringify and the server would keep the existing value).
        temperature: !isNaN(temp) ? temp : null as any,
        steps: !isNaN(stepsNum) && stepsNum > 0 ? stepsNum : null as any,
        model,
        fallback_model: fallbackModel,
        tools: selectedTools.length > 0 ? selectedTools : undefined,
        // For new agents, seed skills[] so the migration can create rules.
        // For existing agents, omit skills[] since they're derived from rules.
        skills: isNew ? selectedSkills : undefined,
        workflows: selectedWorkflows,
        toolConfig: (() => {
          const tc: any = {}
          if (delegateAllowedAgents.length > 0) {
            tc.delegate = { allowedAgents: delegateAllowedAgents }
          }
          if (selectedTools.includes("reply")) {
            tc.reply = { stopAfterReply: replyStopAfterReply }
          }
          return Object.keys(tc).length > 0 ? tc : undefined
        })(),
        injectInstructions: injectInstructions ? undefined : false,
        enableInjection: enableInjection ? true : false,
        defaultPaths: defaultPaths.length > 0 ? defaultPaths : undefined,
      }
      if (isNew) {
        const entry = await createAgent(config, persona, enableInjection ? injection : undefined)
        router.push(`/dashboard/agents/${entry.id}`)
      } else {
        await updateAgent(agentId, config, persona, enableInjection ? injection : undefined)
        router.push("/dashboard")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isNew ? "Failed to create" : "Failed to save")
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
    const selectedGroup = value?.providerID === "fallback"
      ? modelGroups.find((group) => group.id === value.modelID)
      : undefined

    return (
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <ModelSelector
          open={open}
          onOpenChange={(nextOpen) => {
            onOpenChange(nextOpen)
            if (nextOpen) {
              refreshProviders().catch(() => { })
              refreshModelGroups().catch(() => { })
              refreshProviderTimeouts().catch(() => { })
            }
          }}
        >
          <ModelSelectorTrigger asChild>
            <Button variant="outline" className="w-full justify-start font-normal">
              {selectedGroup ? (
                <>
                  <ComponentIcon className="size-3 shrink-0" />
                  <ModelSelectorName>{selectedGroup.name}</ModelSelectorName>
                </>
              ) : selected ? (
                <>
                  <ModelSelectorLogo provider={selected.providerID} />
                  <ModelSelectorName>{selected.modelName}</ModelSelectorName>
                </>
              ) : value ? (
                <span className="font-mono text-xs text-muted-foreground">{value.providerID}/{value.modelID}</span>
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
              {modelGroups.length > 0 && (
                <ModelSelectorGroup heading="Fallback Groups">
                  {modelGroups.map((group) => {
                    const active = value?.providerID === "fallback" && value.modelID === group.id
                    return (
                      <ModelSelectorItem
                        key={`fallback:${group.id}`}
                        value={`fallback:${group.name} ${group.id}`}
                        onSelect={() => {
                          onChange({ providerID: "fallback", modelID: group.id })
                          onOpenChange(false)
                        }}
                      >
                        <ComponentIcon className="size-3 shrink-0" />
                        <ModelSelectorName>{group.name}</ModelSelectorName>
                        {(() => {
                          const minReset = group.models.reduce<number | null>((min, m) => {
                            const pt = providerTimeouts[m.providerID]
                            if (!pt?.timedOut || !pt.resetInSeconds) return min
                            return min === null || pt.resetInSeconds < min ? pt.resetInSeconds : min
                          }, null)
                          if (minReset === null) return null
                          return (
                            <span className="ml-auto flex items-center gap-1 text-[10px] text-red-500 shrink-0">
                              <ClockAlertIcon className="size-3" />
                              {Math.ceil(minReset / 60)}m
                            </span>
                          )
                        })()}
                        {active && <CheckIcon className="size-4 shrink-0" />}
                      </ModelSelectorItem>
                    )
                  })}
                </ModelSelectorGroup>
              )}
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
                        {(() => {
                          const pt = providerTimeouts[m.providerID]
                          const timedOut = pt?.timedOut && (pt.failedModels.length === 0 || pt.failedModels.includes(m.modelID))
                          if (authExpiredProviders[m.providerID]) return <KeyIcon className="size-3 shrink-0 text-amber-500" />
                          if (timedOut) return <ClockAlertIcon className="size-3 shrink-0 text-red-500" />
                          return null
                        })()}
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
    <div className="flex h-full flex-col">
      {/* Breadcrumb header */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/settings">
                Settings
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/settings/agents">
                Agents
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="capitalize">{isNew ? "New agent" : (agent?.name || id)}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex gap-2">
          {!isNew && !agent?.native && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} disabled={saving}>
              <Trash2Icon className="mr-1.5 size-3.5" />
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/settings/agents")} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()} size="sm">
            {saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
            {isNew ? "Create agent" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="main" className="flex flex-1 flex-col overflow-hidden">
        <TabsList variant="line" className="shrink-0 border-b px-6 justify-start rounded-none w-full">
          <TabsTrigger value="main">Main</TabsTrigger>
          <TabsTrigger value="tools">
            Tools
            {selectedTools.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                {selectedTools.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="skills">
            Skills
            {selectedSkills.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                {selectedSkills.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="workflows">
            Workflows
            {selectedWorkflows.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                {selectedWorkflows.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Main tab ── */}
        <TabsContent value="main" className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">

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

            {/* Mode */}
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

            {/* Color */}
            <ColorSelector value={color} onChange={setColor} />

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

            {/* Inject instructions toggle */}
            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Inject instructions</p>
                <p className="text-xs text-muted-foreground">Load AGENTS.md / CLAUDE.md from the project into the system prompt</p>
              </div>
              <Switch checked={injectInstructions} onCheckedChange={setInjectInstructions} />
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

            {/* Enable Injection toggle */}
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Enable Injection</p>
                <p className="text-xs text-muted-foreground">Inject custom prompts dynamically before user messages</p>
              </div>
              <Switch checked={enableInjection} onCheckedChange={setEnableInjection} />
            </div>

            {/* Injection (conditional) */}
            {enableInjection && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="agent-injection">
                  Injection
                  <span className="ml-1 font-normal text-muted-foreground">(INJECTION.md)</span>
                </Label>
                <Textarea
                  id="agent-injection"
                  placeholder="<system-reminder>\nCustom workflow instructions...\n</system-reminder>"
                  className="h-72 resize-none overflow-y-auto font-mono text-xs"
                  value={injection}
                  onChange={(e) => setInjection(e.target.value)}
                />
              </div>
            )}

            {/* Sessions */}
            {!isNew && <div className="flex flex-col gap-2">
              <Label>Sessions</Label>
              <p className="-mt-1 text-xs text-muted-foreground">
                Sessions that belong to this agent. The <span className="font-medium text-primary">main</span> session is opened automatically when you switch to this agent.
              </p>
              {agentSessions.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No sessions yet — one will be created automatically.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {agentSessions.map((session) => {
                    const isMain = session.sessionType === "role"
                    const title = session.title && !session.title.startsWith("New session")
                      ? session.title
                      : new Date(session.time.created).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                    return (
                      <div key={session.id} className="flex items-center gap-3 px-3 py-2.5">
                        <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
                        {isMain && (
                          <span className="shrink-0 rounded px-1.5 py-px text-[9px] font-medium bg-primary/10 text-primary">main</span>
                        )}
                        {!isMain && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                            disabled={promotingSession === session.id}
                            onClick={async () => {
                              setPromotingSession(session.id)
                              try {
                                await setAgentMainSession(agentId, session.id)
                              } finally {
                                setPromotingSession(null)
                              }
                            }}
                          >
                            {promotingSession === session.id
                              ? <Loader2Icon className="size-3 animate-spin" />
                              : <StarIcon className="size-3" />}
                            Set as main
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 shrink-0 px-2 text-[11px]"
                          onClick={() => { selectSession(session.id); router.push("/dashboard") }}
                        >
                          Open
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </TabsContent>

        {/* ── Tools tab ── */}
        <TabsContent value="tools" className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Leave all unchecked to allow all tools. Select specific tools to restrict this agent.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1.5 text-muted-foreground shrink-0"
                onClick={() => router.push("/dashboard/settings/tools")}
              >
                <ExternalLinkIcon className="size-3.5" />
                Tool Registry
              </Button>
            </div>

            {allSourceGroups.map((sg) => {
              const groupTools = groupedBySource.get(sg)!
              const toolIds = groupTools.map((t) => t.id)
              const selectedCount = toolIds.filter((id) => selectedTools.includes(id)).length
              const isExpanded = expandedGroup === sg
              const isMcp = sg.startsWith("mcp:")
              const label = sourceGroupLabel(sg)

              return (
                <Card key={sg} className="cursor-pointer">
                  <CardHeader
                    className="flex-row items-center justify-between"
                    onClick={() => setExpandedGroup(isExpanded ? null : sg)}
                  >
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {label}
                        {isMcp && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">MCP</span>
                        )}
                      </CardTitle>
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
                      <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
                        {toolIds.map((toolId) => (
                          <Label key={toolId} className="flex cursor-pointer items-center gap-2 font-normal">
                            <Checkbox
                              checked={selectedTools.includes(toolId)}
                              onCheckedChange={() => toggleTool(toolId)}
                            />
                            <span className="font-mono text-xs">{toolId}</span>
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
                            setSelectedTools((prev) => prev.filter((id) => !toolIds.includes(id)))
                          }}
                        >
                          Clear group
                        </Button>
                      )}

                      {sg === "core" && selectedTools.includes("delegate") && (
                        <div className="mt-3 border-t pt-3">
                          <p className="mb-0.5 text-xs font-medium">Allowed agents for delegate</p>
                          <p className="mb-2 text-xs text-muted-foreground">
                            Leave empty to allow all agents.
                          </p>
                          <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
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

                      {sg === "core" && selectedTools.includes("reply") && (
                        <div className="mt-3 border-t pt-3">
                          <Label className="flex cursor-pointer items-center gap-2 font-normal">
                            <Checkbox
                              checked={replyStopAfterReply}
                              onCheckedChange={(checked) => setReplyStopAfterReply(checked === true)}
                            />
                            <div>
                              <p className="text-xs font-medium">Stop after reply</p>
                              <p className="text-xs text-muted-foreground">
                                Agent stops processing immediately after using the reply tool, waiting for user response.
                              </p>
                            </div>
                          </Label>
                        </div>
                      )}

                      {sg === "core" && (
                        <div className="mt-3 border-t pt-3" onClick={(e) => e.stopPropagation()}>
                          <p className="mb-0.5 text-xs font-medium">Default working directory</p>
                          <p className="mb-2 text-xs text-muted-foreground">
                            The working directory for this agent's sessions. First path is used as default. Can be overridden per-session.
                          </p>
                          {defaultPaths.map((p) => (
                            <div key={p} className="mb-1.5 flex items-center gap-2">
                              <span className="flex-1 truncate font-mono text-xs">{p}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-muted-foreground"
                                onClick={() => setDefaultPaths((prev) => prev.filter((x) => x !== p))}
                              >
                                Remove
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
                                  const val = newPathInput.trim()
                                  if (val && !defaultPaths.includes(val)) {
                                    setDefaultPaths((prev) => [...prev, val])
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
                              className="h-7 text-xs"
                              onClick={() => {
                                const val = newPathInput.trim()
                                if (val && !defaultPaths.includes(val)) {
                                  setDefaultPaths((prev) => [...prev, val])
                                  setNewPathInput("")
                                }
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </TabsContent>
        {/* ── Skills tab ── */}
        <TabsContent value="skills" className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-6 py-8">
            <div className="flex gap-3">
              <div className="relative max-w-sm flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search skills…"
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex rounded-lg border p-1 h-9">
                <Button
                  size="sm"
                  variant={skillFilter === "all" ? "secondary" : "ghost"}
                  className="h-full text-xs"
                  onClick={() => setSkillFilter("all")}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={skillFilter === "selected" ? "secondary" : "ghost"}
                  className="h-full text-xs"
                  onClick={() => setSkillFilter("selected")}
                >
                  Selected
                </Button>
                <Button
                  size="sm"
                  variant={skillFilter === "deselected" ? "secondary" : "ghost"}
                  className="h-full text-xs"
                  onClick={() => setSkillFilter("deselected")}
                >
                  Deselected
                </Button>
              </div>
            </div>
            {(() => {
              const filtered = skillSearch
                ? availableSkills.filter((s) =>
                    s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
                    (s.description ?? "").toLowerCase().includes(skillSearch.toLowerCase())
                  )
                : availableSkills
              const filterApplied = skillFilter === "selected"
                ? (() => {
                    const selectedSet = new Set(selectedSkills)
                    const selectedFromAvailable = filtered.filter((s) => selectedSet.has(s.name))
                    const missingSkills = selectedSkills.filter((name) => !availableSkills.some((s) => s.name === name))
                    const missingAsSkills = missingSkills.map((name) => ({ name, description: "Skill not found in available skills", location: "", content: "", origin: undefined, tools: undefined }))
                    return [...selectedFromAvailable, ...missingAsSkills]
                  })()
                : skillFilter === "deselected"
                  ? filtered.filter((s) => !selectedSkills.includes(s.name))
                  : filtered
              const sorted = [...filterApplied].sort((a, b) => a.name.localeCompare(b.name))
              return sorted.length === 0 ? (
                <p className="text-xs text-muted-foreground">No skills match your search.</p>
              ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {sorted.map((skill) => {
                    const enabled = selectedSkills.includes(skill.name)
                    return (
                      <SettingsCard
                        key={skill.name}
                        title={skill.name}
                        description={skill.description || "No description"}
                        action={
                          <Switch
                            size="sm"
                            checked={enabled}
                            onCheckedChange={() => handleToggleSkill(skill.name)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      />
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </TabsContent>
        {/* ── Workflows tab ── */}
        <TabsContent value="workflows" className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-6 py-8">
            <div className="flex gap-3">
              <div className="relative max-w-sm flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search workflows…"
                  value={workflowSearch}
                  onChange={(e) => setWorkflowSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex rounded-lg border p-1 h-9">
                <Button
                  size="sm"
                  variant={workflowFilter === "all" ? "secondary" : "ghost"}
                  className="h-full text-xs"
                  onClick={() => setWorkflowFilter("all")}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={workflowFilter === "selected" ? "secondary" : "ghost"}
                  className="h-full text-xs"
                  onClick={() => setWorkflowFilter("selected")}
                >
                  Selected
                </Button>
                <Button
                  size="sm"
                  variant={workflowFilter === "deselected" ? "secondary" : "ghost"}
                  className="h-full text-xs"
                  onClick={() => setWorkflowFilter("deselected")}
                >
                  Deselected
                </Button>
              </div>
            </div>
            {(() => {
              const filtered = workflowSearch
                ? availableWorkflows.filter((w) =>
                    w.id.toLowerCase().includes(workflowSearch.toLowerCase()) ||
                    w.name.toLowerCase().includes(workflowSearch.toLowerCase()) ||
                    (w.description ?? "").toLowerCase().includes(workflowSearch.toLowerCase())
                  )
                : availableWorkflows
              const filterApplied = workflowFilter === "selected"
                ? (() => {
                    const selectedSet = new Set(selectedWorkflows)
                    const selectedFromAvailable = filtered.filter((w) => selectedSet.has(w.id))
                    const missingIds = selectedWorkflows.filter((id) => !availableWorkflows.some((w) => w.id === id))
                    const missingAsWorkflows: Workflow[] = missingIds.map((id) => ({ id, name: id, description: "Workflow not found", version: "", nodes: [], edges: [] }))
                    return [...selectedFromAvailable, ...missingAsWorkflows]
                  })()
                : workflowFilter === "deselected"
                  ? filtered.filter((w) => !selectedWorkflows.includes(w.id))
                  : filtered
              const sorted = [...filterApplied].sort((a, b) => a.name.localeCompare(b.name))
              return sorted.length === 0 ? (
                <p className="text-xs text-muted-foreground">No workflows match your search.</p>
              ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {sorted.map((workflow) => {
                    const enabled = selectedWorkflows.includes(workflow.id)
                    return (
                      <SettingsCard
                        key={workflow.id}
                        title={workflow.name || workflow.id}
                        description={workflow.description || workflow.id}
                        action={
                          <Switch
                            size="sm"
                            checked={enabled}
                            onCheckedChange={() =>
                              setSelectedWorkflows((prev) =>
                                enabled ? prev.filter((s) => s !== workflow.id) : [...prev, workflow.id]
                              )
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      />
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </TabsContent>
      </Tabs>

      {agent && (
        <AgentDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          agentId={(agent as any)._id || agent.name}
          agentName={agent.name}
          onDeleted={() => router.push("/dashboard")}
        />
      )}
    </div>
  )
}
