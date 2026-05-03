"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2Icon, CircleIcon, ExternalLinkIcon, KeyRoundIcon, Loader2Icon, SearchIcon, Trash2Icon, BrainIcon, WrenchIcon, PlusIcon, LayersIcon } from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { opendora, type AuthMethod, type Provider } from "@/lib/opendora"
import { cn } from "@/lib/utils"

type ProviderState = {
  provider: Provider
  methods: AuthMethod[]
  connected: boolean
}

type ModelValue = { providerID: string; modelID: string } | undefined

type ApiKeyFormState = {
  providerID: string
  key: string
  saving: boolean
  error: string | null
}

export default function ProvidersPage() {
  const router = useRouter()
  const { providers, connectedProviders, modelFilters, setModelFilter, defaultModels, refreshProviders, modelGroups, refreshModelGroups } = useOpendoraContext()
  const [authMethods, setAuthMethods] = useState<Record<string, AuthMethod[]>>({})
  const [apiKeyForm, setApiKeyForm] = useState<ApiKeyFormState | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [defaultModel, setDefaultModel] = useState<ModelValue>(undefined)
  const [defaultModelOpen, setDefaultModelOpen] = useState(false)
  const [savingDefaultModel, setSavingDefaultModel] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [globalConfig, setGlobalConfig] = useState<{ model?: string; model_filters?: Record<string, "all" | "free" | "none">; tool_config?: Record<string, { apiKey?: string; useApiKey?: boolean }>; [k: string]: unknown } | null>(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)

  useEffect(() => {
    opendora.provider.authMethods().then(setAuthMethods).catch(() => {})
    opendora.config.get().then(setGlobalConfig).catch(() => {})
  }, [])

  // Load default model from global config or provider defaults
  useEffect(() => {
    if (globalConfig?.model) {
      // Parse global default model (e.g., "anthropic/claude-3-5-sonnet-20241022")
      const [providerID, ...modelParts] = globalConfig.model.split("/")
      if (providerID && modelParts.length > 0) {
        const modelID = modelParts.join("/")
        setDefaultModel({ providerID, modelID })
        return
      }
    }
    
    // Fallback to first connected provider's default
    if (connectedProviders.length > 0 && defaultModels) {
      const firstProvider = connectedProviders[0]
      const defaultModelId = defaultModels[firstProvider]
      if (defaultModelId) {
        setDefaultModel({ providerID: firstProvider, modelID: defaultModelId })
      }
    }
  }, [globalConfig, connectedProviders, defaultModels])

  async function handleSaveGroup(group: Omit<ModelGroup, "id">) {
    const newGroup: ModelGroup = { ...group, id: crypto.randomUUID() }
    const updated = [...modelGroups, newGroup]
    await opendora.config.update({ model_groups: updated })
    await refreshModelGroups()
  }

  async function handleDeleteGroup(id: string) {
    const updated = modelGroups.filter((g) => g.id !== id)
    await opendora.config.update({ model_groups: updated })
    await refreshModelGroups()
  }

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

  const providerStates: ProviderState[] = providers.map((p) => ({
    provider: p,
    methods: authMethods[p.id] ?? [],
    connected: connectedProviders.includes(p.id),
  }))

  const filteredStates = useMemo(() => {
    if (!searchQuery.trim()) return providerStates
    const q = searchQuery.toLowerCase()
    return providerStates.filter(
      ({ provider }) =>
        provider.name.toLowerCase().includes(q) ||
        provider.id.toLowerCase().includes(q),
    )
  }, [providerStates, searchQuery])

  const connectedStates = useMemo(
    () => [...filteredStates.filter((s) => s.connected)].sort((a, b) => a.provider.name.localeCompare(b.provider.name)),
    [filteredStates],
  )
  const unconnectedStates = useMemo(
    () => [...filteredStates.filter((s) => !s.connected)].sort((a, b) => a.provider.name.localeCompare(b.provider.name)),
    [filteredStates],
  )

  function hasFreeModels(provider: Provider): boolean {
    return Object.values(provider.models).some((m) => {
      const cost = (m as any).cost as { input: number; output: number } | undefined
      if (cost && cost.input === 0 && cost.output === 0) return true
      return m.id.endsWith(":free") || m.id.endsWith("-free")
    })
  }

  async function handleSaveApiKey() {
    if (!apiKeyForm || !apiKeyForm.key.trim()) return
    setApiKeyForm((f) => f && { ...f, saving: true, error: null })
    try {
      await opendora.auth.set(apiKeyForm.providerID, { type: "api", key: apiKeyForm.key.trim() })
      setApiKeyForm(null)
      // Reload the page to refresh connected providers
      router.refresh()
    } catch (err) {
      setApiKeyForm((f) => f && { ...f, saving: false, error: err instanceof Error ? err.message : "Failed to save" })
    }
  }

  async function handleRemoveToolApiKey(toolID: string) {
    try {
      const currentToolConfig = { ...(globalConfig?.tool_config || {}) } as Record<string, { apiKey?: string }>
      delete currentToolConfig[toolID]
      await opendora.config.update({ tool_config: currentToolConfig })
      opendora.config.get().then(setGlobalConfig).catch(() => {})
    } catch (err) {
      console.error("Failed to remove tool API key:", err)
    }
  }

  async function handleRemove(providerID: string) {
    setRemoving(providerID)
    try {
      await opendora.auth.remove(providerID)
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

  async function handleSaveDefaultModel() {
    if (!defaultModel) return
    setSavingDefaultModel(true)
    setSaveSuccess(false)
    setSaveError(null)
    try {
      // Save the default model configuration using the config API
      const modelString = `${defaultModel.providerID}/${defaultModel.modelID}`
      await opendora.config.update({ model: modelString })
      
      // Refresh providers and global config to get updated defaults
      await Promise.all([
        refreshProviders(),
        opendora.config.get().then(setGlobalConfig)
      ])
      
      // Show success feedback
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000) // Hide after 3 seconds
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save default model"
      setSaveError(errorMessage)
      setTimeout(() => setSaveError(null), 5000) // Hide after 5 seconds
    } finally {
      setSavingDefaultModel(false)
    }
  }

  return (
    <SettingsPageLayout
      title="Providers"
      narrow
      headerAction={
        <>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setGroupDialogOpen(true)}>
            <PlusIcon className="size-3.5" />
            New group
          </Button>
          <GroupBuilderDialog
            open={groupDialogOpen}
            onOpenChange={setGroupDialogOpen}
            providers={providers}
            connectedProviders={connectedProviders}
            modelFilters={modelFilters}
            onSave={handleSaveGroup}
          />
        </>
      }
    >
      <div className="flex flex-col gap-6">
          {/* Default Model Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BrainIcon className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Default Model</CardTitle>
              </div>
              <CardDescription>
                Set the default AI model used when agents don't have a specific model configured.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Default Model</Label>
                  <ModelSelector
                    open={defaultModelOpen}
                    onOpenChange={(nextOpen) => {
                      setDefaultModelOpen(nextOpen)
                      if (nextOpen) {
                        refreshProviders().catch(() => { })
                      }
                    }}
                  >
                    <ModelSelectorTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal" suppressHydrationWarning>
                        {defaultModel ? (
                          (() => {
                            const selected = modelList.find((m) => m.providerID === defaultModel.providerID && m.modelID === defaultModel.modelID)
                            return selected ? (
                              <>
                                <ModelSelectorLogo provider={selected.providerID} />
                                <ModelSelectorName>{selected.modelName}</ModelSelectorName>
                              </>
                            ) : (
                              <span className="text-muted-foreground">Select model...</span>
                            )
                          })()
                        ) : (
                          <span className="text-muted-foreground">Select default model...</span>
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
                            onSelect={() => { setDefaultModel(undefined); setDefaultModelOpen(false) }}
                          >
                            <span className="text-muted-foreground">No default model</span>
                            {!defaultModel && <CheckCircle2Icon className="ml-auto size-4" />}
                          </ModelSelectorItem>
                        </ModelSelectorGroup>
                        {[...modelsByProvider.entries()].map(([providerName, models]) => (
                          <ModelSelectorGroup heading={providerName} key={providerName}>
                            {models.map((m) => {
                              const active = defaultModel?.providerID === m.providerID && defaultModel?.modelID === m.modelID
                              return (
                                <ModelSelectorItem
                                  key={`${m.providerID}:${m.modelID}`}
                                  value={`${m.providerID}:${m.modelID}`}
                                  onSelect={() => {
                                    setDefaultModel({ providerID: m.providerID, modelID: m.modelID })
                                    setDefaultModelOpen(false)
                                  }}
                                >
                                  <ModelSelectorLogo provider={m.providerID} />
                                  <ModelSelectorName>{m.modelName}</ModelSelectorName>
                                  {active ? <CheckCircle2Icon className="ml-auto size-4" /> : <div className="ml-auto size-4" />}
                                </ModelSelectorItem>
                              )
                            })}
                          </ModelSelectorGroup>
                        ))}
                      </ModelSelectorList>
                    </ModelSelectorContent>
                  </ModelSelector>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">
                      This model will be used as the default for new agents and sessions.
                    </p>
                    {saveSuccess && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Default model saved successfully!
                      </p>
                    )}
                    {saveError && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {saveError}
                      </p>
                    )}
                  </div>
                  <Button 
                    size="sm" 
                    onClick={handleSaveDefaultModel}
                    disabled={savingDefaultModel || !defaultModel}
                  >
                    {savingDefaultModel && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                    {savingDefaultModel ? "Saving..." : "Save Default"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fallback groups */}
          {modelGroups.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <LayersIcon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Fallback Groups</CardTitle>
                </div>
                <CardDescription>
                  Ordered model chains — if one model fails, the next is tried automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {modelGroups.map((group) => (
                  <div key={group.id} className="rounded-md border p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{group.name}</span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteGroup(group.id)}
                        title="Delete group"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {group.models.map((m, idx) => {
                        const provider = providers.find((p) => p.id === m.providerID)
                        const modelObj = provider?.models[m.modelID]
                        const modelName = (modelObj as { name?: string } | undefined)?.name ?? m.modelID
                        return (
                          <div key={`${m.providerID}:${m.modelID}`} className="flex items-center gap-1">
                            {idx > 0 && <span className="text-xs text-muted-foreground">→</span>}
                            <span className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs">
                              <ModelSelectorLogo provider={m.providerID} />
                              {modelName}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Connect AI providers by adding API keys or signing in with OAuth.
            </p>

          {/* Search bar */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search providers…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>

          {filteredStates.length === 0 && (
            <p className="text-sm text-muted-foreground">No providers found.</p>
          )}

          {/* Connected providers */}
          {connectedStates.length > 0 && connectedStates.map(({ provider, methods, connected }) => (
            <div key={provider.id} className="rounded-lg border p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src={`https://models.dev/logos/${provider.id}.svg`}
                    alt={provider.name}
                    className="size-4 dark:invert"
                    width={16}
                    height={16}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                  />
                  <span className="font-medium text-sm">{provider.name}</span>
                  <span className="text-xs text-muted-foreground">({provider.id})</span>
                </div>
                <div className="flex items-center gap-2">
                  {connected ? (
                    <>
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2Icon className="size-3.5" />
                        Connected
                      </span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemove(provider.id)}
                        disabled={removing === provider.id}
                        title="Disconnect"
                      >
                        {removing === provider.id
                          ? <Loader2Icon className="size-3.5 animate-spin" />
                          : <Trash2Icon className="size-3.5" />}
                      </Button>
                    </>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CircleIcon className="size-3.5" />
                      Not connected
                    </span>
                  )}
                </div>
              </div>

              {/* Model filter toggle — only for providers with free models */}
              {hasFreeModels(provider) && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Models:</span>
                  {(["all", "free", "none"] as const).map((opt) => {
                    const current = modelFilters[provider.id] ?? "all"
                    return (
                      <button
                        key={opt}
                        onClick={() => setModelFilter(provider.id, opt)}
                        className={cn(
                          "px-2 py-0.5 text-xs rounded border transition-colors capitalize",
                          current === opt
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                        )}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Auth method buttons */}
              {!connected && methods.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {methods.map((method, idx) => (
                    method.type === "api" ? (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setApiKeyForm({ providerID: provider.id, key: "", saving: false, error: null })}
                      >
                        <KeyRoundIcon className="size-3.5" />
                        {method.label ?? "Enter API key"}
                      </Button>
                    ) : (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={oauthLoading === provider.id}
                        onClick={() => handleOAuth(provider.id, idx)}
                      >
                        {oauthLoading === provider.id
                          ? <Loader2Icon className="size-3.5 animate-spin" />
                          : <ExternalLinkIcon className="size-3.5" />}
                        {method.label ?? "Sign in"}
                      </Button>
                    )
                  ))}
                </div>
              )}

              {/* Inline API key form */}
              {apiKeyForm?.providerID === provider.id && (
                <div className="flex flex-col gap-2 pt-1">
                  <Label htmlFor={`key-${provider.id}`} className="text-xs">API key</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`key-${provider.id}`}
                      type="password"
                      placeholder="sk-…"
                      value={apiKeyForm.key}
                      onChange={(e) => setApiKeyForm((f) => f && { ...f, key: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveApiKey() }}
                      className="font-mono text-xs"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveApiKey} disabled={apiKeyForm.saving || !apiKeyForm.key.trim()}>
                      {apiKeyForm.saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setApiKeyForm(null)}>
                      Cancel
                    </Button>
                  </div>
                  {apiKeyForm.error && <p className="text-xs text-destructive">{apiKeyForm.error}</p>}
                </div>
              )}
            </div>
          ))}

          {/* Divider between connected and unconnected */}
          {connectedStates.length > 0 && unconnectedStates.length > 0 && (
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground select-none">Other providers</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {/* Unconnected providers */}
          {unconnectedStates.map(({ provider, methods, connected }) => (
            <div key={provider.id} className="rounded-lg border p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src={`https://models.dev/logos/${provider.id}.svg`}
                    alt={provider.name}
                    className="size-4 dark:invert"
                    width={16}
                    height={16}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                  />
                  <span className="font-medium text-sm">{provider.name}</span>
                  <span className="text-xs text-muted-foreground">({provider.id})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CircleIcon className="size-3.5" />
                    Not connected
                  </span>
                </div>
              </div>

              {/* Model filter toggle — only for providers with free models */}
              {hasFreeModels(provider) && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Models:</span>
                  {(["all", "free", "none"] as const).map((opt) => {
                    const current = modelFilters[provider.id] ?? "all"
                    return (
                      <button
                        key={opt}
                        onClick={() => setModelFilter(provider.id, opt)}
                        className={cn(
                          "px-2 py-0.5 text-xs rounded border transition-colors capitalize",
                          current === opt
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                        )}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Auth method buttons */}
              {!connected && methods.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {methods.map((method, idx) => (
                    method.type === "api" ? (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setApiKeyForm({ providerID: provider.id, key: "", saving: false, error: null })}
                      >
                        <KeyRoundIcon className="size-3.5" />
                        {method.label ?? "Enter API key"}
                      </Button>
                    ) : (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={oauthLoading === provider.id}
                        onClick={() => handleOAuth(provider.id, idx)}
                      >
                        {oauthLoading === provider.id
                          ? <Loader2Icon className="size-3.5 animate-spin" />
                          : <ExternalLinkIcon className="size-3.5" />}
                        {method.label ?? "Sign in"}
                      </Button>
                    )
                  ))}
                </div>
              )}

              {/* Inline API key form */}
              {apiKeyForm?.providerID === provider.id && (
                <div className="flex flex-col gap-2 pt-1">
                  <Label htmlFor={`key-${provider.id}`} className="text-xs">API key</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`key-${provider.id}`}
                      type="password"
                      placeholder="sk-…"
                      value={apiKeyForm.key}
                      onChange={(e) => setApiKeyForm((f) => f && { ...f, key: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveApiKey() }}
                      className="font-mono text-xs"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveApiKey} disabled={apiKeyForm.saving || !apiKeyForm.key.trim()}>
                      {apiKeyForm.saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setApiKeyForm(null)}>
                      Cancel
                    </Button>
                  </div>
                  {apiKeyForm.error && <p className="text-xs text-destructive">{apiKeyForm.error}</p>}
                </div>
              )}
            </div>
          ))}
          </div>
        </div>

        {/* Tools Card */}
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => router.push("/dashboard/settings/tools")}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <WrenchIcon className="size-5 text-muted-foreground" />
              <CardTitle>Tools</CardTitle>
            </div>
            <CardDescription>Configure API keys for web search and code search tools</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {globalConfig?.tool_config?.exa?.apiKey
                  ? globalConfig?.tool_config?.exa?.useApiKey
                    ? "EXA AI — using API key"
                    : "EXA AI — API key configured"
                  : "No API key configured"}
              </span>
              <Button size="sm" variant="outline">
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>
    </SettingsPageLayout>
  )
}
