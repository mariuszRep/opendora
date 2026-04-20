"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useTheme } from "next-themes"
import { BotIcon, MessageSquareIcon, SettingsIcon, ChevronRightIcon, PlugIcon, UserIcon, Volume2Icon, ClockPlusIcon, WrenchIcon, SunIcon, MoonIcon, MonitorIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { AGENT_COLORS } from "@/lib/agent-colors"

export default function SettingsPage() {
  const router = useRouter()
  const { agents, sessions, connectedProviders } = useOpendoraContext()
  const { userName, setUserName, userColor, setUserColor } = useUserProfile()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const settingsCards = [
    {
      title: "Agents",
      description: "Manage your AI agents and their configurations",
      icon: BotIcon,
      href: "/dashboard/settings/agents",
      count: agents.length,
      countLabel: "agents",
    },
    {
      title: "Sessions",
      description: "View and manage all conversation sessions",
      icon: MessageSquareIcon,
      href: "/dashboard/settings/sessions",
      count: sessions.length,
      countLabel: "sessions",
    },
    {
      title: "Providers",
      description: "Connect and manage AI provider integrations",
      icon: PlugIcon,
      href: "/dashboard/settings/providers",
      count: connectedProviders.length,
      countLabel: "connected",
    },
    {
      title: "Tools",
      description: "Configure API keys for web search and code search",
      icon: WrenchIcon,
      href: "/dashboard/settings/tools",
      count: null,
      countLabel: null,
    },
    {
      title: "Voice",
      description: "Configure speech-to-text and text-to-speech",
      icon: Volume2Icon,
      href: "/dashboard/settings/voice",
      count: null,
      countLabel: null,
    },
    {
      title: "Schedules",
      description: "Manage background delegations",
      icon: ClockPlusIcon,
      href: "/dashboard/settings/schedules",
      count: null,
      countLabel: null,
    },
  ]

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
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <SettingsIcon className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">Settings</h1>
            </div>
            <p className="text-muted-foreground text-lg">
              Manage your OpenDora configuration and preferences
            </p>
          </div>

          {/* Profile */}
          <div className="mb-8 max-w-sm">
            <div className="flex items-center gap-2 mb-3">
              <UserIcon className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Profile</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-name">Your name</Label>
                <Input
                  id="user-name"
                  placeholder="e.g. Alex"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Agents will see <code className="font-mono">user: {userName || "your name"}</code> at the start of every message you send.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Your color</Label>
                <div className="flex flex-wrap gap-2">
                  {AGENT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      title={c.label}
                      onClick={() => setUserColor(c.id)}
                      className="size-6 rounded-full transition-all"
                      style={{
                        backgroundColor: c.hex,
                        outline: userColor === c.id ? `2px solid ${c.hex}` : undefined,
                        outlineOffset: userColor === c.id ? "2px" : undefined,
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Used as the ring color on your messages.</p>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="mb-8 max-w-sm">
            <div className="flex items-center gap-2 mb-3">
              <SunIcon className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Appearance</h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              {mounted && (
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger id="theme">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <div className="flex items-center gap-2">
                        <SunIcon className="h-4 w-4" />
                        <span>Light</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="dark">
                      <div className="flex items-center gap-2">
                        <MoonIcon className="h-4 w-4" />
                        <span>Dark</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="system">
                      <div className="flex items-center gap-2">
                        <MonitorIcon className="h-4 w-4" />
                        <span>System</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Select your preferred color scheme for the interface.
              </p>
            </div>
          </div>

          {/* Settings Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-5xl">
            {settingsCards.map((card) => {
              const Icon = card.icon
              return (
                <Card
                  key={card.href}
                  className="hover:shadow-lg transition-all cursor-pointer group border-2 hover:border-primary/50"
                  onClick={() => router.push(card.href)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-3 rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <ChevronRightIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <CardTitle className="text-xl">{card.title}</CardTitle>
                    <CardDescription className="text-sm">
                      {card.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {card.count !== null && card.countLabel !== null ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-primary">
                          {card.count}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {card.countLabel}
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Manage voice settings
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
