"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  Loader2Icon,
  PlusIcon,
  RotateCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ModelSelectorLogo, ModelSelectorName } from "@/components/ai-elements/model-selector"
import { cn } from "@/lib/utils"
import type { GroupState, Provider } from "@/lib/projectflows"

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

function formatCooldown(seconds: number): string {
  if (seconds <= 0) return "soon"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function isFreeModel(m: { id: string; [k: string]: unknown }): boolean {
  const cost = m.cost as { input: number; output: number } | undefined
  return !!(cost && cost.input === 0 && cost.output === 0)
}

function isSelectableProvider(provider: Provider, connectedProviders: string[]): boolean {
  return provider.id !== "fallback" && connectedProviders.includes(provider.id)
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  providers: Provider[]
  connectedProviders: string[]
  modelFilters: Record<string, "all" | "free" | "none">
  initialGroup?: ModelGroup | null
  groupState?: GroupState | null
  onSave: (group: Omit<ModelGroup, "id">) => void | Promise<void>
  onDelete?: () => Promise<void>
  onResetCooldowns?: () => Promise<void>
  onSetActiveSlot?: (slot: { providerID: string; modelID: string }) => Promise<void>
}

export function GroupBuilderDialog({
  open,
  onOpenChange,
  providers,
  connectedProviders,
  modelFilters,
  initialGroup,
  groupState,
  onSave,
  onDelete,
  onResetCooldowns,
  onSetActiveSlot,
}: Props) {
  const [name, setName] = useState("")
  const [filter, setFilter] = useState<FilterOption>("selected")
  const [selected, setSelected] = useState<{ providerID: string; modelID: string }[]>([])
  const [addingModel, setAddingModel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [resettingCooldowns, setResettingCooldowns] = useState(false)
  const [settingSlot, setSettingSlot] = useState<string | null>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      setName(initialGroup?.name ?? "")
      setSelected(initialGroup?.models.map((model) => ({ ...model })) ?? [])
      setFilter("selected")
      setAddingModel(false)
      setSaving(false)
      setDeleting(false)
      setConfirmDelete(false)
      setResettingCooldowns(false)
      setSettingSlot(null)
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
    if (!name.trim() || selected.length < 2) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), models: selected })
      handleOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await onDelete()
      handleOpenChange(false)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleResetCooldowns() {
    if (!onResetCooldowns) return
    setResettingCooldowns(true)
    try {
      await onResetCooldowns()
    } finally {
      setResettingCooldowns(false)
    }
  }

  async function handleSetActiveSlot(slot: { providerID: string; modelID: string }) {
    if (!onSetActiveSlot) return
    const key = `${slot.providerID}:${slot.modelID}`
    setSettingSlot(key)
    try {
      await onSetActiveSlot(slot)
    } finally {
      setSettingSlot(null)
    }
  }

  function reset() {
    setName("")
    setFilter("selected")
    setSelected([])
    setAddingModel(false)
    setSaving(false)
    setDeleting(false)
    setConfirmDelete(false)
    setResettingCooldowns(false)
    setSettingSlot(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  const cooledCount = groupState?.slots.filter((s) => s.cooled).length ?? 0
  const isEditing = !!initialGroup

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(calc(100vw-2rem),72rem)] max-w-none sm:max-w-none gap-0 overflow-hidden p-0">
        <DialogHeader className="min-w-0 px-6 pt-6 pb-4">
          <DialogTitle>{isEditing ? "Edit fallback group" : "New fallback group"}</DialogTitle>
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
                <span className="text-xs text-muted-foreground">
                  Fallback order — first available slot is used
                </span>
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
                No fallback models added. Add at least 2 to enable switching.
              </div>
            ) : (
              <>
                <TooltipProvider>
                  <div className="min-w-0 divide-y overflow-hidden rounded-md border">
                    {selectedEntries.map((m, idx) => {
                      const slotState = groupState?.slots.find(
                        (s) => s.providerID === m.providerID && s.modelID === m.modelID,
                      )
                      const isActive = slotState?.active ?? false
                      const isCooled = slotState?.cooled ?? false
                      const cooldown = slotState?.cooldown
                      const slotKey = `${m.providerID}:${m.modelID}`
                      const isSettingThis = settingSlot === slotKey

                      return (
                        <div
                          key={`${m.providerID}:${m.modelID}:${idx}`}
                          className={cn(
                            "grid min-w-0 items-center gap-3 px-3 py-2",
                            "grid-cols-[7rem_minmax(0,1fr)_auto_auto]",
                            isActive && "bg-green-500/5",
                            isCooled && !isActive && "bg-amber-500/5",
                          )}
                        >
                          {/* reorder controls */}
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

                          {/* model info */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex min-w-0 items-center gap-2">
                                <ModelSelectorLogo provider={m.providerID} />
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{m.modelName}</div>
                                  <div className="truncate text-xs text-muted-foreground">{m.providerName}</div>
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <p className="font-medium">{m.modelName}</p>
                              <p className="text-xs text-muted-foreground">{m.providerName}</p>
                            </TooltipContent>
                          </Tooltip>

                          {/* slot status + set active */}
                          <div className="flex items-center gap-2">
                            {isActive && (
                              <span className="flex items-center gap-1 rounded border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
                                <CheckIcon className="size-3" />
                                Active
                              </span>
                            )}
                            {isCooled && cooldown && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-default rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                                    back in {formatCooldown(cooldown.resetInSeconds)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{cooldown.reason}</TooltipContent>
                              </Tooltip>
                            )}
                            {!isActive && onSetActiveSlot && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                disabled={isSettingThis}
                                onClick={() =>
                                  handleSetActiveSlot({ providerID: m.providerID, modelID: m.modelID })
                                }
                              >
                                {isSettingThis ? (
                                  <Loader2Icon className="size-3 animate-spin" />
                                ) : (
                                  "Set active"
                                )}
                              </Button>
                            )}
                          </div>

                          {/* remove */}
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
                      )
                    })}
                  </div>
                </TooltipProvider>
                {selectedEntries.length === 1 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Add at least one more model to enable fallback switching.
                  </p>
                )}
              </>
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

        <DialogFooter className="mx-0 mb-0 w-full min-w-0 border-t px-6 py-4 sm:justify-between">
          {/* destructive / maintenance actions */}
          <div className="flex items-center gap-2">
            {isEditing && onDelete && (
              confirmDelete ? (
                <>
                  <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
                    {deleting ? "Deleting…" : "Confirm delete"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2Icon className="size-3.5" />
                  Delete group
                </Button>
              )
            )}
            {isEditing && onResetCooldowns && cooledCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                disabled={resettingCooldowns}
                onClick={handleResetCooldowns}
              >
                <RotateCwIcon className={cn("size-3.5", resettingCooldowns && "animate-spin")} />
                Reset cooldowns
              </Button>
            )}
          </div>

          {/* primary actions */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || selected.length < 2}>
              {saving ? "Saving..." : isEditing ? "Save changes" : "Save group"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
