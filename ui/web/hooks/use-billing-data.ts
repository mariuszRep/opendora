"use client"

import { useEffect, useMemo, useState } from "react"
import { opendora, type TokenUsageRecord, type Session } from "@/lib/opendora"

export type TimeRange = "7d" | "30d" | "90d" | "12m"

export type BucketData = {
  date: string
  tokens: number
  sessions: number
}

export type TokenDistribution = {
  name: string
  value: number
}

export type TopSession = {
  name: string
  tokens: number
}

export type ProviderRow = {
  providerID: string
  modelID: string
  calls: number
  sessions: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  costUsd: number
  estimatedCostUsd: number
  isFree: boolean
}

export type ModelRow = {
  modelID: string
  providerIDs: string[]
  calls: number
  sessions: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  costUsd: number
  estimatedCostUsd: number
  isFree: boolean
}

export type ProviderSummaryRow = {
  providerID: string
  modelCount: number
  calls: number
  sessions: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  costUsd: number
  estimatedCostUsd: number
  isFree: boolean
}

export type BillingData = {
  records: TokenUsageRecord[]
  buckets: BucketData[]
  distribution: TokenDistribution[]
  topSessions: TopSession[]
  providerRows: ProviderRow[]
  modelRows: ModelRow[]
  providerSummaryRows: ProviderSummaryRow[]
  totalTokens: number
  totalSessions: number
  totalCostUsd: number
  totalEstimatedCostUsd: number
  avgDailyTokens: number
  weekOverWeek: number
  isLoading: boolean
  error: string | null
}

function getRangeMs(range: TimeRange): number {
  switch (range) {
    case "7d": return 7 * 24 * 60 * 60 * 1000
    case "30d": return 30 * 24 * 60 * 60 * 1000
    case "90d": return 90 * 24 * 60 * 60 * 1000
    case "12m": return 365 * 24 * 60 * 60 * 1000
  }
}

function bucketKey(ts: number, range: TimeRange): string {
  const d = new Date(ts)
  if (range === "7d") return d.toISOString().slice(0, 10)
  if (range === "30d") return d.toISOString().slice(0, 10)
  return `${d.getFullYear()}-${d.getMonth()}`
}

function bucketLabel(ts: number, range: TimeRange): string {
  const d = new Date(ts)
  if (range === "7d") return d.toLocaleDateString("en", { weekday: "short" })
  if (range === "30d") return d.toLocaleDateString("en", { month: "short", day: "numeric" })
  return d.toLocaleDateString("en", { month: "short" })
}

function recordTokens(r: TokenUsageRecord): number {
  return r.input_tokens + r.output_tokens + r.cache_read_tokens + r.cache_write_tokens
}

