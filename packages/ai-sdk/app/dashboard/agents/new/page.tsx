"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import type { AgentConfig } from "@/lib/opendora"

const MODE_OPTIONS: { value: AgentConfig["mode"]; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "subagent", label: "Sub-agent" },
  { value: "all", label: "All" },
]

export default function NewAgentPage() {
  const router = useRouter()
  const { createAgent, generateAgent } = useOpendoraContext()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<AgentConfig["mode"]>("all")
  const [color, setColor] = useState("")
  const [persona, setPersona] = useState("")
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!description.trim()) return
    setGenerating(true)
    setError(null)
    try {
      const result = await generateAgent(description)
      setName((prev) => prev || result.identifier)
      setDescription(result.whenToUse)
      setPersona(result.systemPrompt)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate")
    } finally {
      setGenerating(false)
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const config: AgentConfig = {
        name: name.trim(),
        description: description.trim() || undefined,
        mode,
        color: color.trim() || undefined,
      }
      const entry = await createAgent(config, persona)
      router.push(`/dashboard/agents/${entry.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb header */}
      <div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                href="/dashboard"
                className="cursor-pointer"
                onClick={(e) => { e.preventDefault(); router.back() }}
              >
                Agents
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New agent</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Button onClick={handleCreate} disabled={saving || !name.trim()} size="sm">
          {saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
          Create agent
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8 flex flex-col gap-6">

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              placeholder="my-agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="agent-desc">Description</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-xs"
                disabled={!description.trim() || generating}
                onClick={handleGenerate}
              >
                {generating ? <Loader2Icon className="size-3 animate-spin" /> : <SparklesIcon className="size-3" />}
                AI fill
              </Button>
            </div>
            <Textarea
              id="agent-desc"
              placeholder="When to use this agent…"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Mode</Label>
              <Select value={mode ?? "all"} onValueChange={(v) => setMode(v as AgentConfig["mode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value!}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agent-color">Color</Label>
              <Input
                id="agent-color"
                placeholder="#7c3aed"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-persona">
              Persona
              <span className="ml-1 font-normal text-muted-foreground">(PERSONA.md)</span>
            </Label>
            <Textarea
              id="agent-persona"
              placeholder="You are a…"
              className="h-72 resize-none overflow-y-auto font-mono text-xs"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}
