"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { DataTable } from "@/components/ui/data-table"
import { Switch } from "@/components/ui/switch"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import { opendora } from "@/lib/projectflows"
import { createSessionColumns, type SessionRow } from "./columns"
import { useSessionTreeSettings } from "@/hooks/use-session-tree-settings"
import { MessageSquareIcon, SearchIcon, Trash2Icon, Loader2Icon } from "lucide-react"

function SessionTreeSettingsCard() {
  const { settings, updateSettings } = useSessionTreeSettings()
  const [savingKey, setSavingKey] = useState<"exclusiveExpand" | "autoExpandActiveSessions" | null>(null)

  async function handleToggle(key: "exclusiveExpand" | "autoExpandActiveSessions", value: boolean) {
    setSavingKey(key)
    try {
      updateSettings({ [key]: value })
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center justify-between px-4 py-3 border rounded-lg">
        <div>
          <div className="text-sm font-medium">Exclusive expand</div>
          <div className="text-xs text-muted-foreground">
            Expanding a session collapses every other branch, so only one path from a top-level session down to your selection is open at a time.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savingKey === "exclusiveExpand" && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={settings.exclusiveExpand}
            disabled={savingKey === "exclusiveExpand"}
            onCheckedChange={(v) => handleToggle("exclusiveExpand", v)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border rounded-lg">
        <div>
          <div className="text-sm font-medium">Auto-expand active sessions</div>
          <div className="text-xs text-muted-foreground">
            Automatically open the branch leading to a currently running session, even if you&apos;ve expanded a different one.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savingKey === "autoExpandActiveSessions" && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={settings.autoExpandActiveSessions}
            disabled={savingKey === "autoExpandActiveSessions"}
            onCheckedChange={(v) => handleToggle("autoExpandActiveSessions", v)}
          />
        </div>
      </div>
    </div>
  )
}

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

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const rows = useMemo<SessionRow[]>(
    () =>
      sessions.map((session) => {
        const agent = agents.find(
          (a) => (a as any)._id === session.agentID || a.name === session.agentID,
        )
        return {
          id: session.id ?? "",
          title: formatSessionTitle(session),
          agentID: session.agentID ?? "",
          agentName: agent?.name ?? (session.agentID || ""),
          agentColor: agent?.color ?? "#6366f1",
          sessionType: session.sessionType ?? "standard",
          created: session.time.created,
        }
      }),
    [sessions, agents],
  )

  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>()
    let hasBlank = false
    for (const row of rows) {
      if (!row.agentID) hasBlank = true
      else if (!seen.has(row.agentID)) seen.set(row.agentID, row.agentName)
    }
    const options = Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
    if (hasBlank) options.unshift({ id: "__none__", name: "(No agent)" })
    return options
  }, [rows])

  function handleOpenSession(id: string) {
    selectSession(id)
    router.push("/dashboard")
  }

  const columns = useMemo(() => createSessionColumns(handleOpenSession), [])

  async function handleBulkDelete() {
    setDeleting(true)
    setDeleteError(null)
    const failed: string[] = []
    let queuedMessagesDiscarded = 0
    await Promise.all(
      pendingDeleteIds.map(async (id) => {
        try {
          const result = await opendora.session.delete(id)
          queuedMessagesDiscarded += result.queuedMessagesDiscarded
        } catch {
          failed.push(id)
        }
      }),
    )
    setDeleting(false)
    if (failed.length > 0) {
      setDeleteError(`Failed to delete ${failed.length} session(s)`)
      setShowDeleteConfirm(false)
      return
    }
    setShowDeleteConfirm(false)
    if (queuedMessagesDiscarded > 0) {
      toast.warning(
        `${queuedMessagesDiscarded} queued message${queuedMessagesDiscarded > 1 ? "s were" : " was"} not sent — the session(s) were deleted before they could be processed.`,
      )
      setTimeout(() => window.location.reload(), 1500)
    } else {
      window.location.reload()
    }
  }

  return (
    <SettingsPageLayout title="Sessions">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Sessions</h1>
        <p className="text-muted-foreground">
          View and manage all conversation sessions across agents
        </p>
      </div>

      <SessionTreeSettingsCard />

      {deleteError && (
        <div className="mb-4 text-sm text-destructive">{deleteError}</div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        initialSorting={[{ id: "created", desc: true }]}
        toolbar={(table) => {
          const selectedRows = table.getFilteredSelectedRowModel().rows
          return (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative max-w-xs flex-1 min-w-[180px]">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title or agent..."
                  value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
                  onChange={(e) =>
                    table.getColumn("title")?.setFilterValue(e.target.value)
                  }
                  className="pl-9"
                />
              </div>

              <Select
                value={(table.getColumn("agentID")?.getFilterValue() as string) ?? ""}
                onValueChange={(val) =>
                  table.getColumn("agentID")?.setFilterValue(val === "_all" ? "" : val)
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All agents</SelectItem>
                  {agentOptions.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <span className="capitalize">{agent.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedRows.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleting}
                  onClick={() => {
                    setPendingDeleteIds(selectedRows.map((r) => r.original.id))
                    setShowDeleteConfirm(true)
                  }}
                >
                  <Trash2Icon className="mr-1.5 size-3.5" />
                  Delete {selectedRows.length} selected
                </Button>
              )}
            </div>
          )
        }}
        footer={(table) => {
          const filtered = table.getFilteredRowModel().rows.length
          const selected = table.getFilteredSelectedRowModel().rows.length
          return (
            <div className="text-sm text-muted-foreground">
              Showing {filtered} of {rows.length} sessions
              {selected > 0 && ` • ${selected} selected`}
            </div>
          )
        }}
        emptyState={
          <div className="flex flex-col items-center justify-center py-8">
            <MessageSquareIcon className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No sessions found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your search or filter
            </p>
          </div>
        }
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDeleteIds.length} session(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected sessions and all their messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleBulkDelete()
              }}
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
