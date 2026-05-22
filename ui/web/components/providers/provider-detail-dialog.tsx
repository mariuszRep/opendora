"use client"

import { useMemo, useState } from "react"
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  KeyRoundIcon,
  LayersIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ModelRow, type ProviderModel } from "./provider-models-panel"
import type { AuthMethod, Provider } from "@/lib/opendora"

function logoID(id: string) {
  return id === "opencode-private" ? "opencode" : id
}

export interface ProviderDetailDialogProps {
  provider: Provider | null
  open: boolean
  onOpenChange: (open: boolean) => void
  connected: boolean
  timedOut: boolean
  methods: AuthMethod[]
  removing: boolean
  oauthLoading: boolean
  resettingTimeout: boolean
  modelFilter: "all" | "free" | "none"
  groupNames?: string[]
  onRemove: () => void
  onOAuth: (idx: number) => void
  onApiKey: (key: string) => Promise<void>
  onResetTimeout: () => void
}

export function ProviderDetailDialog({
  provider,
  open,
  onOpenChange,
  connected,
  timedOut,
  methods,
  removing,
  oauthLoading,
  resettingTimeout,
  modelFilter,
  groupNames,
  onRemove,
  onOAuth,
  onApiKey,
  onResetTimeout,
}: ProviderDetailDialogProps) {
  const [search, setSearch] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  function handleClose(next: boolean) {
    if (!next) {
      setSearch("")
      setShowKeyForm(false)
      setApiKey("")
      setKeyError(null)
    }
    onOpenChange(next)
  }

  async function handleSaveKey() {
    if (!apiKey.trim()) return
    setSavingKey(true)
    setKeyError(null)
    try {
      await onApiKey(apiKey.trim())
      setApiKey("")
      setShowKeyForm(false)
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingKey(false)
    }
  }

  const modelList = useMemo<ProviderModel[]>(() => {
    if (!provider) return []
    const all = Object.values(provider.models) as ProviderModel[]
    const byFilter =
      modelFilter === "free"
        ? all.filter((m) => m.cost?.input === 0 && m.cost?.output === 0)
        : all
    if (!search.trim()) return byFilter
    const q = search.toLowerCase()
    return byFilter.filter(
      (m) => (m.name ?? m.id).toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    )
  }, [provider, search, modelFilter])

  if (!provider) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[min(calc(100vw-2rem),42rem)] p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={`https://models.dev/logos/${logoID(provider.id)}.svg`}
                alt={provider.name}
                className="size-5 dark:invert shrink-0"
                width={20}
                height={20}
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = "none"
                }}
              />
              <DialogTitle>{provider.name}</DialogTitle>
              <span className="text-sm text-muted-foreground font-normal">{provider.id}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {connected ? (
                <>
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mr-1">
                    <CheckCircle2Icon className="size-3.5" />
                    Connected
                  </span>
                  {timedOut && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-orange-600 hover:text-orange-700 dark:text-orange-500 dark:hover:text-orange-400"
                            onClick={onResetTimeout}
                            disabled={resettingTimeout}
                          >
                            {resettingTimeout ? (
                              <Loader2Icon className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCwIcon className="size-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Reset timeout</p>
                          {groupNames && groupNames.length > 0 && (
                            <p className="mt-0.5 opacity-80">Affects: {groupNames.join(", ")}</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={onRemove}
                          disabled={removing}
                        >
                          {removing ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2Icon className="size-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Disconnect</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              ) : (
                <>
                  {methods.map((method, idx) =>
                    method.type === "api" ? (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setShowKeyForm(true)}
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
                        disabled={oauthLoading}
                        onClick={() => onOAuth(idx)}
                      >
                        {oauthLoading ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <ExternalLinkIcon className="size-3.5" />
                        )}
                        {method.label ?? "Sign in"}
                      </Button>
                    ),
                  )}
                </>
              )}
            </div>
          </div>

          {/* Fallback group membership */}
          {groupNames && groupNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <span className="text-xs text-muted-foreground">Groups:</span>
              {groupNames.map((name) => (
                <span key={name} className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                  <LayersIcon className="size-3 shrink-0" />
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* API key inline form */}
          {showKeyForm && (
            <div className="flex flex-col gap-2 pt-3">
              <Label className="text-xs">API key</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="sk-…"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveKey()
                  }}
                  className="font-mono text-xs"
                  autoFocus
                />
                <Button size="sm" onClick={handleSaveKey} disabled={savingKey || !apiKey.trim()}>
                  {savingKey && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowKeyForm(false)
                    setApiKey("")
                    setKeyError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
              {keyError && <p className="text-xs text-destructive">{keyError}</p>}
            </div>
          )}
        </DialogHeader>

        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search models…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-sm h-8"
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
            {modelList.length} model{modelList.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Model table */}
        {modelList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12 px-4">
            {search ? "No models match your search." : "No models available."}
          </p>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-medium bg-muted/40 border-b shrink-0">
              <span>Model</span>
              <span className="text-right w-14">Context</span>
              <span className="text-right w-28">$/1M in / out</span>
              <span className="w-16 text-right">Caps</span>
            </div>
            <TooltipProvider>
              <div className="flex-1 overflow-y-scroll">
                <div className="divide-y">
                  {modelList.map((m) => (
                    <ModelRow key={m.id} model={m} />
                  ))}
                </div>
              </div>
            </TooltipProvider>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
