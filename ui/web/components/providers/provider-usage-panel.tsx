"use client"

import { useProviderUsage } from "@/hooks/use-provider-usage"
import { ProviderUsageBar } from "./provider-usage-bar"
import { cn } from "@/lib/utils"

export interface ProviderUsagePanelProps {
  className?: string
  modelGroups?: { id: string; name: string; models: { providerID: string; modelID: string }[] }[]
}

export function ProviderUsagePanel({ className, modelGroups }: ProviderUsagePanelProps) {
  const { data, isLoading, error } = useProviderUsage()

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        {[1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className={cn("text-xs text-destructive", className)}>
        Failed to load quota data: {error}
      </p>
    )
  }

  const providers = Object.values(data)

  // Filter out providers with no meaningful model data
  const providersWithData = providers.filter((p) =>
    Object.values(p.models).some((m) => {
      return (
        m.requests_limit != null ||
        m.tokens_limit != null ||
        m.requests_remaining != null ||
        m.tokens_remaining != null
      )
    }),
  )

  if (providersWithData.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No quota data yet — will appear after first requests
      </p>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {providersWithData.map((providerState) => {
        const models = Object.entries(providerState.models)
        return (
          <div key={providerState.providerID}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {providerState.providerID}
            </p>
            <div className="divide-y rounded-md border px-3">
              {models.map(([modelID, state]) => {
                const groupLabel = modelGroups?.find((g) =>
                  g.models.some((m) => m.providerID === providerState.providerID && m.modelID === modelID),
                )?.name
                return (
                  <ProviderUsageBar
                    key={modelID}
                    providerID={providerState.providerID}
                    modelID={modelID}
                    state={state}
                    groupName={groupLabel}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
