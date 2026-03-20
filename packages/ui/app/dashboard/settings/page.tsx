"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { BotIcon, MessageSquareIcon, SettingsIcon, ChevronRightIcon, PlugIcon, Volume2Icon, CalendarClockIcon } from "lucide-react"

export default function SettingsPage() {
  const router = useRouter()
  const { agents, sessions, connectedProviders } = useOpendoraContext()

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
      icon: CalendarClockIcon,
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
