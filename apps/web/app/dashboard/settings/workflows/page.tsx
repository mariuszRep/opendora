"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, SearchIcon, Loader2Icon } from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { SettingsCard } from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { opendora, type Workflow } from "@/lib/projectflows"

export default function WorkflowsPage() {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [newId, setNewId] = useState("")
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    opendora.workflow
      .list()
      .then(setWorkflows)
      .catch(() => setWorkflows([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = workflows.filter(
    (w) =>
      !search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.description?.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleCreate() {
    if (!newId.trim() || !newName.trim()) { setCreateError("ID and name are required"); return }
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-")
    setCreateError(null)
    setCreating(true)
    try {
      const stub: Workflow = {
        id,
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        version: "1.0.0",
        nodes: [],
        edges: [],
      }
      await opendora.workflow.create(stub)
      setCreateOpen(false)
      setNewId(""); setNewName(""); setNewDescription("")
      router.push(`/dashboard/settings/workflows/${id}`)
    } catch (e: any) {
      setCreateError(e?.message ?? "Failed to create workflow")
    } finally {
      setCreating(false)
    }
  }

  return (
    <SettingsPageLayout
      title="Workflows"
      headerAction={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          New Workflow
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search workflows…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <SearchIcon className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search ? "No workflows match your search." : "No workflows yet. Create one to get started."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((w) => (
              <SettingsCard
                key={w.id}
                title={w.name}
                description={w.description || "No description"}
                onClick={() => router.push(`/dashboard/settings/workflows/${w.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New workflow</DialogTitle>
            <DialogDescription>Create a new workflow definition.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>ID <span className="text-destructive">*</span></Label>
              <Input placeholder="my-workflow" value={newId} onChange={(e) => setNewId(e.target.value)} />
              <p className="text-xs text-muted-foreground">Lowercase letters, numbers, hyphens, underscores.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input placeholder="My Workflow" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input placeholder="What this workflow does…" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2Icon className="size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageLayout>
  )
}
