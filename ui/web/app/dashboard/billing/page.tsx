"use client"

import { useState } from "react"
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
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { TrendingUpIcon, TrendingDownIcon, ActivityIcon, CalendarIcon, MessageSquareIcon, ShieldIcon } from "lucide-react"
import { useBillingData, type TimeRange } from "@/hooks/use-billing-data"
import { ProviderUsagePanel } from "@/components/providers/provider-usage-panel"
import type { Session } from "@/lib/opendora"

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--card-foreground))",
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

type ModelCostRow = {
  providerID: string
  modelID: string
  totalTokens: number
  isFree: boolean
}

function buildCostBreakdown(sessions: Session[]): ModelCostRow[] {
  const map = new Map<string, ModelCostRow>()
  for (const s of sessions) {
    if (!s.tokens || !s.model) continue
    const parts = s.model.split(":")
    const providerID = parts.length >= 2 ? parts[0] : "unknown"
    const modelID = parts.length >= 2 ? parts.slice(1).join(":") : parts[0]
    const key = `${providerID}:${modelID}`
    const total = (s.tokens.input ?? 0) + (s.tokens.output ?? 0) + (s.tokens.cacheRead ?? 0) + (s.tokens.cacheWrite ?? 0)
    const existing = map.get(key)
    if (existing) {
      existing.totalTokens += total
    } else {
      map.set(key, {
        providerID,
        modelID,
        totalTokens: total,
        isFree: providerID === "opencode" || providerID === "fallback",
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalTokens - a.totalTokens)
}

export default function UsagePage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d")
  const data = useBillingData(timeRange)

  return (
    <div className="flex flex-col h-full">
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
          <SelectTrigger className="w-32">
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
            Token consumption across all sessions
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
                  <p className="text-xs text-muted-foreground mt-1">with token data</p>
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
          {/* Usage over time */}
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
                    No session data for this period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.buckets}>
                      <defs>
                        <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" style={{ stopColor: CHART_COLORS[0], stopOpacity: 0.3 }} />
                          <stop offset="95%" style={{ stopColor: CHART_COLORS[0], stopOpacity: 0 }} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatTokens(v)}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number, name: string) => [
                          name === "tokens" ? formatTokens(value) : value,
                          name === "tokens" ? "Tokens" : "Sessions",
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="tokens"
                        stroke={CHART_COLORS[0]}
                        fillOpacity={1}
                        fill="url(#colorTokens)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Token distribution */}
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
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.distribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {data.distribution.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number) => [formatTokens(value), "Tokens"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {!data.isLoading && data.distribution.length > 0 && (
                <div className="flex flex-wrap gap-4 mt-4">
                  {data.distribution.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {item.name}: {formatTokens(item.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top sessions */}
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
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.topSessions} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatTokens(v)}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        width={100}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number) => [formatTokens(value), "Tokens"]}
                      />
                      <Bar dataKey="tokens" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Session activity */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Session Activity</CardTitle>
            <CardDescription>Sessions created per period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {data.isLoading ? (
                <div className="h-full w-full animate-pulse rounded bg-muted" />
              ) : data.buckets.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No session data for this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.buckets}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number) => [value, "Sessions"]}
                    />
                    <Bar dataKey="sessions" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Provider breakdown */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Provider Breakdown</CardTitle>
            <CardDescription>Token consumption grouped by provider and model</CardDescription>
          </CardHeader>
          <CardContent>
            {data.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : (() => {
              const rows = buildCostBreakdown(data.sessions)
              if (rows.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">No model data available for this period.</p>
                )
              }
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Provider</th>
                        <th className="pb-2 pr-4 font-medium">Model</th>
                        <th className="pb-2 pr-4 font-medium text-right">Total Tokens</th>
                        <th className="pb-2 font-medium text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((row) => (
                        <tr key={`${row.providerID}:${row.modelID}`} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{row.providerID}</td>
                          <td className="py-2 pr-4 font-medium">{row.modelID}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{formatTokens(row.totalTokens)}</td>
                          <td className="py-2 text-right">
                            {row.isFree ? (
                              <span className="italic text-muted-foreground">free</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </CardContent>
        </Card>

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
            <ProviderUsagePanel />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
