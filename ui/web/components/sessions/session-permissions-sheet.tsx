"use client"

import { useEffect, useState } from "react"
import { Loader2Icon, ShieldIcon, Trash2Icon, PlusIcon, FolderIcon, TerminalIcon, GlobeIcon, FileIcon, FilePenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Session, PermissionRule } from "@/lib/opendora"
import { opendora } from "@/lib/opendora"

interface SessionPermissionsSheetProps {
  session: Session | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Scope = "session" | "global"

type UnifiedRule = {
  scope: Scope
  permission: string
  pattern: string
  action: PermissionRule["action"]
}

export function SessionPermissionsSheet({ session, open, onOpenChange }: SessionPermissionsSheetProps) {
  const [permissions, setPermissions] = useState<PermissionRule[]>([])
  const [sessionData, setSessionData] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newRule, setNewRule] = useState<{
    scope: Scope
    permission: string
    pattern: string
    action: PermissionRule["action"]
  }>({ scope: "session", permission: "path.write", pattern: "", action: "allow" })
  const [adding, setAdding] = useState(false)

  // Load approved permissions and session when sheet opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    Promise.all([
      opendora.permission.listApproved(),
      session ? opendora.session.list() : Promise.resolve([]),
    ])
      .then(([approved, sessions]) => {
        setPermissions(approved)
        if (session) {
          const updated = sessions.find((s) => s.id === session.id)
          setSessionData(updated ?? session)
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load permissions")
      })
      .finally(() => setLoading(false))
  }, [open, session])

  const refresh = async () => {
    setError(null)
    try {
      const [approved, sessions] = await Promise.all([
        opendora.permission.listApproved(),
        session ? opendora.session.list() : Promise.resolve([]),
      ])
      setPermissions(approved)
      if (session) {
        const updated = sessions.find((s) => s.id === session.id)
        setSessionData(updated ?? session)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh")
    }
  }

  const handleRemove = async (rule: UnifiedRule) => {
    try {
      if (rule.scope === "global") {
        await opendora.permission.removeRule({ permission: rule.permission, pattern: rule.pattern })
      } else {
        // Session-specific: clear the corresponding path field
        if (!sessionData) return
        if (rule.permission === "path.write") {
          await opendora.session.update(sessionData.id, { path: null })
        } else if (rule.permission === "path.read") {
          await opendora.session.update(sessionData.id, { readPath: null })
        }
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove permission")
    }
  }

  const handleAdd = async () => {
    if (!newRule.permission || !newRule.pattern) return
    setAdding(true)
    setError(null)
    try {
      if (newRule.scope === "global") {
        await opendora.permission.addRule({
          permission: newRule.permission,
          pattern: newRule.pattern,
          action: newRule.action,
        })
      } else {
        // Session-specific: only path.write and path.read supported
        if (!sessionData) throw new Error("No session selected")
        if (newRule.permission === "path.write") {
          await opendora.session.update(sessionData.id, { path: newRule.pattern })
        } else if (newRule.permission === "path.read") {
          await opendora.session.update(sessionData.id, { readPath: newRule.pattern })
        } else {
          throw new Error("Session-specific permissions only support path.write and path.read")
        }
      }
      setAddDialogOpen(false)
      setNewRule({ scope: "session", permission: "path.write", pattern: "", action: "allow" })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add permission")
    } finally {
      setAdding(false)
    }
  }

  // Build unified list of rules
  const unifiedRules: UnifiedRule[] = []

  // Add session-specific path rules
  if (sessionData?.path) {
    unifiedRules.push({ scope: "session", permission: "path.write", pattern: sessionData.path, action: "allow" })
  }
  if (sessionData?.readPath) {
    unifiedRules.push({ scope: "session", permission: "path.read", pattern: sessionData.readPath, action: "allow" })
  }
  // Add global permission rules
  for (const p of permissions) {
    unifiedRules.push({ scope: "global", permission: p.permission, pattern: p.pattern, action: p.action })
  }

  // Get icon and label for permission type
  const getPermissionMeta = (permission: string) => {
    if (permission === "path.write") return { icon: FilePenIcon, label: "Write" }
    if (permission === "path.read") return { icon: FileIcon, label: "Read" }
    if (permission === "bash" || permission === "shell") return { icon: TerminalIcon, label: "Shell" }
    if (permission === "external_directory") return { icon: FolderIcon, label: "External" }
    if (permission === "network") return { icon: GlobeIcon, label: "Network" }
    return { icon: ShieldIcon, label: permission }
  }

  const getActionBadge = (action: PermissionRule["action"]) => {
    switch (action) {
      case "allow":
        return <Badge variant="default">Allow</Badge>
      case "deny":
        return <Badge variant="destructive">Deny</Badge>
      case "ask":
        return <Badge variant="secondary">Ask</Badge>
    }
  }

  const permissionOptions = [
    { value: "path.write", label: "File Write" },
    { value: "path.read", label: "File Read" },
    { value: "bash", label: "Shell Command" },
    { value: "external_directory", label: "External Directory" },
    { value: "network", label: "Network Access" },
  ]

  // For session scope, only path.write/path.read make sense
  const sessionPermissionOptions = permissionOptions.filter((p) => p.value === "path.write" || p.value === "path.read")
  const availableOptions = newRule.scope === "session" ? sessionPermissionOptions : permissionOptions

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Permissions</SheetTitle>
            <SheetDescription className="sr-only">View and manage permissions for this session and project</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col flex-1 min-h-0">
            {error && (
              <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md mx-6 mt-4">
                {error}
              </div>
            )}

            <div className="px-6 pb-3 shrink-0">
              <Button size="sm" className="w-full" onClick={() => setAddDialogOpen(true)}>
                <PlusIcon className="mr-1.5 size-3.5" />
                Add Permission Rule
              </Button>
            </div>

            <div className="flex flex-col gap-2 px-6 flex-1 overflow-y-auto pb-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : unifiedRules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ShieldIcon className="size-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No permissions yet. Add one manually or approve a request from the AI assistant.
                  </p>
                </div>
              ) : (
                unifiedRules.map((rule, idx) => {
                  const { icon: Icon, label } = getPermissionMeta(rule.permission)
                  return (
                    <div
                      key={`${rule.scope}-${rule.permission}-${rule.pattern}-${idx}`}
                      className="flex items-start gap-3 p-3 border rounded-md bg-card hover:bg-accent transition-colors"
                    >
                      <div className="mt-0.5 text-muted-foreground">
                        <Icon className="size-5" />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{label}</span>
                          {getActionBadge(rule.action)}
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {rule.scope}
                          </Badge>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground break-all">{rule.pattern}</span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() => handleRemove(rule)}
                        title="Remove"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t shrink-0">
            <p className="text-[11px] text-muted-foreground">
              <strong>Session</strong> permissions apply only to this session (inherited by children). <strong>Global</strong> permissions apply to all sessions in the project.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Permission Rule</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label>Scope</Label>
              <Select
                value={newRule.scope}
                onValueChange={(value: Scope) => {
                  // If switching to session scope, ensure permission is path-related
                  const nextPerm = value === "session" && !["path.write", "path.read"].includes(newRule.permission)
                    ? "path.write"
                    : newRule.permission
                  setNewRule({ ...newRule, scope: value, permission: nextPerm })
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="session" disabled={!sessionData}>
                    Session — only this session
                  </SelectItem>
                  <SelectItem value="global">Global — all sessions in project</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="permission">Permission Type</Label>
              <Select
                value={newRule.permission}
                onValueChange={(value) => setNewRule({ ...newRule, permission: value })}
              >
                <SelectTrigger id="permission"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableOptions.map((perm) => (
                    <SelectItem key={perm.value} value={perm.value}>
                      {perm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newRule.scope === "session" && (
                <p className="text-[11px] text-muted-foreground">
                  Session scope only supports path.write and path.read.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="pattern">Pattern</Label>
              <Input
                id="pattern"
                value={newRule.pattern}
                onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                placeholder="e.g., /home/user/project/* or *"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Use * as wildcard. For paths, use absolute paths or patterns like /home/user/project/*
              </p>
            </div>

            {newRule.scope === "global" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="action">Action</Label>
                <Select
                  value={newRule.action}
                  onValueChange={(value: "allow" | "deny" | "ask") => setNewRule({ ...newRule, action: value })}
                >
                  <SelectTrigger id="action"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Allow — Always permit</SelectItem>
                    <SelectItem value="deny">Deny — Always block</SelectItem>
                    <SelectItem value="ask">Ask — Prompt for approval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding || !newRule.permission || !newRule.pattern}>
              {adding && <Loader2Icon className="mr-2 size-3.5 animate-spin" />}
              Add Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
