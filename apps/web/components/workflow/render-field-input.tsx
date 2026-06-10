"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type WorkflowFieldDef = {
  name: string
  type?: string
  required?: boolean
  description?: string
  enum?: string[]
}

export function renderFieldInput(
  field: WorkflowFieldDef,
  inputValues: Record<string, string>,
  setInputValues: React.Dispatch<React.SetStateAction<Record<string, string>>>,
): React.ReactNode {
  const type = field.type ?? "string"
  const val = inputValues[field.name] ?? ""
  const set = (v: string) => setInputValues((p) => ({ ...p, [field.name]: v }))

  if (field.enum && field.enum.length > 0) {
    return (
      <Select value={val} onValueChange={set}>
        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {field.enum.map((opt) => (
            <SelectItem key={opt} value={opt} className="font-mono text-sm">{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (type === "boolean") {
    return (
      <Select value={val} onValueChange={set}>
        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  if (type === "number" || type === "integer") {
    return (
      <Input type="number" placeholder={`Enter ${field.name}…`} value={val} onChange={(e) => set(e.target.value)} />
    )
  }

  if (type === "object" || type === "array") {
    return (
      <Textarea
        placeholder={type === "array" ? '["item1", "item2"]' : '{"key": "value"}'}
        value={val}
        onChange={(e) => set(e.target.value)}
        rows={3}
        className="font-mono text-xs"
      />
    )
  }

  return (
    <Input placeholder={`Enter ${field.name}…`} value={val} onChange={(e) => set(e.target.value)} />
  )
}
