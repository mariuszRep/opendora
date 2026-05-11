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
  const inputFields = inputNode?.data.type === "input" ? inputNode.data.fields : []
  const requiredFields = inputFields.filter((f) => f.required !== false).map((f) => f.name)

  useEffect(() => {
    if (!open) return
    opendora.agent
      .list()
      .then((list) => {
        const capable = list.filter((a) => a.tools?.includes("workflow_run"))
        setAgents(capable)
        if (capable.length > 0 && !agentId) setAgentId(capable[0].id ?? capable[0].name ?? "")
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Run workflow</DialogTitle>
          <DialogDescription>{workflow.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Agent</Label>
            {agents.length === 0 ? (
              <p className="text-sm text-destructive">
                No agent has <code className="font-mono">workflow_run</code> in its tools. Add it in agent settings first.
              </p>
            ) : (
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue placeholder="Select agent…" /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id ?? a.name} value={a.id ?? a.name ?? ""}>
                      {a.name}
                      {a.description && <span className="ml-2 text-muted-foreground text-xs">{a.description}</span>}
                    </SelectItem>
                  ))}
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
          <Button onClick={handleRun} disabled={running || agents.length === 0}>
            {running ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
