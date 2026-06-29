"use client"

import { useMemo } from "react"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"

export interface ModelEntry {
  providerID: string
  providerName: string
  modelID: string
  modelName: string
  isFallback: boolean
}

/**
 * Builds the same flat model list and provider-grouped map used by the chatbot input.
 * Single source of truth — use this wherever models need to be listed or selected.
 */
export function useModelList() {
  const { providers, connectedProviders, modelFilters, refreshProviders } = useOpendoraContext()

  const modelList = useMemo<ModelEntry[]>(() => {
    const isFreeModel = (m: { id: string; [k: string]: unknown }) => {
      const cost = (m as any).cost as { input: number; output: number } | undefined
      return !!(cost && cost.input === 0 && cost.output === 0)
    }

    const real = providers
      .filter((p) => connectedProviders.includes(p.id) && p.id !== "fallback")
      .flatMap((p) => {
        const filter = modelFilters[p.id] ?? "all"
        if (filter === "none") return []
        const models = Object.values(p.models as Record<string, { id: string; name?: string; [k: string]: unknown }>)
        const filtered = filter === "free" ? models.filter(isFreeModel) : models
        return filtered.map((m) => ({
          providerID: p.id,
          providerName: (p as any).name ?? p.id,
          modelID: m.id,
          modelName: m.name ?? m.id,
          isFallback: false,
        }))
      })

    const fallbackProvider = providers.find((p) => p.id === "fallback")
    const fallback = fallbackProvider
      ? Object.values(fallbackProvider.models as Record<string, { id: string; name?: string }>).map((m) => ({
          providerID: "fallback",
          providerName: "Free Fallback Groups",
          modelID: m.id,
          modelName: m.name ?? m.id,
          isFallback: true,
        }))
      : []

    return [...real, ...fallback]
  }, [providers, connectedProviders, modelFilters])

  const modelsByProvider = useMemo(() => {
    const groups = new Map<string, ModelEntry[]>()
    for (const m of modelList) {
      if (!groups.has(m.providerName)) groups.set(m.providerName, [])
      groups.get(m.providerName)!.push(m)
    }
    return groups
  }, [modelList])

  return { modelList, modelsByProvider, refreshProviders }
}
