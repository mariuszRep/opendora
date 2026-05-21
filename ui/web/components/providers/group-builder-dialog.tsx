"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react"
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
  initialGroup?: ModelGroup | null
  onSave: (group: Omit<ModelGroup, "id">) => void | Promise<void>
}

function isFreeModel(m: { id: string; [k: string]: unknown }): boolean {
  const cost = m.cost as { input: number; output: number } | undefined
  return !!(cost && cost.input === 0 && cost.output === 0)
}

function isSelectableProvider(provider: Provider, connectedProviders: string[]): boolean {
  return provider.id !== "fallback" && connectedProviders.includes(provider.id)
}

export function GroupBuilderDialog({
  open,
  onOpenChange,
  providers,
  connectedProviders,
  modelFilters,
  initialGroup,
  onSave,
}: Props) {
  const [name, setName] = useState("")
  const [filter, setFilter] = useState<FilterOption>("selected")
  const [selected, setSelected] = useState<{ providerID: string; modelID: string }[]>([])
  const [addingModel, setAddingModel] = useState(false)
  const [saving, setSaving] = useState(false)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      setName(initialGroup?.name ?? "")
      setSelected(initialGroup?.models.map((model) => ({ ...model })) ?? [])
      setFilter("selected")
      setAddingModel(false)
      setSaving(false)
    }
    wasOpen.current = open
  }, [initialGroup, open])

  const allModels = useMemo<ModelEntry[]>(() => {
    return providers
      .filter((p) => isSelectableProvider(p, connectedProviders))
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
        .filter((p) => isSelectableProvider(p, connectedProviders))
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
        .filter((p) => isSelectableProvider(p, connectedProviders))
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
    setAddingModel(false)
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

  async function handleSave() {
    if (!name.trim() || selected.length === 0) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), models: selected })
      handleOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setName("")
    setFilter("selected")
    setSelected([])
    setAddingModel(false)
    setSaving(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(calc(100vw-2rem),56rem)] max-w-none gap-0 overflow-hidden p-0">
        <DialogHeader className="min-w-0 px-6 pt-6 pb-4">
          <DialogTitle>{initialGroup ? "Edit fallback group" : "New fallback group"}</DialogTitle>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4 px-6 pb-4">
          <div className="flex min-w-0 flex-col gap-1.5">
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

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs">Fallback models</Label>
                <span className="text-xs text-muted-foreground">Fallback order</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setFilter("selected")
                  setAddingModel((value) => !value)
                }}
              >
                <PlusIcon className="size-3.5" />
                Add model
              </Button>
            </div>

            {selectedEntries.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No fallback models added.
              </div>
            ) : (
              <div className="min-w-0 divide-y overflow-hidden rounded-md border">
                  {selectedEntries.map((m, idx) => (
                    <div
                      key={`${m.providerID}:${m.modelID}:${idx}`}
                      className="grid min-w-0 grid-cols-[8rem_minmax(0,1fr)_2rem] items-center gap-3 px-3 py-2"
                    >
                      <div className="flex items-center gap-1">
                        <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">
                          {idx + 1}
                        </span>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="outline"
                          onClick={() => moveUp(idx)}
                          disabled={idx === 0}
                          title="Promote priority"
                        >
                          <ArrowUpIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="outline"
                          onClick={() => moveDown(idx)}
                          disabled={idx === selectedEntries.length - 1}
                          title="Demote priority"
                        >
                          <ArrowDownIcon className="size-3.5" />
                        </Button>
                      </div>

                      <div className="flex min-w-0 items-center gap-2">
                        <ModelSelectorLogo provider={m.providerID} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{m.modelName}</div>
                          <div className="truncate text-xs text-muted-foreground">{m.providerName}</div>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => remove(idx)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remove model"
                        >
                          <XIcon className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {addingModel && (
            <div className="flex min-w-0 flex-col overflow-hidden rounded-md border">
              <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
                <span className="text-xs text-muted-foreground">Show:</span>
                {(["selected", "free", "all"] as FilterOption[]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFilter(opt)}
                    className={cn(
                      "rounded border px-2 py-0.5 text-xs capitalize transition-colors",
                      filter === opt
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              <Command className="min-w-0 rounded-none">
                <CommandInput placeholder="Search models..." className="h-9" />
                <CommandList className="max-h-64">
                  <CommandEmpty>No models found.</CommandEmpty>
                  {[...modelsByProvider.entries()].map(([providerName, models]) => (
                    <CommandGroup key={providerName} heading={providerName}>
                      {models.map((m) => (
                        <CommandItem
                          key={`${m.providerID}:${m.modelID}`}
                          value={`${m.providerName} ${m.modelName} ${m.modelID}`}
                          onSelect={() => add(m.providerID, m.modelID)}
                          className="min-w-0 gap-2"
                        >
                          <ModelSelectorLogo provider={m.providerID} />
                          <ModelSelectorName className="min-w-0">{m.modelName}</ModelSelectorName>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </div>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 w-full min-w-0 border-t px-6 py-4">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || selected.length === 0}>
            {saving ? "Saving..." : initialGroup ? "Save changes" : "Save group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
