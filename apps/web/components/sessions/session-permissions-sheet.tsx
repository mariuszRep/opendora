"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Loader2Icon,
  ShieldIcon,
  Trash2Icon,
  PlusIcon,
  FolderIcon,
  TerminalIcon,
  GlobeIcon,
  FileIcon,
  BotIcon,
  WrenchIcon,
  SparklesIcon,
} from "lucide-react"
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
  /** Call this to trigger a refresh from outside (e.g. on permission.rules.updated event). */
  refreshRef?: React.MutableRefObject<(() => void) | null>
}

type ScopedRule = PermissionRule & { _scope: "session" | "agent" }

type NewRule = {
  scope: "session" | "agent"
  resource: string
  access: "read" | "write" | "execute" | "*"
  pattern: string
  action: "allow" | "deny" | "ask"
}

const RESOURCE_OPTIONS = [
  { value: "bash", label: "Shell command", icon: TerminalIcon },
  { value: "file", label: "File", icon: FileIcon },
  { value: "directory", label: "Directory", icon: FolderIcon },
  { value: "network", label: "Network", icon: GlobeIcon },
  { value: "tool", label: "Tool", icon: WrenchIcon },
  { value: "agent", label: "Agent", icon: BotIcon },
  { value: "skill", label: "Skill", icon: SparklesIcon },
]

const ACCESS_OPTIONS = [
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "execute", label: "Execute" },
  { value: "*", label: "Any" },
]

function resourceMeta(resource: string) {
  const found = RESOURCE_OPTIONS.find((r) => r.value === resource)
  return found ?? { value: resource, label: resource, icon: ShieldIcon }
}

function scopeBadge(scope: "session" | "agent") {
  return (
    <Badge variant="outline" className="text-[10px] capitalize">
      {scope}
    </Badge>
  )
}

function actionBadge(action: PermissionRule["action"]) {
  if (action === "allow") return <Badge variant="default">Allow</Badge>
  if (action === "deny") return <Badge variant="destructive">Deny</Badge>
  return <Badge variant="secondary">Ask</Badge>
}

export function SessionPermissionsSheet({
  session,
  open,
  onOpenChange,
  refreshRef,
}: SessionPermissionsSheetProps) {
  const [rules, setRules] = useState<ScopedRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newRule, setNewRule] = useState<NewRule>({
    scope: "session",
    resource: "bash",
    access: "execute",
    pattern: "*",
    action: "allow",
  })
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(async () => {
    if (!session) return
    setError(null)
    try {
      const [sessionRules, agentRules] = await Promise.all([
        opendora.permission.listRules("session", session.id),
        session.agentID
          ? opendora.permission.listRules("agent", session.agentID)
          : Promise.resolve([]),
      ])
      setRules([
        ...sessionRules.map((r) => ({ ...r, _scope: "session" as const })),
        ...agentRules.map((r) => ({ ...r, _scope: "agent" as const })),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load permissions")
    }
  }, [session])

  // Expose refresh to parent (for SSE-triggered refreshes)
  useEffect(() => {
    if (refreshRef) refreshRef.current = refresh
    return () => {
      if (refreshRef) refreshRef.current = null
    }
  }, [refresh, refreshRef])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [open, refresh])

  const handleRemove = async (rule: ScopedRule) => {
    try {
      await opendora.permission.removeRule(rule.id, rule.scope, rule.scope_id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove permission")
    }
  }

  const handleAdd = async () => {
    if (!newRule.resource || !newRule.pattern || !session) return
    setAdding(true)
    setError(null)
    try {
      const scope_id = newRule.scope === "session" ? session.id : (session.agentID ?? session.id)
      await opendora.permission.addRule({
        scope: newRule.scope,
        scope_id,
        resource: newRule.resource,
        access: newRule.access,
        pattern: newRule.pattern,
        action: newRule.action,
      })
      setAddDialogOpen(false)
      setNewRule({ scope: "session", resource: "bash", access: "execute", pattern: "*", action: "allow" })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add permission")
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Permissions</SheetTitle>
            <SheetDescription className="sr-only">
              View and manage session and agent permissions
            </SheetDescription>
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
              ) : rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ShieldIcon className="size-12 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No saved rules yet. Rules are created when you approve or deny a permission request.
                  </p>
                </div>
              ) : (
                rules.map((rule) => {
                  const { icon: Icon, label } = resourceMeta(rule.resource)
                  return (
                    <div
                      key={rule.id}
                      className="flex items-start gap-3 p-3 border rounded-md bg-card hover:bg-accent transition-colors"
                    >
                      <div className="mt-0.5 text-muted-foreground">
                        <Icon className="size-5" />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{label}</span>
                          <Badge variant="secondary" className="text-[10px]">{rule.access}</Badge>
                          {actionBadge(rule.action)}
                          {scopeBadge(rule._scope)}
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
              <strong>Session</strong> rules apply only to this session.{" "}
              <strong>Agent</strong> rules apply to all sessions using this agent.
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
                onValueChange={(v: "session" | "agent") => setNewRule({ ...newRule, scope: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="session">Session — only this session</SelectItem>
                  <SelectItem value="agent" disabled={!session?.agentID}>
                    Agent — all sessions using this agent
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Resource</Label>
              <Select
                value={newRule.resource}
                onValueChange={(v) => setNewRule({ ...newRule, resource: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Access</Label>
              <Select
                value={newRule.access}
                onValueChange={(v: "read" | "write" | "execute" | "*") => setNewRule({ ...newRule, access: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCESS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="pattern">Pattern</Label>
              <Input
                id="pattern"
                value={newRule.pattern}
                onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                placeholder="e.g. * or /home/user/project/* or rm *"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Use * as wildcard.</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Action</Label>
              <Select
                value={newRule.action}
                onValueChange={(v: "allow" | "deny" | "ask") => setNewRule({ ...newRule, action: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow — always permit</SelectItem>
                  <SelectItem value="deny">Deny — always block</SelectItem>
                  <SelectItem value="ask">Ask — prompt each time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding || !newRule.resource || !newRule.pattern}>
              {adding && <Loader2Icon className="mr-2 size-3.5 animate-spin" />}
              Add Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
