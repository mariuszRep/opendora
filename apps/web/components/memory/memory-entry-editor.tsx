"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { opendora, type MemoryEntry } from "@/lib/opendora"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  directory: string
  scope: "global" | "local"
  agentID?: string
  entry?: MemoryEntry
  onSaved: (entry: MemoryEntry) => void
}

const TYPES = [
  { value: "user", label: "User" },
  { value: "feedback", label: "Feedback" },
  { value: "project", label: "Project" },
  { value: "reference", label: "Reference" },
]

export function MemoryEntryEditor({ open, onOpenChange, directory, scope, agentID, entry, onSaved }: Props) {
  const isEdit = !!entry
  const [name, setName] = useState(entry?.name ?? "")
  const [description, setDescription] = useState(entry?.description ?? "")
  const [type, setType] = useState(entry?.type ?? "project")
  const [content, setContent] = useState(entry?.content ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName(entry?.name ?? "")
    setDescription(entry?.description ?? "")
    setType(entry?.type ?? "project")
    setContent(entry?.content ?? "")
    setError(null)
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required"); return }
    if (!description.trim()) { setError("Description is required"); return }
    if (!content.trim()) { setError("Content is required"); return }
    setSaving(true)
    setError(null)
    try {
      let saved: MemoryEntry
      if (isEdit) {
        saved = await opendora.memory.update(directory, name, { description, type, content }, scope, agentID)
      } else {
        saved = await opendora.memory.create(directory, { name, description, type, content }, scope, agentID)
      }
      onSaved(saved)
      onOpenChange(false)
    } catch (e: any) {
      setError(e.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit memory entry" : "New memory entry"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="mem-name">Name <span className="text-muted-foreground text-xs">(snake_case)</span></Label>
            <Input
              id="mem-name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isEdit}
              placeholder="user_role_context"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mem-desc">Description</Label>
            <Input
              id="mem-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="One-line decision guide"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mem-content">Content <span className="text-muted-foreground text-xs">(Markdown)</span></Label>
            <Textarea
              id="mem-content"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={8}
              className="font-mono text-sm"
              placeholder="Memory body..."
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
