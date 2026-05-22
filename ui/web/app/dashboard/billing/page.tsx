"use client"

import { useState, useMemo } from "react"
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
import { TrendingUpIcon, TrendingDownIcon, ActivityIcon, CalendarIcon, MessageSquareIcon, ShieldIcon, DollarSignIcon } from "lucide-react"
import { useBillingData, type TimeRange } from "@/hooks/use-billing-data"
import { ProviderUsagePanel } from "@/components/providers/provider-usage-panel"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"


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

export default function UsagePage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d")
  const data = useBillingData(timeRange)
  const { modelGroups } = useOpendoraContext()

  // Chart configs
  const chartConfig = {
    tokens: {
      label: "Tokens",
      color: "var(--color-chart-1)",
    },
  } satisfies ChartConfig

  const distributionConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {}
    data.distribution.forEach((item, index) => {
      config[item.name] = {
        label: item.name,
        color: `var(--color-chart-${(index % 5) + 1})`,
      }
    })
    return config
  }, [data.distribution])

  // Add fill property to distribution data for pie chart
  const distributionWithFill = useMemo(() => {
    return data.distribution.map((item, index) => ({
      ...item,
      fill: `var(--color-chart-${(index % 5) + 1})`,
    }))
  }, [data.distribution])

  const sessionsConfig = {
    sessions: {
      label: "Sessions",
      color: "var(--color-chart-2)",
    },
  } satisfies ChartConfig

  const activityConfig = {
    activity: {
      label: "Activity",
      color: "var(--color-chart-3)",
    },
  } satisfies ChartConfig

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
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) => value}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(v) => formatTokens(v)}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            labelFormatter={(value, payload) => value as string}
                            formatter={(value: number) => [
                              formatTokens(value),
                              "Tokens",
                            ]}
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
                  <ChartContainer config={distributionConfig} className="h-full w-full">
                    <PieChart>
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent hideLabel />}
                      />
                      <Pie
                        data={distributionWithFill}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        strokeWidth={5}
                      />
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
                  <ChartContainer config={sessionsConfig} className="h-full w-full">
                    <BarChart data={data.topSessions} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(v) => formatTokens(v)}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        width={90}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent />}
                      />
                      <Bar dataKey="tokens" fill="var(--color-sessions)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
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
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) => value}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      allowDecimals={false}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value, payload) => value as string}
                          formatter={(value: number) => [value, "Sessions"]}
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

        {/* Provider / model breakdown */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSignIcon className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Provider Breakdown</CardTitle>
                <CardDescription>Token consumption, costs, and call counts by provider and model</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {data.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : data.providerRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data available for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Provider</th>
                      <th className="pb-2 pr-4 font-medium">Model</th>
                      <th className="pb-2 pr-3 font-medium text-right">Calls</th>
                      <th className="pb-2 pr-3 font-medium text-right">Tokens</th>
                      <th className="pb-2 pr-3 font-medium text-right">Actual Cost</th>
                      <th className="pb-2 font-medium text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.providerRows.map((row) => (
                      <tr key={`${row.providerID}::${row.modelID}`} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{row.providerID}</td>
                        <td className="py-2 pr-4 font-medium">{row.modelID}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.calls}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatTokens(row.totalTokens)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.isFree
                            ? <span className="text-xs text-muted-foreground italic">free</span>
                            : <span>{formatCost(row.costUsd)}</span>
                          }
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {row.estimatedCostUsd > 0 ? formatCost(row.estimatedCostUsd) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-medium">
                      <td colSpan={3} className="pt-2 text-xs text-muted-foreground">Total</td>
                      <td className="pt-2 text-right tabular-nums">{formatTokens(data.totalTokens)}</td>
                      <td className="pt-2 text-right tabular-nums">{formatCost(data.totalCostUsd)}</td>
                      <td className="pt-2 text-right tabular-nums text-muted-foreground">{formatCost(data.totalEstimatedCostUsd)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
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
            <ProviderUsagePanel modelGroups={modelGroups} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
