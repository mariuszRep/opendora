"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { SettingsIcon, PlusIcon, EditIcon, StarIcon, BotIcon } from "lucide-react"

export default function SettingsAgentsPage() {
  const router = useRouter()
  const { agents, sessions } = useOpendoraContext()
  const [searchQuery, setSearchQuery] = useState("")

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

          {/* Agents Grid */}
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAgents.map((agent) => {
                const sessionCount = getSessionCount((agent as any)._id || agent.name)
                return (
                  <Card key={agent.name} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: agent.color || "#6366f1" }}
                          />
                          <CardTitle className="capitalize text-lg">
                            {agent.name}
                          </CardTitle>
                        </div>
                        {agent.hidden && (
                          <Badge variant="secondary" className="text-xs">
                            Hidden
                          </Badge>
                        )}
                      </div>
                      {agent.description && (
                        <CardDescription className="line-clamp-2">
                          {agent.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                        <span className="capitalize">{agent.mode || "all"}</span>
                        <span>{sessionCount} sessions</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() =>
                            router.push(`/dashboard/agents/${(agent as any)._id || agent.name}`)
                          }
                        >
                          <EditIcon className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => router.push(`/dashboard/agents/${(agent as any)._id || agent.name}`)}
                        >
                          <SettingsIcon className="mr-1 h-3 w-3" />
                          Settings
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
