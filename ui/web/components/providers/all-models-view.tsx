"use client"

import { useMemo, useState } from "react"
import { SearchIcon, BrainIcon, WrenchIcon, ImageIcon, MicIcon, VideoIcon, FileTextIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ModelSelectorLogo } from "@/components/ai-elements/model-selector"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Provider } from "@/lib/opendora"
import { formatTokens, formatCost, type ProviderModel } from "./provider-models-panel"

interface AllModelsViewProps {
  providers: Provider[]
  connectedProviders: string[]
}

type ModelEntry = { provider: Provider; model: ProviderModel }

export function AllModelsView({ providers, connectedProviders }: AllModelsViewProps) {
  const [search, setSearch] = useState("")
  const [filterProvider, setFilterProvider] = useState<string | null>(null)
  const [connectedOnly, setConnectedOnly] = useState(false)

  const activeProviders = useMemo(
    () => providers.filter((p) => Object.keys(p.models).length > 0),
    [providers],
  )

  const allModels = useMemo<ModelEntry[]>(() => {
    const list: ModelEntry[] = []
    const source = connectedOnly
      ? activeProviders.filter((p) => connectedProviders.includes(p.id))
      : activeProviders
    for (const provider of source) {
      if (filterProvider && provider.id !== filterProvider) continue
      for (const model of Object.values(provider.models)) {
        list.push({ provider, model: model as ProviderModel })
      }
    }
    return list
  }, [activeProviders, connectedProviders, filterProvider, connectedOnly])

  const filtered = useMemo<ModelEntry[]>(() => {
    if (!search.trim()) return allModels
    const q = search.toLowerCase()
    return allModels.filter(
      ({ provider, model }) =>
        (model.name ?? model.id).toLowerCase().includes(q) ||
        model.id.toLowerCase().includes(q) ||
        provider.name.toLowerCase().includes(q) ||
        model.family?.toLowerCase().includes(q),
    )
  }, [allModels, search])

  const pillProviders = useMemo(
    () =>
      connectedOnly
        ? activeProviders.filter((p) => connectedProviders.includes(p.id))
        : activeProviders,
    [activeProviders, connectedProviders, connectedOnly],
  )

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        {/* Search + toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search models or providers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-sm h-8"
            />
          </div>
          <button
            onClick={() => { setConnectedOnly((v) => !v); setFilterProvider(null) }}
            className={cn(
              "px-2.5 py-1 text-xs rounded border transition-colors shrink-0",
              connectedOnly
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
            )}
          >
            Connected only
          </button>
        </div>

        {/* Provider filter pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterProvider(null)}
            className={cn(
              "px-2.5 py-0.5 text-xs rounded-full border transition-colors",
              !filterProvider
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          {pillProviders.map((p) => (
            <button
              key={p.id}
              onClick={() => setFilterProvider(filterProvider === p.id ? null : p.id)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full border transition-colors",
                filterProvider === p.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <ModelSelectorLogo provider={p.id} />
              {p.name}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground -mt-1">
          {filtered.length.toLocaleString()} model{filtered.length !== 1 ? "s" : ""}
          {search.trim() && ` matching "${search.trim()}"`}
        </p>

        {/* Table */}
        <div className="rounded-lg border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium bg-muted/40 border-b">
            <span>Model</span>
            <span className="w-28 text-right">Provider</span>
            <span className="w-14 text-right">Context</span>
            <span className="w-32 text-right">$/1M in / out</span>
            <span className="w-16 text-center">Caps</span>
          </div>

          <ScrollArea className="max-h-[64vh]">
            <div className="divide-y">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No models found.</p>
              ) : (
                filtered.map(({ provider, model }) => (
                  <AllModelRow key={`${provider.id}:${model.id}`} provider={provider} model={model} />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </TooltipProvider>
  )
}

function AllModelRow({ provider, model }: ModelEntry) {
  const isFree = model.cost?.input === 0 && model.cost?.output === 0
  const isDeprecated = model.status === "deprecated"
  const isBeta = model.status === "beta"
  const isAlpha = model.status === "alpha"
  const hasVision = model.capabilities?.input?.image || model.capabilities?.attachment
  const hasAudio = model.capabilities?.input?.audio
  const hasVideo = model.capabilities?.input?.video
  const hasPdf = model.capabilities?.input?.pdf

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 px-4 py-2 text-xs hover:bg-muted/40 transition-colors",
        isDeprecated && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-medium">{model.name || model.id}</span>
          {isBeta && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 shrink-0 text-amber-600 border-amber-500/40">beta</Badge>}
          {isAlpha && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 shrink-0 text-blue-600 border-blue-500/40">alpha</Badge>}
          {isDeprecated && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 shrink-0 border-muted-foreground/30">deprecated</Badge>}
        </div>
        <span className="text-[10px] text-muted-foreground truncate block">{model.id}</span>
      </div>

      <div className="w-28 flex items-center justify-end gap-1.5">
        <span className="text-muted-foreground truncate text-right">{provider.name}</span>
        <ModelSelectorLogo provider={provider.id} className="shrink-0" />
      </div>

      <span className="w-14 text-right text-muted-foreground tabular-nums shrink-0">
        {model.limit?.context ? formatTokens(model.limit.context) : "—"}
      </span>

      <span className={cn("w-32 text-right tabular-nums shrink-0 text-[11px]", isFree ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
        {formatCost(model.cost)}
      </span>

      <div className="w-16 flex items-center justify-center gap-1 shrink-0">
        {model.capabilities?.reasoning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <BrainIcon className="size-3 text-purple-500" />
            </TooltipTrigger>
            <TooltipContent>Reasoning</TooltipContent>
          </Tooltip>
        )}
        {model.capabilities?.toolcall && (
          <Tooltip>
            <TooltipTrigger asChild>
              <WrenchIcon className="size-3 text-blue-500" />
            </TooltipTrigger>
            <TooltipContent>Tool use</TooltipContent>
          </Tooltip>
        )}
        {hasVision && (
          <Tooltip>
            <TooltipTrigger asChild>
              <ImageIcon className="size-3 text-teal-500" />
            </TooltipTrigger>
            <TooltipContent>Vision / attachments</TooltipContent>
          </Tooltip>
        )}
        {hasAudio && (
          <Tooltip>
            <TooltipTrigger asChild>
              <MicIcon className="size-3 text-orange-500" />
            </TooltipTrigger>
            <TooltipContent>Audio input</TooltipContent>
          </Tooltip>
        )}
        {hasVideo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <VideoIcon className="size-3 text-pink-500" />
            </TooltipTrigger>
            <TooltipContent>Video input</TooltipContent>
          </Tooltip>
        )}
        {hasPdf && (
          <Tooltip>
            <TooltipTrigger asChild>
              <FileTextIcon className="size-3 text-slate-500" />
            </TooltipTrigger>
            <TooltipContent>PDF input</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
