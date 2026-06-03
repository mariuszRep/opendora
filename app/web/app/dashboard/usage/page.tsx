"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  TrendingUpIcon,
  TrendingDownIcon,
  ActivityIcon,
  CalendarIcon,
  MessageSquareIcon,
  ShieldIcon,
  CpuIcon,
  ServerIcon,
  SearchIcon,
} from "lucide-react"
import { useBillingData, type TimeRange, type ModelRow, type ProviderSummaryRow } from "@/hooks/use-billing-data"
import { ProviderUsagePanel } from "@/components/providers/provider-usage-panel"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"

// ── Types ──────────────────────────────────────────────────────────────────

type TableMetric = "total_tokens" | "input_tokens" | "output_tokens" | "cache_tokens" | "cost_usd" | "est_cost_usd" | "sessions" | "calls"
type TableAggregate = "sum" | "avg"

type ViewState = {
  metric: TableMetric
  aggregate: TableAggregate
}

const VIEW_STORAGE_KEY = "opendora-usage-view"

const DEFAULT_VIEW: ViewState = { metric: "total_tokens", aggregate: "sum" }

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function formatCost(n: number): string {
  if (n === 0) return "$0.00"
  if (n < 0.01) return `$${n.toFixed(5)}`
  return `$${n.toFixed(4)}`
}

function formatMetricValue(value: number, metric: TableMetric): string {
  if (metric === "cost_usd" || metric === "est_cost_usd") return formatCost(value)
  if (metric === "sessions" || metric === "calls") return String(Math.round(value))
  return formatTokens(value)
}

function getMetricLabel(metric: TableMetric, aggregate: TableAggregate): string {
  const base: Record<TableMetric, string> = {
    total_tokens: "Total Tokens",
    input_tokens: "Input Tokens",
    output_tokens: "Output Tokens",
    cache_tokens: "Cache Tokens",
    cost_usd: "Actual Cost",
    est_cost_usd: "Est. Cost",
    sessions: "Sessions",
    calls: "Calls",
  }
  if (aggregate === "avg" && metric !== "sessions" && metric !== "calls") {
    return `Avg ${base[metric]} / session`
  }
  return base[metric]
}

function getRawMetricModel(row: ModelRow, metric: TableMetric): number {
  switch (metric) {
    case "total_tokens": return row.totalTokens
    case "input_tokens": return row.inputTokens
    case "output_tokens": return row.outputTokens
    case "cache_tokens": return row.cacheTokens
    case "cost_usd": return row.costUsd
    case "est_cost_usd": return row.estimatedCostUsd
    case "sessions": return row.sessions
    case "calls": return row.calls
  }
}

function getRawMetricProvider(row: ProviderSummaryRow, metric: TableMetric): number {
  switch (metric) {
    case "total_tokens": return row.totalTokens
    case "input_tokens": return row.inputTokens
    case "output_tokens": return row.outputTokens
    case "cache_tokens": return row.cacheTokens
    case "cost_usd": return row.costUsd
    case "est_cost_usd": return row.estimatedCostUsd
    case "sessions": return row.sessions
    case "calls": return row.calls
  }
}

