"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, Loader2Icon, WorkflowIcon } from "lucide-react"
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
import { useEntityCatalog } from "@/hooks/use-entity-catalog"
import { EntityCatalogPage } from "@/components/settings/entity-catalog-page"
import type { CatalogFilter } from "@/components/settings/entity-catalog-section"

export default function WorkflowsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<CatalogFilter>("all")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [newId, setNewId] = useState("")
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const { items, loading, reload } = useEntityCatalog(
    "workflow",
    () => opendora.workflow.list(),
    (w) => ({
      id: w.id,
      type: "workflow" as const,
      name: w.name,
      description: w.description || "No description",
      onManage: () => router.push(`/dashboard/settings/workflows/${w.id}`),
      onDelete: async () => { await opendora.workflow.remove(w.id); reload() },
      onUninstall: async () => { await opendora.workflow.remove(w.id); reload() },
    }),
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
    <>
      <EntityCatalogPage
        icon={WorkflowIcon}
        title="Workflows"
        items={items}
        loading={loading}
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        sortFn={(a, b) => a.name.localeCompare(b.name)}
        headerAction={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            New Workflow
          </Button>
        }
      />

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
    </>
  )
}
