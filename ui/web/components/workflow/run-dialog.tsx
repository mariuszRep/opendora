"use client"

import { useEffect, useState } from "react"
import { PlayIcon, Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { opendora, type Workflow, type Agent } from "@/lib/opendora"

interface RunDialogProps {
  workflow: Workflow
  directory?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSessionCreated?: (sessionId: string) => void
}

export function RunDialog({ workflow, directory, open, onOpenChange, onSessionCreated }: RunDialogProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState<string>("")
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputNode = workflow.nodes.find((n) => n.type === "input")
  type InputField = { name: string; type: string; required?: boolean; description?: string }
  const inputFields: InputField[] =
    inputNode && 'type' in inputNode.data && inputNode.data.type === "input"
      ? (inputNode.data as { type: "input"; fields: InputField[] }).fields
      : []
  const requiredFields = inputFields.filter((f) => f.required !== false).map((f) => f.name)

  useEffect(() => {
    if (!open) return
    opendora.agent
      .list()
      .then((list) => {
        const runnable = list.filter((a) => a.mode !== "system")
        setAgents(runnable)
        if (runnable.length > 0 && !agentId) setAgentId(runnable[0].id ?? runnable[0].name ?? "")
      })
      .catch(() => {})
  }, [open])

  async function handleRun() {
    if (!agentId) { setError("Select an agent"); return }
    for (const f of requiredFields) {
      if (!inputValues[f]) { setError(`"${f}" is required`); return }
    }
    setError(null)
    setRunning(true)
    try {
      const input = Object.fromEntries(Object.entries(inputValues).filter(([, v]) => v !== ""))
      const result = await opendora.workflow.execute(workflow.id, agentId, input, directory)
      onOpenChange(false)
      onSessionCreated?.(result.sessionId)
    } catch (e: any) {
      setError(e?.message ?? "Failed to start workflow")
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Run workflow</DialogTitle>
          <DialogDescription>{workflow.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Agent</Label>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading agents…</p>
            ) : (
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select agent…" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => {
                    const val = a.id ?? a.name ?? ""
                    return (
                      <SelectItem key={val} value={val}>
                        <span className="capitalize">{a.name}</span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {inputFields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label>
                {field.name}
                {field.required !== false && <span className="ml-1 text-destructive">*</span>}
                <span className="ml-2 text-xs text-muted-foreground font-normal">{field.type}</span>
              </Label>
              <Input
                placeholder={`Enter ${field.name}…`}
                value={inputValues[field.name] ?? ""}
                onChange={(e) => setInputValues((p) => ({ ...p, [field.name]: e.target.value }))}
              />
              {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
            </div>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleRun} disabled={running || !agentId}>
            {running ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
