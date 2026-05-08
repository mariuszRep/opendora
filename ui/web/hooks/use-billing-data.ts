"use client"

import { useEffect, useMemo, useState } from "react"
import { opendora, type Session } from "@/lib/opendora"

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

export type BillingData = {
  buckets: BucketData[]
  distribution: TokenDistribution[]
  topSessions: TopSession[]
  totalTokens: number
  totalSessions: number
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
  if (range === "30d") return `${d.getFullYear()}-${d.getMonth()}-W${Math.ceil(d.getDate() / 7)}`
  return `${d.getFullYear()}-${d.getMonth()}`
}

function bucketLabel(ts: number, range: TimeRange): string {
  const d = new Date(ts)
  if (range === "7d") return d.toLocaleDateString("en", { weekday: "short" })
  if (range === "30d") return `Week ${Math.ceil(d.getDate() / 7)}`
  return d.toLocaleDateString("en", { month: "short" })
}

function sessionTokens(s: Session): number {
  return (s.tokens?.input ?? 0) + (s.tokens?.output ?? 0) + (s.tokens?.cacheRead ?? 0) + (s.tokens?.cacheWrite ?? 0)
}

function aggregate(sessions: Session[], range: TimeRange): BucketData[] {
  const now = Date.now()
  const start = now - getRangeMs(range)
  const map = new Map<string, BucketData>()
  for (const s of sessions) {
    if (s.time.created < start) continue
    const key = bucketKey(s.time.created, range)
    const label = bucketLabel(s.time.created, range)
    const existing = map.get(key)
    if (existing) {
      existing.tokens += sessionTokens(s)
      existing.sessions += 1
    } else {
      map.set(key, { date: label, tokens: sessionTokens(s), sessions: 1 })
    }
  }
  return Array.from(map.values())
}

export function useBillingData(range: TimeRange): BillingData {
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    opendora.session
      .list()
      .then(setSessions)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsLoading(false))
  }, [])

  return useMemo(() => {
    const now = Date.now()
    const rangeMs = getRangeMs(range)
    const weekMs = 7 * 24 * 60 * 60 * 1000

    const inRange = sessions.filter((s) => s.time.created >= now - rangeMs && s.tokens != null)

    const totalTokens = inRange.reduce((sum, s) => sum + sessionTokens(s), 0)
    const totalSessions = inRange.length
    const days = rangeMs / (24 * 60 * 60 * 1000)
    const avgDailyTokens = days > 0 ? totalTokens / days : 0

    const currentWeekTokens = sessions
      .filter((s) => s.time.created >= now - weekMs && s.tokens != null)
      .reduce((sum, s) => sum + (s.tokens?.input ?? 0) + (s.tokens?.output ?? 0), 0)
    const prevWeekTokens = sessions
      .filter((s) => {
        const age = now - s.time.created
        return age >= weekMs && age < weekMs * 2 && s.tokens != null
      })
      .reduce((sum, s) => sum + (s.tokens?.input ?? 0) + (s.tokens?.output ?? 0), 0)
    const weekOverWeek = prevWeekTokens > 0 ? ((currentWeekTokens - prevWeekTokens) / prevWeekTokens) * 100 : 0

    const totalInput = inRange.reduce((s, sess) => s + (sess.tokens?.input ?? 0), 0)
    const totalOutput = inRange.reduce((s, sess) => s + (sess.tokens?.output ?? 0), 0)
    const totalCacheRead = inRange.reduce((s, sess) => s + (sess.tokens?.cacheRead ?? 0), 0)
    const totalCacheWrite = inRange.reduce((s, sess) => s + (sess.tokens?.cacheWrite ?? 0), 0)

    const distribution: TokenDistribution[] = [
      { name: "Input", value: totalInput },
      { name: "Output", value: totalOutput },
      { name: "Cache Read", value: totalCacheRead },
      { name: "Cache Write", value: totalCacheWrite },
    ].filter((d) => d.value > 0)

    const topSessions: TopSession[] = [...inRange]
      .sort((a, b) => {
        const ta = (a.tokens?.input ?? 0) + (a.tokens?.output ?? 0)
        const tb = (b.tokens?.input ?? 0) + (b.tokens?.output ?? 0)
        return tb - ta
      })
      .slice(0, 5)
      .map((s) => ({
        name: (s.title ?? s.id).slice(0, 32),
        tokens: (s.tokens?.input ?? 0) + (s.tokens?.output ?? 0),
      }))

    const buckets = aggregate(sessions, range)

    return { buckets, distribution, topSessions, totalTokens, totalSessions, avgDailyTokens, weekOverWeek, isLoading, error }
  }, [sessions, range, isLoading, error])
}