function applyAggregate(raw: number, sessions: number, aggregate: TableAggregate, metric: TableMetric): number {
  if (aggregate === "avg" && metric !== "sessions" && metric !== "calls" && sessions > 0) {
    return raw / sessions
  }
  return raw
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ViewControls({
  view,
  onChange,
}: {
  view: ViewState
  onChange: (v: ViewState) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        Show
      </div>
      <Select
        value={view.aggregate}
        onValueChange={(v) => onChange({ ...view, aggregate: v as TableAggregate })}
      >
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sum">Sum</SelectItem>
          <SelectItem value="avg">Avg per session</SelectItem>
        </SelectContent>
      </Select>
      <div className="text-sm text-muted-foreground">of</div>
      <Select
        value={view.metric}
        onValueChange={(v) => onChange({ ...view, metric: v as TableMetric })}
      >
        <SelectTrigger className="w-44 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="total_tokens">Total Tokens</SelectItem>
          <SelectItem value="input_tokens">Input Tokens</SelectItem>
          <SelectItem value="output_tokens">Output Tokens</SelectItem>
          <SelectItem value="cache_tokens">Cache Tokens</SelectItem>
          <SelectItem value="sessions">Sessions</SelectItem>
          <SelectItem value="calls">Calls</SelectItem>
          <SelectItem value="cost_usd">Actual Cost</SelectItem>
          <SelectItem value="est_cost_usd">Est. Cost</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground italic">— view auto-saved</span>
    </div>
  )
}

function ModelsTable({
  rows,
  view,
}: {
  rows: ModelRow[]
  view: ViewState
}) {
  const [filter, setFilter] = useState("")
  const metricLabel = getMetricLabel(view.metric, view.aggregate)

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return q ? rows.filter((r) => r.modelID.toLowerCase().includes(q)) : rows
  }, [rows, filter])

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter models…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 pl-8 text-xs w-60"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Model</th>
              <th className="pb-2 pr-4 font-medium">Provider(s)</th>
              <th className="pb-2 pr-3 font-medium text-right">Calls</th>
              <th className="pb-2 pr-3 font-medium text-right">Sessions</th>
              <th className="pb-2 pr-3 font-medium text-right">{metricLabel}</th>
              <th className="pb-2 font-medium text-right">Est. Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                  No models match this filter
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const raw = getRawMetricModel(row, view.metric)
                const value = applyAggregate(raw, row.sessions, view.aggregate, view.metric)
                return (
                  <tr key={row.modelID} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 font-medium">{row.modelID}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {row.providerIDs.join(", ")}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.calls}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.sessions}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">
                      {formatMetricValue(value, view.metric)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {row.isFree
                        ? <span className="text-xs italic">free</span>
                        : row.estimatedCostUsd > 0 ? formatCost(row.estimatedCostUsd) : "—"
                      }
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td colSpan={4} className="pt-2 text-xs text-muted-foreground">
                  {filtered.length} model{filtered.length !== 1 ? "s" : ""}
                </td>
                <td className="pt-2 text-right tabular-nums">
                  {formatMetricValue(
                    filtered.reduce((s, r) => s + applyAggregate(getRawMetricModel(r, view.metric), r.sessions, view.aggregate, view.metric), 0),
                    view.metric
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function ProvidersTable({
  rows,
  view,
}: {
  rows: ProviderSummaryRow[]
  view: ViewState
}) {
  const [filter, setFilter] = useState("")
  const metricLabel = getMetricLabel(view.metric, view.aggregate)

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return q ? rows.filter((r) => r.providerID.toLowerCase().includes(q)) : rows
  }, [rows, filter])

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter providers…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 pl-8 text-xs w-60"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Provider</th>
              <th className="pb-2 pr-4 font-medium text-right">Models</th>
              <th className="pb-2 pr-3 font-medium text-right">Calls</th>
              <th className="pb-2 pr-3 font-medium text-right">Sessions</th>
              <th className="pb-2 pr-3 font-medium text-right">{metricLabel}</th>
              <th className="pb-2 font-medium text-right">Est. Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                  No providers match this filter
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const raw = getRawMetricProvider(row, view.metric)
                const value = applyAggregate(raw, row.sessions, view.aggregate, view.metric)
                return (
                  <tr key={row.providerID} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 font-mono text-xs font-medium">{row.providerID}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{row.modelCount}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.calls}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.sessions}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">
                      {formatMetricValue(value, view.metric)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {row.isFree
                        ? <span className="text-xs italic">free</span>
                        : row.estimatedCostUsd > 0 ? formatCost(row.estimatedCostUsd) : "—"
                      }
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td colSpan={4} className="pt-2 text-xs text-muted-foreground">
                  {filtered.length} provider{filtered.length !== 1 ? "s" : ""}
                </td>
                <td className="pt-2 text-right tabular-nums">
                  {formatMetricValue(
                    filtered.reduce((s, r) => s + applyAggregate(getRawMetricProvider(r, view.metric), r.sessions, view.aggregate, view.metric), 0),
                    view.metric
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d")
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const data = useBillingData(timeRange)
  const { modelGroups } = useOpendoraContext()

  // Restore view from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY)
      if (stored) setView(JSON.parse(stored))
    } catch {}
  }, [])

  // Auto-save view on change
  const handleViewChange = useCallback((v: ViewState) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(v))
    } catch {}
  }, [])

  // Chart configs
  const chartConfig = {
    tokens: { label: "Tokens", color: "var(--color-chart-1)" },
  } satisfies ChartConfig

  const distributionConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {}
    data.distribution.forEach((item, index) => {
      config[item.name] = { label: item.name, color: `var(--color-chart-${(index % 5) + 1})` }
    })
    return config
  }, [data.distribution])

  const distributionWithFill = useMemo(() => {
    return data.distribution.map((item, index) => ({
      ...item,
      fill: `var(--color-chart-${(index % 5) + 1})`,
    }))
  }, [data.distribution])

  const sessionsConfig = {
    sessions: { label: "Sessions", color: "var(--color-chart-2)" },
  } satisfies ChartConfig

  const activityConfig = {
    activity: { label: "Activity", color: "var(--color-chart-3)" },
  } satisfies ChartConfig

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Usage</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Select value={timeRange} onValueChange={(v: TimeRange) => setTimeRange(v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="12m">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <ActivityIcon className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Usage</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Token consumption and costs across all sessions
          </p>
        </div>

        {data.error && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {data.error}
          </div>
        )}

        {/* Overview cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
              <ActivityIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {data.isLoading ? (
                <div className="h-8 w-24 animate-pulse rounded bg-muted" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{formatTokens(data.totalTokens)}</div>
                  <p className="text-xs text-muted-foreground mt-1">including cache</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Sessions</CardTitle>
              <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {data.isLoading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{data.totalSessions}</div>
                  <p className="text-xs text-muted-foreground mt-1">unique sessions</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Daily</CardTitle>
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {data.isLoading ? (
                <div className="h-8 w-20 animate-pulse rounded bg-muted" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{formatTokens(data.avgDailyTokens)}</div>
                  <p className="text-xs text-muted-foreground mt-1">tokens per day</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Week-over-Week</CardTitle>
              {data.weekOverWeek >= 0 ? (
                <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <TrendingDownIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              {data.isLoading ? (
                <div className="h-8 w-20 animate-pulse rounded bg-muted" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {data.weekOverWeek >= 0 ? "+" : ""}{data.weekOverWeek.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">vs previous week</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 mb-8">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Token Usage Over Time</CardTitle>
              <CardDescription>Total tokens consumed per period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {data.isLoading ? (
                  <div className="h-full w-full animate-pulse rounded bg-muted" />
                ) : data.buckets.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No data for this period
                  </div>
                ) : (
                  <ChartContainer config={chartConfig} className="h-full w-full">
                    <AreaChart data={data.buckets}>
                      <defs>
                        <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-tokens)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--color-tokens)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(v) => formatTokens(v)} />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            labelFormatter={(value) => value as string}
                            formatter={(value) => [formatTokens(Number(value)), "Tokens"]}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="tokens"
                        stroke="var(--color-tokens)"
                        fillOpacity={1}
                        fill="url(#colorTokens)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Token Distribution</CardTitle>
              <CardDescription>Breakdown by token type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                {data.isLoading ? (
                  <div className="h-full w-full animate-pulse rounded bg-muted" />
                ) : data.distribution.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No token data for this period
                  </div>
                ) : (
                  <ChartContainer config={distributionConfig} className="h-full w-full">
                    <PieChart>
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Pie data={distributionWithFill} dataKey="value" nameKey="name" innerRadius={60} strokeWidth={5} />
                      <ChartLegend
                        content={<ChartLegendContent nameKey="name" />}
                        className="-translate-y-2 flex-wrap gap-2 *:basis-1/4 *:justify-center"
                      />
                    </PieChart>
                  </ChartContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Sessions</CardTitle>
              <CardDescription>Highest token consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                {data.isLoading ? (
                  <div className="h-full w-full animate-pulse rounded bg-muted" />
                ) : data.topSessions.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No sessions with token data
                  </div>
                ) : (
                  <ChartContainer config={sessionsConfig} className="h-full w-full">
                    <BarChart data={data.topSessions} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(v) => formatTokens(v)} />
                      <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={8} width={120} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                      <Bar dataKey="tokens" fill="var(--color-sessions)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Session Activity</CardTitle>
            <CardDescription>Sessions created per period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              {data.isLoading ? (
                <div className="h-full w-full animate-pulse rounded bg-muted" />
              ) : data.buckets.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No session data for this period
                </div>
              ) : (
                <ChartContainer config={activityConfig} className="h-full w-full">
                  <BarChart data={data.buckets}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value) => value as string}
                          formatter={(value) => [Number(value), "Sessions"]}
                        />
                      }
                    />
                    <Bar dataKey="sessions" fill="var(--color-activity)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* View controls shared by both breakdown tables */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Breakdown</h2>
          <ViewControls view={view} onChange={handleViewChange} />
        </div>

        <div className="grid gap-6 grid-cols-1 xl:grid-cols-2 mb-6">
          {/* Models breakdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CpuIcon className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Models</CardTitle>
                  <CardDescription>Usage aggregated by model across all providers</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {data.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
                </div>
              ) : data.modelRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data for this period.</p>
              ) : (
                <ModelsTable rows={data.modelRows} view={view} />
              )}
            </CardContent>
          </Card>

          {/* Provider breakdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ServerIcon className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Providers</CardTitle>
                  <CardDescription>Usage aggregated by provider across all models</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {data.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
                </div>
              ) : data.providerSummaryRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data for this period.</p>
              ) : (
                <ProvidersTable rows={data.providerSummaryRows} view={view} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quota status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldIcon className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Quota Status</CardTitle>
                <CardDescription>Real-time rate-limit windows per provider</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ProviderUsagePanel modelGroups={modelGroups} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
