"use client"

import { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon, BrainIcon, WrenchIcon, PaperclipIcon, ImageIcon, MicIcon } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export type ProviderModel = {
  id: string
  name?: string
  family?: string
  providerID?: string
  status?: string
  release_date?: string
  cost?: { input: number; output: number; cache?: { read: number; write: number } }
  limit?: { context: number; input?: number; output: number }
  capabilities?: {
    temperature?: boolean
    reasoning?: boolean
    attachment?: boolean
    toolcall?: boolean
    input?: { text?: boolean; audio?: boolean; image?: boolean; video?: boolean; pdf?: boolean }
    output?: { text?: boolean; audio?: boolean; image?: boolean }
  }
  [k: string]: unknown
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${n % 1_000_000 === 0 ? n / 1_000_000 : (n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return `${n}`
}

export function formatCost(cost?: ProviderModel["cost"]): string {
  if (!cost) return "—"
  if (cost.input === 0 && cost.output === 0) return "Free"
  const fmt = (v: number) => v < 1 ? `$${v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}` : `$${v}`
  return `${fmt(cost.input)} / ${fmt(cost.output)}`
}

interface ProviderModelsPanelProps {
  models: Record<string, { id: string; name?: string; [k: string]: unknown }>
}

export function ProviderModelsPanel({ models }: ProviderModelsPanelProps) {
  const [open, setOpen] = useState(false)
  const modelList = Object.values(models) as ProviderModel[]
  if (modelList.length === 0) return null

  return (
    <TooltipProvider>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5 select-none">
          {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
          <span>{modelList.length} model{modelList.length !== 1 ? "s" : ""}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-md border overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-medium bg-muted/40 border-b">
              <span>Model</span>
              <span className="text-right w-14">Context</span>
              <span className="text-right w-28">$/1M in / out</span>
              <span className="w-16 text-right">Caps</span>
            </div>
            <ScrollArea className="max-h-64">
              <div className="divide-y">
                {modelList.map((m) => (
                  <ModelRow key={m.id} model={m} />
                ))}
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </TooltipProvider>
  )
}

function ModelRow({ model }: { model: ProviderModel }) {
  const isFree = model.cost?.input === 0 && model.cost?.output === 0
  const hasVision = model.capabilities?.input?.image || model.capabilities?.attachment
  const hasAudio = model.capabilities?.input?.audio
  const isDeprecated = model.status === "deprecated"
  const isBeta = model.status === "beta"
  const isAlpha = model.status === "alpha"

  return (
    <div className={cn(
      "grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors",
      isDeprecated && "opacity-50"
    )}>
      <div className="min-w-0 flex items-center gap-1.5">
        <span className="truncate font-medium">{model.name || model.id}</span>
        {isDeprecated && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 shrink-0 border-muted-foreground/30">deprecated</Badge>}
        {isBeta && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 shrink-0 text-amber-600 border-amber-500/40">beta</Badge>}
        {isAlpha && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 shrink-0 text-blue-600 border-blue-500/40">alpha</Badge>}
      </div>

      <span className="text-right text-muted-foreground w-14 tabular-nums shrink-0">
        {model.limit?.context ? formatTokens(model.limit.context) : "—"}
      </span>

      <span className={cn("text-right w-28 tabular-nums shrink-0 text-[11px]", isFree ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
        {formatCost(model.cost)}
      </span>

      <div className="flex items-center justify-end gap-1 w-16 shrink-0">
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
      </div>
    </div>
  )
}
