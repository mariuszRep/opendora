"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CheckIcon, Loader2Icon, MessageSquareIcon, SparklesIcon, StarIcon, Trash2Icon } from "lucide-react"
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
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { opendora, type AgentConfig } from "@/lib/opendora"

const MODE_OPTIONS: { value: AgentConfig["mode"]; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "worker", label: "Worker" },
  { value: "system", label: "System" },
  { value: "subagent", label: "Sub-agent (Legacy)" },
  { value: "all", label: "All" },
]

const HIDDEN_TOOLS = new Set(["invalid", "plan_exit"])

const FILESYSTEM_TOOLS = new Set([
  "read", "write", "edit", "list", "glob", "grep",
  "apply_patch", "multiedit", "codesearch",
])

const SHELL_TOOLS = new Set(["bash", "batch"])

const WEB_TOOLS = new Set(["webfetch", "websearch"])

const SESSION_TOOLS = new Set([
  "delegate", "reply", "session_get", "session_search", "session_tree",
])

const AGENT_TOOLS = new Set([
  "agent_create", "agent_delete", "agent_get", "agent_list", "agent_update",
])

const SKILL_TOOLS = new Set(["skill_list", "skill_load", "skill_search", "skill_install", "skill_create", "skill_remove"])

type ModelValue = { providerID: string; modelID: string } | undefined

export default function AgentSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { updateAgent, getAgentPersona, generateAgent, providers, connectedProviders, modelFilters, allAgents, refreshProviders, sessions, setAgentMainSession, selectSession } =
    useOpendoraContext()

  const agent = allAgents.find((a) => (a as any)._id === id || (a as any).id === id || a.name === id) as any

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
  const [availableTools, setAvailableTools] = useState<string[]>([])
  const [expandedGroup, setExpandedGroup] = useState<"filesystem" | "shell" | "web" | "sessions" | "agents" | "skills" | "others" | null>(null)
  const [delegateAllowedAgents, setDelegateAllowedAgents] = useState<string[]>([])
  const [replyStopAfterReply, setReplyStopAfterReply] = useState(false)
  const [defaultPaths, setDefaultPaths] = useState<string[]>([])
  const [newPathInput, setNewPathInput] = useState("")
  const [persona, setPersona] = useState("")
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
      if (cost && cost.input === 0 && cost.output === 0) return true
      return m.id.endsWith(":free") || m.id.endsWith("-free")
    }
    return providers
      .filter((p) => connectedProviders.includes(p.id))
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

  // Load available tools
  useEffect(() => {
    opendora.agent.tools().then((ids) => {
      setAvailableTools(ids.filter((t) => !HIDDEN_TOOLS.has(t)))
    }).catch(() => { })
  }, [])

  // Load agent data — re-run when agent loads (agents list may arrive after mount)
  useEffect(() => {
    if (!id || !agent) return
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
    setDelegateAllowedAgents((agent as any).config?.toolConfig?.delegate?.allowedAgents ?? agent.toolConfig?.delegate?.allowedAgents ?? [])
    setReplyStopAfterReply((agent as any).config?.toolConfig?.reply?.stopAfterReply ?? agent.toolConfig?.reply?.stopAfterReply ?? false)
    setDefaultPaths((agent as any).config?.defaultPaths ?? (agent as any).defaultPaths ?? [])
    setNewPathInput("")
    setEnableInjection((agent as any).enableInjection ?? false)
    setInjection((agent as any).injection ?? "")
  }, [agentId, agent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load persona separately (network call, only on id change)
  useEffect(() => {
    if (!id) return
    getAgentPersona(agentId).then(setPersona).catch(() => { })
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load injection separately (network call, only on id change)
  useEffect(() => {
    if (!id) return
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
        color,
        hidden: hidden || undefined,
        temperature: !isNaN(temp) ? temp : undefined,
        steps: !isNaN(stepsNum) && stepsNum > 0 ? stepsNum : undefined,
        model,
        fallback_model: fallbackModel,
        tools: selectedTools.length > 0 ? selectedTools : undefined,
        toolConfig: (() => {
          const config: any = {}
          if (delegateAllowedAgents.length > 0) {
            config.delegate = { allowedAgents: delegateAllowedAgents }
          }
          if (selectedTools.includes("reply")) {
            config.reply = { stopAfterReply: replyStopAfterReply }
          }
          return Object.keys(config).length > 0 ? config : undefined
        })(),
        enableInjection: enableInjection || undefined,
        defaultPaths: defaultPaths.length > 0 ? defaultPaths : undefined,
      }
      console.log('[DEBUG] Saving agent config:', JSON.stringify(config, null, 2))
      console.log('[DEBUG] toolConfig:', config.toolConfig)
      console.log('[DEBUG] replyStopAfterReply state:', replyStopAfterReply)
      await updateAgent(agentId, config, persona, enableInjection ? injection : undefined)
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
              refreshProviders().catch(() => { })
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
              <BreadcrumbPage className="capitalize">{agent?.name || id}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex gap-2">
          {!agent?.native && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} disabled={saving}>
              <Trash2Icon className="mr-1.5 size-3.5" />
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
            Save changes
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
            <div className="flex flex-col gap-2">
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
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </TabsContent>

        {/* ── Tools tab ── */}
        <TabsContent value="tools" className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
            <p className="text-xs text-muted-foreground">
              Leave all unchecked to allow all tools. Select specific tools to restrict this agent.
            </p>

            {(["filesystem", "shell", "web", "sessions", "agents", "skills", "others"] as const).map((group) => {
              const groupTools = availableTools.filter((id) => {
                if (group === "filesystem") return FILESYSTEM_TOOLS.has(id)
                if (group === "shell") return SHELL_TOOLS.has(id)
                if (group === "web") return WEB_TOOLS.has(id)
                if (group === "sessions") return SESSION_TOOLS.has(id)
                if (group === "agents") return AGENT_TOOLS.has(id)
                if (group === "skills") return SKILL_TOOLS.has(id)
                // others: everything not in any specific group
                return !FILESYSTEM_TOOLS.has(id) && !SHELL_TOOLS.has(id) && !WEB_TOOLS.has(id) &&
                       !SESSION_TOOLS.has(id) && !AGENT_TOOLS.has(id) && !SKILL_TOOLS.has(id)
              })
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
                      <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
                        {groupTools.map((toolId) => (
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
                            setSelectedTools((prev) => prev.filter((id) => !groupTools.includes(id)))
                          }}
                        >
                          Clear group
                        </Button>
                      )}

                      {group === "sessions" && selectedTools.includes("delegate") && (
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

                      {group === "sessions" && selectedTools.includes("reply") && (
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

                      {group === "filesystem" && (
                        <div className="mt-3 border-t pt-3" onClick={(e) => e.stopPropagation()}>
                          <p className="mb-0.5 text-xs font-medium">Allowed paths</p>
                          <p className="mb-2 text-xs text-muted-foreground">
                            Suggested starting directories for root sessions. First path is used as default.
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
