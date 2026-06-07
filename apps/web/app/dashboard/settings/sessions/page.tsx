"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { opendora } from "@/lib/opendora"
import { MessageSquareIcon, SearchIcon, CalendarIcon, Trash2Icon, Loader2Icon } from "lucide-react"

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allVisibleSelected =
    filteredSessions.length > 0 &&
    filteredSessions.every((s) => s.id && selectedIds.has(s.id))
  const someVisibleSelected =
    filteredSessions.some((s) => s.id && selectedIds.has(s.id)) && !allVisibleSelected

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const s of filteredSessions) if (s.id) next.delete(s.id)
      } else {
        for (const s of filteredSessions) if (s.id) next.add(s.id)
      }
      return next
    })
  }

  async function handleBulkDelete() {
    setDeleting(true)
    setDeleteError(null)
    const ids = Array.from(selectedIds)
    const failed: string[] = []
    await Promise.all(
      ids.map(async (id) => {
        try {
          await opendora.session.delete(id)
        } catch {
          failed.push(id)
        }
      }),
    )
    setDeleting(false)
    if (failed.length > 0) {
      setDeleteError(`Failed to delete ${failed.length} session(s)`)
      setSelectedIds(new Set(failed))
      setShowDeleteConfirm(false)
      return
    }
    setSelectedIds(new Set())
    setShowDeleteConfirm(false)
    window.location.reload()
  }

  return (
    <SettingsPageLayout title="Sessions">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Sessions</h1>
        <p className="text-muted-foreground">
          View and manage all conversation sessions across agents
        </p>
      </div>

          {/* Search + bulk actions */}
          <div className="mb-6 flex items-center gap-3">
            <div className="relative max-w-md flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions by title or agent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
              >
                <Trash2Icon className="mr-1.5 size-3.5" />
                Delete {selectedIds.size} selected
              </Button>
            )}
          </div>
          {deleteError && (
            <div className="mb-4 text-sm text-destructive">{deleteError}</div>
          )}

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
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
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
                      <TableRow key={session.id} className="hover:bg-muted/50" data-state={session.id && selectedIds.has(session.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={session.id ? selectedIds.has(session.id) : false}
                            onCheckedChange={() => session.id && toggleSelect(session.id)}
                            aria-label={`Select ${formatSessionTitle(session)}`}
                          />
                        </TableCell>
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
          {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
        </div>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} session(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected sessions and all their messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkDelete() }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageLayout>
  )
}
