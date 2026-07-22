"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2Icon,
  ClockAlertIcon,
  DatabaseIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
import { GroupBuilderDialog, type ModelGroup } from "@/components/providers/group-builder-dialog"
import { AllModelsView } from "@/components/providers/all-models-view"
import { ProviderDetailDialog } from "@/components/providers/provider-detail-dialog"
import { SettingsCard } from "@/components/settings/settings-card"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import { opendora, type AuthMethod, type GroupState, type Provider } from "@/lib/projectflows"
import { cn } from "@/lib/utils"

type ProviderState = {
  provider: Provider
  methods: AuthMethod[]
  connected: boolean
}

type ModelValue = { providerID: string; modelID: string } | undefined

function providerLogoID(providerID: string) {
  return providerID === "opencode-private" ? "opencode" : providerID
}

export default function ProvidersPage() {
  const router = useRouter()
  const {
    providers,
    connectedProviders,
    modelFilters,
    setModelFilter,
    defaultModels,
    refreshProviders,
    modelGroups,
    refreshModelGroups,
    providerTimeouts,
    refreshProviderTimeouts,
  } = useOpendoraContext()

  const [authMethods, setAuthMethods] = useState<Record<string, AuthMethod[]>>({})
  const [removing, setRemoving] = useState<string | null>(null)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [resettingTimeout, setResettingTimeout] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)

  const [defaultModel, setDefaultModel] = useState<ModelValue>(undefined)
  const [defaultGroupID, setDefaultGroupID] = useState<string | null>(null)
  const [defaultModelOpen, setDefaultModelOpen] = useState(false)
  const [globalConfig, setGlobalConfig] = useState<{
    model?: string
    model_filters?: Record<string, "all" | "free" | "none">
    tool_config?: Record<string, { apiKey?: string; useApiKey?: boolean }>
    [k: string]: unknown
  } | null>(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ModelGroup | null>(null)
  const [groupStates, setGroupStates] = useState<GroupState[]>([])

  useEffect(() => {
    opendora.provider
      .authMethods()
      .then(setAuthMethods)
      .catch(() => {})
    opendora.config
      .get()
      .then(setGlobalConfig)
      .catch(() => {})
    opendora.provider.group
      .list()
      .then(setGroupStates)
      .catch(() => {})
  }, [])

  async function refreshGroupStates() {
    const data = await opendora.provider.group.list().catch(() => [] as GroupState[])
    setGroupStates(data)
  }

  useEffect(() => {
    if (globalConfig?.model) {
      if (globalConfig.model.startsWith("group:")) {
        setDefaultGroupID(globalConfig.model.slice(6))
        setDefaultModel(undefined)
        return
      }
      const [providerID, ...modelParts] = globalConfig.model.split("/")
      if (providerID && modelParts.length > 0) {
        setDefaultModel({ providerID, modelID: modelParts.join("/") })
        setDefaultGroupID(null)
        return
      }
    }
    if (connectedProviders.length > 0 && defaultModels) {
      const firstProvider = connectedProviders[0]
      const defaultModelId = defaultModels[firstProvider]
      if (defaultModelId) {
        setDefaultModel({ providerID: firstProvider, modelID: defaultModelId })
        setDefaultGroupID(null)
      }
    }
  }, [globalConfig, connectedProviders, defaultModels])

  async function handleSaveGroup(group: Omit<ModelGroup, "id">) {
    if (editingGroup) {
      await opendora.config.modelGroups.update(editingGroup.id, group)
    } else {
      await opendora.config.modelGroups.create(group)
    }
    await Promise.all([refreshModelGroups(), refreshProviders(), refreshGroupStates()])
  }

  async function handleDeleteGroup(id: string) {
    await opendora.config.modelGroups.delete(id)
    await Promise.all([refreshModelGroups(), refreshProviders(), refreshGroupStates()])
    if (editingGroup?.id === id) setEditingGroup(null)
  }

  async function handleResetCooldown(groupID: string) {
    await opendora.provider.group.clearCooldown(groupID).catch((err) => console.error(err))
    await refreshGroupStates()
  }

  async function handleSetActiveSlot(groupID: string, slot: { providerID: string; modelID: string }) {
    await opendora.provider.group.setActiveSlot(groupID, slot).catch((err) => console.error(err))
    await refreshGroupStates()
  }

  function handleNewGroup() {
    setEditingGroup(null)
    setGroupDialogOpen(true)
  }

  function handleEditGroup(group: ModelGroup) {
    setEditingGroup(group)
    setGroupDialogOpen(true)
  }

  async function handleRemove(providerID: string) {
    setRemoving(providerID)
    try {
      await opendora.auth.remove(providerID)
      await Promise.all([refreshProviders(), opendora.provider.authMethods().then(setAuthMethods)])
      router.refresh()
    } catch {
      // ignore
    } finally {
      setRemoving(null)
    }
  }

  async function handleOAuth(providerID: string, methodIndex: number) {
    setOauthLoading(providerID)
    try {
      const { url } = await opendora.provider.oauthAuthorize(providerID, methodIndex)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      // ignore
    } finally {
      setOauthLoading(null)
    }
  }

  async function handleResetTimeout(providerID: string) {
    setResettingTimeout(providerID)
    try {
      await opendora.provider.clearTimeout(providerID)
      await refreshProviderTimeouts()
    } catch (err) {
      console.error("Failed to reset timeout:", err)
    } finally {
      setResettingTimeout(null)
    }
  }

  async function handleApiKey(providerID: string, key: string) {
    await opendora.auth.set(providerID, { type: "api", key })
    await Promise.all([refreshProviders(), opendora.provider.authMethods().then(setAuthMethods)])
    router.refresh()
  }

  async function handleSelectDefault(modelString: string) {
    try {
      await opendora.config.update({ model: modelString })
      await Promise.all([refreshProviders(), opendora.config.get().then(setGlobalConfig)])
      setDefaultModelOpen(false)
    } catch (err) {
      console.error("Failed to save default model:", err)
    }
  }

  const modelList = useMemo(() => {
    const isFreeModel = (m: { id: string; [k: string]: unknown }) => {
      const cost = m.cost as { input: number; output: number } | undefined
      return !!(cost && cost.input === 0 && cost.output === 0)
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
          availability: (m as { availability?: string }).availability,
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

  const groupIDs = useMemo(() => new Set(modelGroups.map((g) => g.id)), [modelGroups])

  const providerGroupMembership = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const group of modelGroups) {
      const providerIDs = new Set(group.models.map((m) => m.providerID))
      for (const pid of providerIDs) {
        if (!map.has(pid)) map.set(pid, [])
        map.get(pid)!.push(group.name)
      }
    }
    return map
  }, [modelGroups])

  const providerStates: ProviderState[] = providers
    .filter((p) => !groupIDs.has(p.id))
    .map((p) => ({
      provider: p,
      methods: authMethods[p.id] ?? [],
      connected: connectedProviders.includes(p.id),
    }))

  const filteredStates = useMemo(() => {
    if (!searchQuery.trim()) return providerStates
    const q = searchQuery.toLowerCase()
    return providerStates.filter(
      ({ provider }) => provider.name.toLowerCase().includes(q) || provider.id.toLowerCase().includes(q),
    )
  }, [providerStates, searchQuery])

  const connectedStates = useMemo(
    () => [...filteredStates.filter((s) => s.connected)].sort((a, b) => a.provider.name.localeCompare(b.provider.name)),
    [filteredStates],
  )
  const unconnectedStates = useMemo(
    () =>
      [...filteredStates.filter((s) => !s.connected)].sort((a, b) => a.provider.name.localeCompare(b.provider.name)),
    [filteredStates],
  )

  function hasFreeModels(provider: Provider): boolean {
    return Object.values(provider.models).some((m) => {
      const cost = m.cost as { input: number; output: number } | undefined
      if (cost && cost.input === 0 && cost.output === 0) return true
      return m.id.endsWith(":free") || m.id.endsWith("-free")
    })
  }

  const selectedState = selectedProviderID
    ? (providerStates.find((ps) => ps.provider.id === selectedProviderID) ?? null)
    : null

  return (
    <SettingsPageLayout
      title="Providers"
      headerAction={
        <>
          <GroupBuilderDialog
            open={groupDialogOpen}
            onOpenChange={(open) => {
              setGroupDialogOpen(open)
              if (!open) setEditingGroup(null)
            }}
            providers={providers}
            connectedProviders={connectedProviders}
            modelFilters={modelFilters}
            initialGroup={editingGroup}
            groupState={editingGroup ? (groupStates.find((gs) => gs.groupID === editingGroup.id) ?? null) : null}
            onSave={handleSaveGroup}
            onDelete={
              editingGroup
                ? async () => {
                    await handleDeleteGroup(editingGroup.id)
                    setGroupDialogOpen(false)
                  }
                : undefined
            }
            onResetCooldowns={editingGroup ? async () => handleResetCooldown(editingGroup.id) : undefined}
            onSetActiveSlot={editingGroup ? async (slot) => handleSetActiveSlot(editingGroup.id, slot) : undefined}
          />
          <ModelSelector
            open={defaultModelOpen}
            onOpenChange={(next) => {
              setDefaultModelOpen(next)
              if (next) {
                refreshProviders().catch(() => {})
                refreshProviderTimeouts().catch(() => {})
              }
            }}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ModelSelectorTrigger asChild>
                    <Button size="icon-sm" variant="ghost">
                      <Settings2Icon className="size-4" />
                    </Button>
                  </ModelSelectorTrigger>
                </TooltipTrigger>
                <TooltipContent>Default model settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <ModelSelectorContent>
              <ModelSelectorInput placeholder="Search models and groups…" />
              <ModelSelectorList>
                <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                <ModelSelectorGroup heading="">
                  <ModelSelectorItem
                    value="__none__ no default"
                    onSelect={() => {
                      setDefaultModel(undefined)
                      setDefaultGroupID(null)
                      setDefaultModelOpen(false)
                    }}
                  >
                    <span className="text-muted-foreground">No default model</span>
                    {!defaultModel && !defaultGroupID && <CheckCircle2Icon className="ml-auto size-4" />}
                  </ModelSelectorItem>
                </ModelSelectorGroup>
                {modelGroups.length > 0 && (
                  <ModelSelectorGroup heading="Fallback Groups">
                    {modelGroups.map((group) => (
                      <ModelSelectorItem
                        key={`group:${group.id}`}
                        value={`group:${group.id} ${group.name}`}
                        onSelect={() => handleSelectDefault(`group:${group.id}`)}
                      >
                        <LayersIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <ModelSelectorName>{group.name}</ModelSelectorName>
                        {defaultGroupID === group.id ? (
                          <CheckCircle2Icon className="ml-auto size-4" />
                        ) : (
                          <div className="ml-auto size-4" />
                        )}
                      </ModelSelectorItem>
                    ))}
                  </ModelSelectorGroup>
                )}
                {[...modelsByProvider.entries()].map(([providerName, models]) => (
                  <ModelSelectorGroup heading={providerName} key={providerName}>
                    {models.map((m) => {
                      const active = defaultModel?.providerID === m.providerID && defaultModel?.modelID === m.modelID
                      return (
                        <ModelSelectorItem
                          key={`${m.providerID}:${m.modelID}`}
                          value={`${m.providerID}:${m.modelID}`}
                          disabled={m.availability === "reauthentication_required"}
                          onSelect={() => handleSelectDefault(`${m.providerID}/${m.modelID}`)}
                        >
                          <ModelSelectorLogo provider={m.providerID} />
                          <ModelSelectorName>
                            {m.modelName}
                            {m.availability === "reauthentication_required"
                              ? " (reauthenticate)"
                              : m.availability === "stale"
                                ? " (stale)"
                                : ""}
                          </ModelSelectorName>
                          {(() => {
                            const pt = providerTimeouts[m.providerID]
                            const mcd = pt?.modelCooldowns?.[m.modelID]
                            const isCooled = pt?.timedOut || !!mcd
                            if (!isCooled) return null
                            const resetSecs = pt?.timedOut ? pt.resetInSeconds : (mcd?.resetInSeconds ?? null)
                            return (
                              <span className="flex items-center gap-0.5 text-[10px] text-red-500 shrink-0">
                                <ClockAlertIcon className="size-3" />
                                {resetSecs ? `${Math.ceil(resetSecs / 60)}m` : ""}
                              </span>
                            )
                          })()}
                          {active ? (
                            <CheckCircle2Icon className="ml-auto size-4" />
                          ) : (
                            <div className="ml-auto size-4" />
                          )}
                        </ModelSelectorItem>
                      )
                    })}
                  </ModelSelectorGroup>
                ))}
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>
        </>
      }
    >
      <Tabs defaultValue="providers" className="flex flex-col gap-6">
        <TabsList variant="line" className="w-fit">
          <TabsTrigger value="groups">
            <LayersIcon className="size-3.5" />
            Groups
          </TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="models">
            <DatabaseIcon className="size-3.5" />
            Models
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Model Groups</h3>
                <p className="text-sm text-muted-foreground">
                  Ordered model chains — if one model fails, the next is tried automatically.
                </p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleNewGroup}>
                <PlusIcon className="size-3.5" />
                New group
              </Button>
            </div>

            {modelGroups.length === 0 ? (
              <Card className="max-w-2xl">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <LayersIcon className="size-12 text-muted-foreground/40 mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">No groups yet</p>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={handleNewGroup}>
                    <PlusIcon className="size-3.5" />
                    Create first group
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {modelGroups.map((group) => {
                  const gs = groupStates.find((s) => s.groupID === group.id)
                  const cooledCount = gs?.slots.filter((s) => s.cooled).length ?? 0
                  return (
                    <Card
                      key={group.id}
                      className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md"
                      onClick={() => handleEditGroup(group)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <LayersIcon className="size-4 text-primary shrink-0" />
                          <CardTitle className="text-base">{group.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {group.models.map((m, idx) => {
                            const prov = providers.find((p) => p.id === m.providerID)
                            const modelName =
                              (prov?.models[m.modelID] as { name?: string } | undefined)?.name ?? m.modelID
                            const slotState = gs?.slots.find(
                              (s) => s.providerID === m.providerID && s.modelID === m.modelID,
                            )
                            const isActive = slotState?.active ?? false
                            const isCooled = slotState?.cooled ?? false
                            return (
                              <div key={`${m.providerID}:${m.modelID}`} className="flex items-center gap-1">
                                {idx > 0 && <span className="text-xs text-muted-foreground">→</span>}
                                <span
                                  className={cn(
                                    "flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs",
                                    isActive &&
                                      "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400",
                                    isCooled &&
                                      !isActive &&
                                      "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                                    !isActive && !isCooled && "border-border text-muted-foreground",
                                  )}
                                >
                                  <ModelSelectorLogo provider={m.providerID} />
                                  {modelName}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        {cooledCount > 0 && (
                          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                            {cooledCount} slot{cooledCount > 1 ? "s" : ""} on cooldown — open to reset
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="models">
          <AllModelsView providers={providers} connectedProviders={connectedProviders} />
        </TabsContent>

        <TabsContent value="providers">
          <div className="flex flex-col gap-6">
            {/* Search */}
            <div className="relative max-w-sm">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search providers…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>

            {filteredStates.length === 0 && <p className="text-sm text-muted-foreground">No providers found.</p>}

            {/* Connected providers */}
            {connectedStates.length > 0 && (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {connectedStates.map(({ provider, methods }) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    connected
                    timedOut={!!providerTimeouts[provider.id]?.timedOut}
                    modelFilter={modelFilters[provider.id] ?? "all"}
                    hasFreeModels={hasFreeModels(provider)}
                    groupNames={providerGroupMembership.get(provider.id)}
                    onFilterChange={(opt) => setModelFilter(provider.id, opt)}
                    onClick={() => setSelectedProviderID(provider.id)}
                  />
                ))}
              </div>
            )}

            {/* Divider */}
            {connectedStates.length > 0 && unconnectedStates.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground select-none">Other providers</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            {/* Unconnected providers */}
            {unconnectedStates.length > 0 && (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {unconnectedStates.map(({ provider }) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    connected={false}
                    timedOut={false}
                    modelFilter={modelFilters[provider.id] ?? "all"}
                    hasFreeModels={hasFreeModels(provider)}
                    groupNames={providerGroupMembership.get(provider.id)}
                    onFilterChange={(opt) => setModelFilter(provider.id, opt)}
                    onClick={() => setSelectedProviderID(provider.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Provider detail dialog */}
      <ProviderDetailDialog
        provider={selectedState?.provider ?? null}
        open={!!selectedProviderID}
        onOpenChange={(open) => {
          if (!open) setSelectedProviderID(null)
        }}
        connected={selectedState?.connected ?? false}
        timedOut={selectedProviderID ? !!providerTimeouts[selectedProviderID]?.timedOut : false}
        methods={selectedState?.methods ?? []}
        removing={removing === selectedProviderID}
        oauthLoading={oauthLoading === selectedProviderID}
        resettingTimeout={resettingTimeout === selectedProviderID}
        modelFilter={selectedProviderID ? (modelFilters[selectedProviderID] ?? "all") : "all"}
        groupNames={selectedProviderID ? (providerGroupMembership.get(selectedProviderID) ?? []) : []}
        onRemove={() => selectedProviderID && handleRemove(selectedProviderID)}
        onOAuth={(idx) => selectedProviderID && handleOAuth(selectedProviderID, idx)}
        onApiKey={(key) => (selectedProviderID ? handleApiKey(selectedProviderID, key) : Promise.resolve())}
        onResetTimeout={() => selectedProviderID && handleResetTimeout(selectedProviderID)}
      />
    </SettingsPageLayout>
  )
}

interface ProviderCardProps {
  provider: Provider
  connected: boolean
  timedOut: boolean
  modelFilter: "all" | "free" | "none"
  hasFreeModels: boolean
  groupNames?: string[]
  onFilterChange: (opt: "all" | "free" | "none") => void
  onClick: () => void
}

function ProviderCard({
  provider,
  connected,
  timedOut,
  modelFilter,
  hasFreeModels,
  groupNames,
  onFilterChange,
  onClick,
}: ProviderCardProps) {
  const modelCount = Object.keys(provider.models).length

  const statusAction = connected ? (
    timedOut ? (
      <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-500">
        <ClockAlertIcon className="size-3.5" />
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2Icon className="size-3.5" />
      </span>
    )
  ) : null

  const filterRow = hasFreeModels ? (
    <div className="flex items-center gap-1.5 w-full">
      <span className="text-xs text-muted-foreground">Models:</span>
      {(["all", "free", "none"] as const).map((opt) => (
        <button
          key={opt}
          onClick={(e) => {
            e.stopPropagation()
            onFilterChange(opt)
          }}
          className={cn(
            "px-2 py-0.5 text-xs rounded border transition-colors capitalize",
            modelFilter === opt
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  ) : null

  const groupRow =
    groupNames && groupNames.length > 0 ? (
      <div className="flex items-center gap-1 min-w-0 w-full overflow-hidden">
        <LayersIcon className="size-3 shrink-0 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground truncate">
          {groupNames.length === 1 ? groupNames[0] : `${groupNames.length} groups`}
        </span>
      </div>
    ) : null

  const footer = filterRow ? <div className="flex flex-col w-full">{filterRow}</div> : undefined

  return (
    <SettingsCard
      title={
        <span className="flex items-center gap-2">
          <img
            src={`https://models.dev/logos/${providerLogoID(provider.id)}.svg`}
            alt={provider.name}
            className="size-4 dark:invert shrink-0"
            width={16}
            height={16}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = "none"
            }}
          />
          {provider.name}
        </span>
      }
      description={connected ? `${modelCount} model${modelCount !== 1 ? "s" : ""} available` : "Not connected"}
      action={statusAction}
      footer={footer}
      onClick={onClick}
    />
  )
}
