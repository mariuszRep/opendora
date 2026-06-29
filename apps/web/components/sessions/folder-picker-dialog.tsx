"use client"

import { useState, useEffect } from "react"
import { ChevronRightIcon, FolderIcon, HomeIcon, Loader2Icon, ChevronUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { opendora, type FileNode } from "@/lib/projectflows"
import { cn } from "@/lib/utils"

interface FolderPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPath?: string
  onSelect: (path: string) => void
}

export function FolderPickerDialog({ open, onOpenChange, initialPath = "/", onSelect }: FolderPickerDialogProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || "/")
  const [entries, setEntries] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualPath, setManualPath] = useState(initialPath || "/")

  useEffect(() => {
    if (open) {
      const start = initialPath || "/"
      setCurrentPath(start)
      setManualPath(start)
    }
  }, [open, initialPath])

  useEffect(() => {
    if (!open) return
    loadDir(currentPath)
  }, [currentPath, open])

  async function loadDir(path: string) {
    setLoading(true)
    setError(null)
    try {
      const nodes = await opendora.file.list(path)
      const dirs = nodes
        .filter((n) => n.type === "directory")
        .sort((a, b) => a.name.localeCompare(b.name))
      setEntries(dirs)
      setManualPath(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to list directory")
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  function goUp() {
    const normalized = currentPath.replace(/\/$/, "")
    const lastSlash = normalized.lastIndexOf("/")
    const parent = lastSlash <= 0 ? "/" : normalized.slice(0, lastSlash)
    setCurrentPath(parent)
  }

  function handleManualNavigate() {
    setCurrentPath(manualPath.trim() || "/")
  }

  function handleSelect() {
    onSelect(currentPath)
    onOpenChange(false)
  }

  const pathParts = currentPath.replace(/^\//, "").split("/").filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select working directory</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualNavigate()}
            className="font-mono text-xs"
            placeholder="/path/to/directory"
          />
          <Button variant="outline" size="sm" onClick={handleManualNavigate}>
            Go
          </Button>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCurrentPath("/")}
            className="hover:text-foreground shrink-0"
            title="Root"
          >
            <HomeIcon className="size-3" />
          </button>
          {pathParts.map((part, i) => {
            const partial = "/" + pathParts.slice(0, i + 1).join("/")
            return (
              <span key={partial} className="flex items-center gap-1 shrink-0">
                <ChevronRightIcon className="size-3" />
                <button
                  type="button"
                  onClick={() => setCurrentPath(partial)}
                  className={cn(
                    "hover:text-foreground",
                    i === pathParts.length - 1 && "text-foreground font-medium",
                  )}
                >
                  {part}
                </button>
              </span>
            )
          })}
        </div>

        <div className="border rounded-md min-h-[200px] max-h-[300px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-full py-8">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && <p className="text-xs text-destructive p-3">{error}</p>}
          {!loading && !error && (
            <>
              {currentPath !== "/" && (
                <button
                  type="button"
                  onClick={goUp}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-muted-foreground border-b"
                >
                  <ChevronUpIcon className="size-3 shrink-0" />
                  <span>..</span>
                </button>
              )}
              {entries.length === 0 && (
                <p className="text-xs text-muted-foreground p-3 text-center">No subdirectories</p>
              )}
              {entries.map((entry) => (
                <button
                  type="button"
                  key={entry.absolute}
                  onClick={() => setCurrentPath(entry.absolute)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.name}</span>
                  <ChevronRightIcon className="ml-auto size-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSelect}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