export function useBillingData(range: TimeRange): BillingData {
  const [records, setRecords] = useState<TokenUsageRecord[]>([])
  const [sessionNameMap, setSessionNameMap] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    Promise.all([
      opendora.usage.records(range),
      opendora.session.list().catch(() => [] as Session[]),
    ])
      .then(([usageResult, sessions]) => {
        setRecords(usageResult.records)
        setSessionNameMap(
          new Map(
            sessions
              .filter((s) => s.title)
              .map((s) => [s.id, s.title!])
          )
        )
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsLoading(false))
  }, [range])

  return useMemo(() => {
    const now = Date.now()
    const weekMs = 7 * 24 * 60 * 60 * 1000
    const days = getRangeMs(range) / (24 * 60 * 60 * 1000)

    // Totals
    const totalTokens = records.reduce((sum, r) => sum + recordTokens(r), 0)
    const uniqueSessions = new Set(records.map((r) => r.session_id).filter(Boolean))
    const totalSessions = uniqueSessions.size
    const avgDailyTokens = days > 0 ? totalTokens / days : 0
    const totalCostUsd = records.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)
    const totalEstimatedCostUsd = records.reduce((sum, r) => sum + (r.estimated_cost_usd ?? 0), 0)

    // Week-over-week
    const currentWeekTokens = records
      .filter((r) => r.time >= now - weekMs)
      .reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0)
    const prevWeekTokens = records
      .filter((r) => {
        const age = now - r.time
        return age >= weekMs && age < weekMs * 2
      })
      .reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0)
    const weekOverWeek = prevWeekTokens > 0 ? ((currentWeekTokens - prevWeekTokens) / prevWeekTokens) * 100 : 0

    // Token distribution
    const totalInput = records.reduce((s, r) => s + r.input_tokens, 0)
    const totalOutput = records.reduce((s, r) => s + r.output_tokens, 0)
    const totalCacheRead = records.reduce((s, r) => s + r.cache_read_tokens, 0)
    const totalCacheWrite = records.reduce((s, r) => s + r.cache_write_tokens, 0)
    const distribution: TokenDistribution[] = [
      { name: "Input", value: totalInput },
      { name: "Output", value: totalOutput },
      { name: "Cache Read", value: totalCacheRead },
      { name: "Cache Write", value: totalCacheWrite },
    ].filter((d) => d.value > 0)

    // Buckets
    const bucketMap = new Map<string, BucketData>()
    const sessionPerBucket = new Map<string, Set<string>>()
    for (const r of records) {
      const key = bucketKey(r.time, range)
      const label = bucketLabel(r.time, range)
      const existing = bucketMap.get(key)
      if (existing) {
        existing.tokens += recordTokens(r)
      } else {
        bucketMap.set(key, { date: label, tokens: recordTokens(r), sessions: 0 })
      }
      if (r.session_id) {
        if (!sessionPerBucket.has(key)) sessionPerBucket.set(key, new Set())
        sessionPerBucket.get(key)!.add(r.session_id)
      }
    }
    for (const [key, data] of bucketMap) {
      data.sessions = sessionPerBucket.get(key)?.size ?? 0
    }
    const buckets = Array.from(bucketMap.values())

    // Top sessions by token volume — use name when available
    const sessionTokenMap = new Map<string, number>()
    for (const r of records) {
      if (!r.session_id) continue
      sessionTokenMap.set(r.session_id, (sessionTokenMap.get(r.session_id) ?? 0) + r.input_tokens + r.output_tokens)
    }
    const topSessions: TopSession[] = Array.from(sessionTokenMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, tokens]) => ({
        name: sessionNameMap.get(id) ?? id.slice(-12),
        tokens,
      }))

    // Provider+model breakdown (existing combined view)
    type ProviderRowAccum = Omit<ProviderRow, "sessions"> & { sessionSet: Set<string> }
    const providerModelMap = new Map<string, ProviderRowAccum>()
    for (const r of records) {
      const key = `${r.provider_id}::${r.model_id}`
      const existing = providerModelMap.get(key)
      if (existing) {
        existing.calls += 1
        existing.totalTokens += recordTokens(r)
        existing.inputTokens += r.input_tokens
        existing.outputTokens += r.output_tokens
        existing.cacheTokens += r.cache_read_tokens + r.cache_write_tokens
        existing.costUsd += r.cost_usd ?? 0
        existing.estimatedCostUsd += r.estimated_cost_usd ?? 0
        if (r.session_id) existing.sessionSet.add(r.session_id)
      } else {
        const sessionSet = new Set<string>()
        if (r.session_id) sessionSet.add(r.session_id)
        providerModelMap.set(key, {
          providerID: r.provider_id,
          modelID: r.model_id,
          calls: 1,
          totalTokens: recordTokens(r),
          inputTokens: r.input_tokens,
          outputTokens: r.output_tokens,
          cacheTokens: r.cache_read_tokens + r.cache_write_tokens,
          costUsd: r.cost_usd ?? 0,
          estimatedCostUsd: r.estimated_cost_usd ?? 0,
          isFree: r.is_free,
          sessionSet,
        })
      }
    }
    const providerRows: ProviderRow[] = Array.from(providerModelMap.values())
      .map(({ sessionSet, ...rest }) => ({ ...rest, sessions: sessionSet.size }))
      .sort((a, b) => b.totalTokens - a.totalTokens)

    // Model breakdown (grouped by model_id across all providers)
    const modelMap = new Map<string, { row: ModelRow; providerSet: Set<string>; sessionSet: Set<string> }>()
    for (const r of records) {
      const existing = modelMap.get(r.model_id)
      if (existing) {
        existing.row.calls += 1
        existing.row.totalTokens += recordTokens(r)
        existing.row.inputTokens += r.input_tokens
        existing.row.outputTokens += r.output_tokens
        existing.row.cacheTokens += r.cache_read_tokens + r.cache_write_tokens
        existing.row.costUsd += r.cost_usd ?? 0
        existing.row.estimatedCostUsd += r.estimated_cost_usd ?? 0
        existing.providerSet.add(r.provider_id)
        if (r.session_id) existing.sessionSet.add(r.session_id)
      } else {
        const sessionSet = new Set<string>()
        if (r.session_id) sessionSet.add(r.session_id)
        modelMap.set(r.model_id, {
          row: {
            modelID: r.model_id,
            providerIDs: [],
            calls: 1,
            sessions: 0,
            totalTokens: recordTokens(r),
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
            cacheTokens: r.cache_read_tokens + r.cache_write_tokens,
            costUsd: r.cost_usd ?? 0,
            estimatedCostUsd: r.estimated_cost_usd ?? 0,
            isFree: r.is_free,
          },
          providerSet: new Set([r.provider_id]),
          sessionSet,
        })
      }
    }
    const modelRows: ModelRow[] = Array.from(modelMap.values()).map(({ row, providerSet, sessionSet }) => ({
      ...row,
      providerIDs: Array.from(providerSet),
      sessions: sessionSet.size,
    })).sort((a, b) => b.totalTokens - a.totalTokens)

    // Provider summary (grouped by provider_id only)
    const providerSummaryMap = new Map<string, { row: ProviderSummaryRow; modelSet: Set<string>; sessionSet: Set<string> }>()
    for (const r of records) {
      const existing = providerSummaryMap.get(r.provider_id)
      if (existing) {
        existing.row.calls += 1
        existing.row.totalTokens += recordTokens(r)
        existing.row.inputTokens += r.input_tokens
        existing.row.outputTokens += r.output_tokens
        existing.row.cacheTokens += r.cache_read_tokens + r.cache_write_tokens
        existing.row.costUsd += r.cost_usd ?? 0
        existing.row.estimatedCostUsd += r.estimated_cost_usd ?? 0
        existing.modelSet.add(r.model_id)
        if (r.session_id) existing.sessionSet.add(r.session_id)
      } else {
        const sessionSet = new Set<string>()
        if (r.session_id) sessionSet.add(r.session_id)
        providerSummaryMap.set(r.provider_id, {
          row: {
            providerID: r.provider_id,
            modelCount: 0,
            calls: 1,
            sessions: 0,
            totalTokens: recordTokens(r),
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
            cacheTokens: r.cache_read_tokens + r.cache_write_tokens,
            costUsd: r.cost_usd ?? 0,
            estimatedCostUsd: r.estimated_cost_usd ?? 0,
            isFree: r.is_free,
          },
          modelSet: new Set([r.model_id]),
          sessionSet,
        })
      }
    }
    const providerSummaryRows: ProviderSummaryRow[] = Array.from(providerSummaryMap.values()).map(({ row, modelSet, sessionSet }) => ({
      ...row,
      modelCount: modelSet.size,
      sessions: sessionSet.size,
    })).sort((a, b) => b.totalTokens - a.totalTokens)

    return {
      records,
      buckets,
      distribution,
      topSessions,
      providerRows,
      modelRows,
      providerSummaryRows,
      totalTokens,
      totalSessions,
      totalCostUsd,
      totalEstimatedCostUsd,
      avgDailyTokens,
      weekOverWeek,
      isLoading,
      error,
    }
  }, [records, sessionNameMap, range, isLoading, error])
}
