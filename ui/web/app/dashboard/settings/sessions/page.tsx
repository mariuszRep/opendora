"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { MessageSquareIcon, SearchIcon, CalendarIcon } from "lucide-react"

function formatSessionTitle(session: { title?: string; time: { created: number } }): string {
  if (session.title && !session.title.startsWith("New session")) return session.title
  return new Date(session.time.created).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function SettingsSessionsPage() {
  const router = useRouter()
  const { sessions, agents, selectSession } = useOpendoraContext()
  const [searchQuery, setSearchQuery] = useState("")

  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions
    const query = searchQuery.toLowerCase()
    return sessions.filter((session) => {
      const title = formatSessionTitle(session).toLowerCase()
      const agentName = agents.find((a) => (a as any)._id === session.agentID || a.name === session.agentID)?.name || ""
      return title.includes(query) || agentName.toLowerCase().includes(query)
    })
  }, [sessions, searchQuery, agents])

  const getAgentName = (agentID: string) => {
    const agent = agents.find((a) => (a as any)._id === agentID || a.name === agentID)
    return agent?.name || agentID
  }

  const getAgentColor = (agentID: string) => {
    const agent = agents.find((a) => (a as any)._id === agentID || a.name === agentID)
    return agent?.color || "#6366f1"
  }

  return (
    <SettingsPageLayout title="Sessions">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Sessions</h1>
        <p className="text-muted-foreground">
          View and manage all conversation sessions across agents
        </p>
      </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions by title or agent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Sessions Table */}
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
              <MessageSquareIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery ? "No sessions found" : "No sessions yet"}
              </h3>
              <p className="text-muted-foreground text-center">
                {searchQuery
                  ? "Try adjusting your search terms"
                  : "Sessions will appear here as you create them"}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map((session) => {
                    const isMain = session.sessionType === "role"
                    const agentName = getAgentName(session.agentID || "")
                    const agentColor = getAgentColor(session.agentID || "")
                    const createdDate = new Date(session.time.created)
                    
                    return (
                      <TableRow key={session.id} className="hover:bg-muted/50">
                        <TableCell>
                          <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatSessionTitle(session)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: agentColor }}
                            />
                            <span className="capitalize">{agentName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isMain ? (
                            <Badge variant="default" className="text-xs">
                              Main
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Standard
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <CalendarIcon className="h-3 w-3" />
                            {createdDate.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {" "}
                            {createdDate.toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (session.id) {
                                selectSession(session.id)
                                router.push("/dashboard")
                              }
                            }}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

      {/* Stats */}
      {filteredSessions.length > 0 && (
        <div className="mt-4 text-sm text-muted-foreground">
          Showing {filteredSessions.length} of {sessions.length} sessions
        </div>
      )}
    </SettingsPageLayout>
  )
}
