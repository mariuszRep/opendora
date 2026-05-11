'use client'

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ToolSchemaProperty } from '@/lib/opendora'

interface ToolParameterFormProps {
  properties: Record<string, ToolSchemaProperty>
  required: string[]
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

export function ToolParameterForm({
  properties,
  required,
  values,
  onChange,
}: ToolParameterFormProps) {
  const entries = Object.entries(properties)

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        This tool takes no input parameters.
      </p>
    )
  }

  const set = (key: string, value: unknown) => {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="space-y-3">
      {entries.map(([name, prop]) => {
        const isRequired = required.includes(name)
        const currentValue = (values[name] ?? '') as string

        return (
          <div key={name} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="font-mono text-xs">{name}</Label>
              {isRequired && (
                <Badge variant="secondary" className="text-xs px-1 py-0 h-4">required</Badge>
              )}
              {prop.type && prop.type !== 'string' && (
                <Badge variant="outline" className="text-xs px-1 py-0 h-4">{prop.type}</Badge>
              )}
            </div>
            {prop.description && (
              <p className="text-xs text-muted-foreground">{prop.description}</p>
            )}
            {prop.enum ? (
              <Select value={currentValue} onValueChange={(v) => set(name, v)}>
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue placeholder="Select value…" />
                </SelectTrigger>
                <SelectContent>
                  {prop.enum.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs font-mono">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : prop.type === 'boolean' ? (
              <Select
                value={currentValue === '' ? '' : String(currentValue)}
                onValueChange={(v) => set(name, v === 'true')}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">true</SelectItem>
                  <SelectItem value="false">false</SelectItem>
                </SelectContent>
              </Select>
            ) : prop.type === 'number' || prop.type === 'integer' ? (
              <Input
                type="number"
                className="h-8 text-xs font-mono"
                value={currentValue}
                onChange={(e) => set(name, e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={prop.default !== undefined ? String(prop.default) : undefined}
              />
            ) : name === 'content' || name === 'instructions' || name === 'prompt' || name === 'message' ? (
              <Textarea
                className="text-xs font-mono"
                rows={3}
                value={currentValue}
                onChange={(e) => set(name, e.target.value)}
                placeholder={prop.default !== undefined ? String(prop.default) : undefined}
              />
            ) : (
              <Input
                className="h-8 text-xs font-mono"
                value={currentValue}
                onChange={(e) => set(name, e.target.value)}
                placeholder={prop.default !== undefined ? String(prop.default) : undefined}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
