"use client"

import { useMemo, useState } from "react"
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ModelSelectorLogo, ModelSelectorName } from "@/components/ai-elements/model-selector"
import { cn } from "@/lib/utils"
import type { Provider } from "@/lib/opendora"

export type ModelGroup = {
  id: string
  name: string
  models: { providerID: string; modelID: string }[]
}

type ModelEntry = {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
}

type FilterOption = "selected" | "free" | "all"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  providers: Provider[]
  connectedProviders: string[]
  modelFilters: Record<string, "all" | "free" | "none">
  onSave: (group: Omit<ModelGroup, "id">) => void
}

function isFreeModel(m: { id: string; [k: string]: unknown }): boolean {
  const cost = (m as any).cost as { input: number; output: number } | undefined
  if (cost && cost.input === 0 && cost.output === 0) return true
  return m.id.endsWith(":free") || m.id.endsWith("-free")
}

export function GroupBuilderDialog({
  open,
  onOpenChange,
  providers,
  connectedProviders,
  modelFilters,
  onSave,
}: Props) {
  const [name, setName] = useState("")
  const [filter, setFilter] = useState<FilterOption>("selected")
  const [selected, setSelected] = useState<{ providerID: string; modelID: string }[]>([])

  const allModels = useMemo<ModelEntry[]>(() => {
    return providers
      .filter((p) => connectedProviders.includes(p.id))
      .flatMap((p) =>
        Object.values(p.models).map((m) => ({
          providerID: p.id,
          providerName: p.name,
          modelID: m.id,
          modelName: (m as { name?: string }).name ?? m.id,
        })),
      )
  }, [providers, connectedProviders])

  const availableModels = useMemo<ModelEntry[]>(() => {
    const selectedKeys = new Set(selected.map((s) => `${s.providerID}:${s.modelID}`))

    let pool: ModelEntry[]
    if (filter === "free") {
      pool = providers
        .filter((p) => connectedProviders.includes(p.id))
        .flatMap((p) =>
          Object.values(p.models)
            .filter(isFreeModel)
            .map((m) => ({
              providerID: p.id,
              providerName: p.name,
              modelID: m.id,
              modelName: (m as { name?: string }).name ?? m.id,
            })),
        )
    } else if (filter === "selected") {
      pool = providers
        .filter((p) => connectedProviders.includes(p.id))
        .flatMap((p) => {
          const pFilter = modelFilters[p.id] ?? "all"
          if (pFilter === "none") return []
          return Object.values(p.models)
            .filter((m) => (pFilter === "free" ? isFreeModel(m) : true))
            .map((m) => ({
              providerID: p.id,
              providerName: p.name,
              modelID: m.id,
              modelName: (m as { name?: string }).name ?? m.id,
            }))
        })
    } else {
      pool = allModels
    }

    return pool.filter((m) => !selectedKeys.has(`${m.providerID}:${m.modelID}`))
  }, [filter, allModels, selected, providers, connectedProviders, modelFilters])

  const modelsByProvider = useMemo(() => {
    const groups = new Map<string, ModelEntry[]>()
    for (const m of availableModels) {
      if (!groups.has(m.providerName)) groups.set(m.providerName, [])
      groups.get(m.providerName)!.push(m)
    }
    return groups
  }, [availableModels])

  const selectedEntries = useMemo<ModelEntry[]>(
    () =>
      selected.map(
        (s) =>
          allModels.find((m) => m.providerID === s.providerID && m.modelID === s.modelID) ?? {
            providerID: s.providerID,
            providerName: s.providerID,
            modelID: s.modelID,
            modelName: s.modelID,
          },
      ),
    [selected, allModels],
  )

  function add(providerID: string, modelID: string) {
    setSelected((prev) => [...prev, { providerID, modelID }])
  }

  function remove(idx: number) {
    setSelected((prev) => prev.filter((_, i) => i !== idx))
  }

  function moveUp(idx: number) {
    if (idx === 0) return
    setSelected((prev) => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveDown(idx: number) {
    setSelected((prev) => {
      if (idx === prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  function handleSave() {
    if (!name.trim() || selected.length === 0) return
    onSave({ name: name.trim(), models: selected })
    reset()
  }

  function reset() {
    setName("")
    setFilter("selected")
    setSelected([])
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>New fallback group</DialogTitle>
        </DialogHeader>

        {/* Name + filters */}
        <div className="flex flex-col gap-4 px-6 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-name" className="text-xs">
              Group name
            </Label>
            <Input
              id="group-name"
              placeholder="e.g. Primary fallback"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Show:</span>
            {(["selected", "free", "all"] as FilterOption[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setFilter(opt)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded border transition-colors capitalize",
                  filter === opt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Search — full-width between dividers so bg-popover blends flush */}
        <Command className="rounded-none border-y">
          <CommandInput placeholder="Search models…" className="h-9" />
          <CommandList className="max-h-52">
            <CommandEmpty>No models found.</CommandEmpty>
            {[...modelsByProvider.entries()].map(([providerName, models]) => (
              <CommandGroup key={providerName} heading={providerName}>
                {models.map((m) => (
                  <CommandItem
                    key={`${m.providerID}:${m.modelID}`}
                    value={`${m.providerName} ${m.modelName} ${m.modelID}`}
                    onSelect={() => add(m.providerID, m.modelID)}
                    className="gap-2"
                  >
                    <ModelSelectorLogo provider={m.providerID} />
                    <ModelSelectorName>{m.modelName}</ModelSelectorName>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>

        {/* Fallback chain */}
        {selectedEntries.length > 0 && (
          <div className="flex flex-col gap-1.5 px-6 pt-4 pb-4">
            <span className="text-xs text-muted-foreground">Fallback order</span>
            <div className="divide-y rounded-md border">
              {selectedEntries.map((m, idx) => (
                <div
                  key={`${m.providerID}:${m.modelID}:${idx}`}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <span className="w-4 shrink-0 text-right text-xs text-muted-foreground">
                    {idx + 1}
                  </span>
                  <ModelSelectorLogo provider={m.providerID} />
                  <span className="flex-1 truncate text-sm">{m.modelName}</span>
                  <span className="text-xs text-muted-foreground">{m.providerName}</span>
                  <div className="ml-auto flex items-center gap-0.5">
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUpIcon className="size-3.5" />
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === selectedEntries.length - 1}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDownIcon className="size-3.5" />
                    </button>
                    <button
                      onClick={() => remove(idx)}
                      className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || selected.length === 0}>
            Save group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
