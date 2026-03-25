"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { SettingsIcon, PlusIcon, EditIcon, StarIcon, BotIcon, EyeIcon, EyeOffIcon } from "lucide-react"

// AgentCard component for displaying individual agents
function AgentCard({ agent, sessionCount, router }: {
  agent: any
  sessionCount: number
  router: any
}) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group">
      <CardHeader className="pb-2 p-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: agent.color || "#6366f1" }}
            />
            <CardTitle className="capitalize text-sm truncate">
              {agent.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {agent.hidden && (
              <EyeOffIcon className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
        {agent.description && (
          <CardDescription className="line-clamp-2 text-xs mt-1">
            {agent.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-5">
            {agent.mode || "all"}
          </Badge>
          <span className="text-xs">{sessionCount} sessions</span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() =>
              router.push(`/dashboard/agents/${(agent as any)._id || agent.name}`)
            }
          >
            <EditIcon className="mr-1 h-2.5 w-2.5" />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function SettingsAgentsPage() {
  const router = useRouter()
  const { allAgents, sessions } = useOpendoraContext()
  const [searchQuery, setSearchQuery] = useState("")

  // Get all agents including hidden ones
  const agents = allAgents

  const filteredAgents = useMemo(() => {
    if (!searchQuery) return agents
    const query = searchQuery.toLowerCase()
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        (agent.description && agent.description.toLowerCase().includes(query)) ||
        (agent.mode && agent.mode.toLowerCase().includes(query))
    )
  }, [agents, searchQuery])

  // Group agents by mode
  const agentsByMode = useMemo(() => {
    const groups = {
      primary: filteredAgents.filter(a => a.mode === 'primary'),
      worker: filteredAgents.filter(a => a.mode === 'worker' || a.mode === 'subagent'),
      system: filteredAgents.filter(a => a.mode === 'system'),
      all: filteredAgents.filter(a => a.mode === 'all' || !a.mode),
    }
    return groups
  }, [filteredAgents])

  const getSessionCount = (agentId: string) => {
    return sessions.filter((session) => session.agentID === agentId).length
  }

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
              <BreadcrumbLink href="/dashboard/settings">Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Agents</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Button onClick={() => router.push("/dashboard/agents/new")}>
          <PlusIcon className="mr-2 h-4 w-4" />
          New Agent
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Agents</h1>
            <p className="text-muted-foreground">
              Manage your AI agents and their configurations
            </p>
          </div>

          {/* Search */}
          <div className="mb-6">
            <Input
              placeholder="Search agents by name, description, or mode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>

          {/* Agents Grid - Grouped by Mode */}
          {filteredAgents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BotIcon className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchQuery ? "No agents found" : "No agents yet"}
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  {searchQuery
                    ? "Try adjusting your search terms"
                    : "Create your first AI agent to get started"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => router.push("/dashboard/agents/new")}>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Create Agent
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {/* Primary Agents */}
              {agentsByMode.primary.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Primary Agents</h2>
                    <Badge variant="secondary">{agentsByMode.primary.length}</Badge>
                  </div>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {agentsByMode.primary.map((agent) => (
                      <AgentCard
                        key={agent.name}
                        agent={agent}
                        sessionCount={getSessionCount((agent as any)._id || agent.name)}
                        router={router}
                      />
                    ))}
                  </div>
                </div>
              )}

              {agentsByMode.primary.length > 0 && agentsByMode.worker.length > 0 && (
                <Separator />
              )}

              {/* Workers */}
              {agentsByMode.worker.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">Workers</h2>
                    <Badge variant="secondary">{agentsByMode.worker.length}</Badge>
                  </div>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {agentsByMode.worker.map((agent) => (
                      <AgentCard
                        key={agent.name}
                        agent={agent}
                        sessionCount={getSessionCount((agent as any)._id || agent.name)}
                        router={router}
                      />
                    ))}
                  </div>
                </div>
              )}

              {agentsByMode.worker.length > 0 && agentsByMode.system.length > 0 && (
                <Separator />
              )}

              {/* System Agents */}
              {agentsByMode.system.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">System Agents</h2>
                    <Badge variant="secondary">{agentsByMode.system.length}</Badge>
                  </div>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {agentsByMode.system.map((agent) => (
                      <AgentCard
                        key={agent.name}
                        agent={agent}
                        sessionCount={getSessionCount((agent as any)._id || agent.name)}
                        router={router}
                      />
                    ))}
                  </div>
                </div>
              )}

              {agentsByMode.system.length > 0 && agentsByMode.all.length > 0 && (
                <Separator />
              )}

              {/* All Mode Agents */}
              {agentsByMode.all.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold">All Mode Agents</h2>
                    <Badge variant="secondary">{agentsByMode.all.length}</Badge>
                  </div>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {agentsByMode.all.map((agent) => (
                      <AgentCard
                        key={agent.name}
                        agent={agent}
                        sessionCount={getSessionCount((agent as any)._id || agent.name)}
                        router={router}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
