"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { DollarSignIcon, TrendingUpIcon, TrendingDownIcon, CreditCardIcon, ActivityIcon, CalendarIcon } from "lucide-react"

type TimeRange = "7d" | "30d" | "90d" | "12m"

const USAGE_DATA = {
  "7d": [
    { date: "Mon", tokens: 42000, cost: 1.26 },
    { date: "Tue", tokens: 38500, cost: 1.16 },
    { date: "Wed", tokens: 51200, cost: 1.54 },
    { date: "Thu", tokens: 45800, cost: 1.37 },
    { date: "Fri", tokens: 62300, cost: 1.87 },
    { date: "Sat", tokens: 28100, cost: 0.84 },
    { date: "Sun", tokens: 19400, cost: 0.58 },
  ],
  "30d": [
    { date: "Week 1", tokens: 285000, cost: 8.55 },
    { date: "Week 2", tokens: 312000, cost: 9.36 },
    { date: "Week 3", tokens: 298000, cost: 8.94 },
    { date: "Week 4", tokens: 356000, cost: 10.68 },
  ],
  "90d": [
    { date: "Jan", tokens: 1250000, cost: 37.5 },
    { date: "Feb", tokens: 1180000, cost: 35.4 },
    { date: "Mar", tokens: 1420000, cost: 42.6 },
  ],
  "12m": [
    { date: "May", tokens: 4200000, cost: 126.0 },
    { date: "Jun", tokens: 3850000, cost: 115.5 },
    { date: "Jul", tokens: 4100000, cost: 123.0 },
    { date: "Aug", tokens: 3920000, cost: 117.6 },
    { date: "Sep", tokens: 4450000, cost: 133.5 },
    { date: "Oct", tokens: 4680000, cost: 140.4 },
    { date: "Nov", tokens: 5120000, cost: 153.6 },
    { date: "Dec", tokens: 4950000, cost: 148.5 },
    { date: "Jan", tokens: 4780000, cost: 143.4 },
    { date: "Feb", tokens: 4250000, cost: 127.5 },
    { date: "Mar", tokens: 4580000, cost: 137.4 },
    { date: "Apr", tokens: 4890000, cost: 146.7 },
  ],
}

const COST_BREAKDOWN = [
  { name: "GPT-4o", value: 45, cost: 68.5 },
  { name: "Claude 3.5", value: 28, cost: 42.6 },
  { name: "Gemini Pro", value: 18, cost: 27.4 },
  { name: "Other", value: 9, cost: 13.7 },
]

const PLAN_USAGE = [
  { name: "GPT-4o", used: 450000, limit: 500000 },
  { name: "Claude 3.5", used: 280000, limit: 500000 },
  { name: "Gemini Pro", used: 180000, limit: 500000 },
]

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"]

export default function BillingPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d")

  const usageData = USAGE_DATA[timeRange]
  const totalTokens = usageData.reduce((sum, d) => sum + d.tokens, 0)
  const totalCost = usageData.reduce((sum, d) => sum + d.cost, 0)
  const avgDaily = totalCost / usageData.length

  // Calculate trends
  const lastWeek = USAGE_DATA["7d"]
  const prevLastWeek = USAGE_DATA["7d"].slice(0, -1)
  const currentWeekCost = lastWeek.reduce((sum, d) => sum + d.cost, 0)
  const prevWeekCost = prevLastWeek.reduce((sum, d) => sum + d.cost, 0)
  const costTrend = ((currentWeekCost - prevWeekCost) / prevWeekCost) * 100

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
              <BreadcrumbPage>Billing</BreadcrumbPage>
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <CreditCardIcon className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Billing & Usage</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Track your API usage and manage billing
          </p>
        </div>

        {/* Overview cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Spent
              </CardTitle>
              <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {timeRange === "7d" ? "This week" : timeRange === "30d" ? "This month" : timeRange === "90d" ? "This quarter" : "This year"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tokens Used
              </CardTitle>
              <ActivityIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(totalTokens / 1000).toFixed(1)}k</div>
              <p className="text-xs text-muted-foreground mt-1">
                {(totalTokens / 1000000).toFixed(2)}M total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Daily Cost
              </CardTitle>
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${avgDaily.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                per day average
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Week-over-Week
              </CardTitle>
              {costTrend >= 0 ? (
                <TrendingUpIcon className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingDownIcon className="h-4 w-4 text-green-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${costTrend >= 0 ? "text-red-500" : "text-green-500"}`}>
                {costTrend >= 0 ? "+" : ""}{costTrend.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                vs previous week
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 mb-8">
          {/* Usage over time */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Usage Over Time</CardTitle>
              <CardDescription>Token consumption and costs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usageData}>
                    <defs>
                      <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number, name: string) => [
                        name === "tokens" ? `${value.toLocaleString()} tokens` : `$${value.toFixed(2)}`,
                        name === "tokens" ? "Tokens" : "Cost",
                      ]}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="tokens"
                      stroke="#3b82f6"
                      fillOpacity={1}
                      fill="url(#colorTokens)"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cost"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Cost breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Model</CardTitle>
              <CardDescription>Distribution of spending</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={COST_BREAKDOWN}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {COST_BREAKDOWN.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`$${COST_BREAKDOWN.find((c) => c.value === value)?.cost.toFixed(2)}`, "Cost"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-4 mt-4">
                {COST_BREAKDOWN.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {item.name}: ${item.cost.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Plan usage */}
          <Card>
            <CardHeader>
              <CardTitle>Plan Limits</CardTitle>
              <CardDescription>Monthly token allowance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={PLAN_USAGE} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`${value.toLocaleString()} tokens`, "Used"]}
                    />
                    <Bar dataKey="used" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="limit" fill="#e5e7eb" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Line chart for costs */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Costs</CardTitle>
            <CardDescription>Spending over selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={usageData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: "#10b981", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}