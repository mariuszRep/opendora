"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { ModelUsageState } from "@/lib/opendora"

export interface ProviderUsageBarProps {
  providerID: string
  modelID: string
  state: ModelUsageState
}

function formatCountdown(resetAt: number | null | undefined): string | null {
  if (resetAt == null) return null
  const diffMs = resetAt - Date.now()
  if (diffMs <= 0) return "resetting…"
  const totalSecs = Math.ceil(diffMs / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  if (mins > 0) return `resets in ${mins}m ${secs}s`
  return `resets in ${secs}s`
}

function formatRemaining(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function ProviderUsageBar({ providerID, modelID, state }: ProviderUsageBarProps) {
  const [, setTick] = useState(0)

  // Re-render every second to keep countdowns live
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const hasRequestLimit = state.requests_limit != null && state.requests_limit > 0
  const hasTokenLimit = state.tokens_limit != null && state.tokens_limit > 0

  const requestsUsedPct = hasRequestLimit
    ? Math.min(100, ((state.requests_used ?? 0) / state.requests_limit!) * 100)
    : null
  const tokensUsedPct = hasTokenLimit
    ? Math.min(100, ((state.tokens_used ?? 0) / state.tokens_limit!) * 100)
    : null

  // Determine reset countdown — pick whichever resets sooner
  const requestsCountdown = formatCountdown(state.requests_reset_at)
  const tokensCountdown = formatCountdown(state.tokens_reset_at)
  const countdown = requestsCountdown ?? tokensCountdown

  const hasAnyData =
    requestsUsedPct !== null ||
    tokensUsedPct !== null ||
    state.requests_remaining != null ||
    state.tokens_remaining != null

  if (!hasAnyData) return null

  return (
    <div className="space-y-1.5 py-2">
      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium truncate">{modelID}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">({providerID})</span>
        </div>
        {countdown && (
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {countdown}
          </span>
        )}
      </div>

      {/* Requests bar */}
      {requestsUsedPct !== null ? (
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Requests</span>
            <span className="tabular-nums">
              {state.requests_used ?? 0} / {state.requests_limit}
            </span>
          </div>
          <Progress
            value={requestsUsedPct}
            className={cn(
              "h-1.5",
              requestsUsedPct >= 90 ? "[&>*]:bg-red-500" :
              requestsUsedPct >= 70 ? "[&>*]:bg-amber-500" :
              undefined
            )}
          />
        </div>
      ) : state.requests_remaining != null ? (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Requests remaining</span>
          <span className="tabular-nums">{formatRemaining(state.requests_remaining)}</span>
        </div>
      ) : null}

      {/* Tokens bar */}
      {tokensUsedPct !== null ? (
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Tokens</span>
            <span className="tabular-nums">
              {formatRemaining(state.tokens_used ?? 0)} / {formatRemaining(state.tokens_limit!)}
            </span>
          </div>
          <Progress
            value={tokensUsedPct}
            className={cn(
              "h-1.5",
              tokensUsedPct >= 90 ? "[&>*]:bg-red-500" :
              tokensUsedPct >= 70 ? "[&>*]:bg-amber-500" :
              undefined
            )}
          />
        </div>
      ) : state.tokens_remaining != null ? (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Tokens remaining</span>
          <span className="tabular-nums">{formatRemaining(state.tokens_remaining)}</span>
        </div>
      ) : null}
    </div>
  )
}
