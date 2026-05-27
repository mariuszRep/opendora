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
  onSessionCreated?: (sessionId: string, agentId: string) => void
}

export function RunDialog({ workflow, directory, open, onOpenChange, onSessionCreated }: RunDialogProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState<string>("")
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  type InputField = { name: string; type: string; required?: boolean; description?: string }

  // Support legacy (type: "input"), unified start (nodeType: "start"), and parameters (nodeType: "parameters")
  const legacyInputNode = workflow.nodes.find((n) => n.type === "input")
  const unifiedStartNode = workflow.nodes.find(
    (n) => n.type === "workflow" && (n.data as any)?.nodeType === "start"
  )
  const parametersNode = workflow.nodes.find(
    (n) => n.type === "workflow" && (n.data as any)?.nodeType === "parameters"
  )
  const inputNode = legacyInputNode ?? unifiedStartNode

  const inputFields: InputField[] = (() => {
    if (parametersNode) {
      const params = ((parametersNode.data as any)?.workflowParameters ?? []) as Array<{
        name: string; type: string; description?: string; required?: boolean
      }>
      return params.map((p) => ({ name: p.name, type: p.type, required: p.required !== false, description: p.description }))
    }
    if (!inputNode) return []
    const d = inputNode.data as any
    if (d?.type === "input") return (d.fields as InputField[]) ?? []
    const inputs = d?.data?.inputs as InputField[] | undefined
    return inputs ?? []
  })()
  const requiredFields = inputFields.filter((f) => f.required !== false).map((f) => f.name)

  useEffect(() => {
    if (!open) return
    opendora.agent
      .list()
      .then((list) => {
        const runnable = list.filter((a) => a.mode !== "system" && a.id)
        setAgents(runnable)
        if (!agentId && runnable.length > 0) {
          // Prefer a worker/engineer agent over orchestrators (pandora, agent-owner)
          const orchestratorIds = new Set(["pandora", "agent-owner"])
          const preferred = runnable.find((a) => a.id && !orchestratorIds.has(a.id))
          const defaultAgent = preferred ?? runnable[0]
          if (defaultAgent?.id) setAgentId(defaultAgent.id)
        }
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
      onSessionCreated?.(result.sessionId, agentId)
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
                    if (!a.id) return null
                    return (
                      <SelectItem key={a.id} value={a.id}>
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
