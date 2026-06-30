"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlusIcon, BrainIcon, RefreshCwIcon } from "lucide-react"
import { opendora, type MemoryEntry, type Agent } from "@/lib/projectflows"
import { MemoryEntryCard } from "./memory-entry-card"
import { MemoryEntryEditor } from "./memory-entry-editor"

type Scope = "global" | "local"

type Props = {
  directory: string
  agents: (Agent & { _id: string })[]
}

export function MemoryBrowser({ directory, agents }: Props) {
  const [scope, setScope] = useState<Scope>("global")
  const [agentID, setAgentID] = useState<string | undefined>(agents[0]?.name)
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await opendora.memory.list(directory, scope, scope === "local" ? agentID : undefined)
      setEntries(data)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [directory, scope, agentID])

  useEffect(() => { load() }, [load])

  const handleUpdated = (updated: MemoryEntry) => {
    setEntries(prev => prev.map(e => e.name === updated.name ? updated : e))
  }

  const handleDeleted = (name: string) => {
    setEntries(prev => prev.filter(e => e.name !== name))
  }

  const handleCreated = (created: MemoryEntry) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.name === created.name)
      if (idx >= 0) { const next = [...prev]; next[idx] = created; return next }
      return [...prev, created]
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-md border overflow-hidden shrink-0">
          <button
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${scope === "global" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
            onClick={() => setScope("global")}
          >
            Global
          </button>
          <button
            className={`px-3 py-1.5 text-xs font-medium border-l transition-colors ${scope === "local" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
            onClick={() => setScope("local")}
          >
            Agent-specific
          </button>
        </div>

        {scope === "local" && agents.length > 0 && (
          <Select value={agentID} onValueChange={setAgentID}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map(a => (
                <SelectItem key={a.name} value={a.name} className="text-xs">{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
            <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreating(true)}>
            <PlusIcon className="size-3.5" />
            New entry
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <RefreshCwIcon className="size-4 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <BrainIcon className="size-8 opacity-30" />
          <p className="text-sm">No {scope} memories yet</p>
          <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => setCreating(true)}>
            <PlusIcon className="size-3.5 mr-1" />
            Add first entry
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => (
            <MemoryEntryCard
              key={entry.name}
              entry={entry}
              directory={directory}
              scope={scope}
              agentID={scope === "local" ? agentID : undefined}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      <MemoryEntryEditor
        open={creating}
        onOpenChange={setCreating}
        directory={directory}
        scope={scope}
        agentID={scope === "local" ? agentID : undefined}
        onSaved={handleCreated}
      />
    </div>
  )
}
