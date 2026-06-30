'use client'

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ToolSchemaProperty } from '@/lib/projectflows'
import type { RefSuggestion } from '@/lib/workflow-refs'
import { ExpressionInput } from './expression-input'
import { PromptInput } from './prompt-input'
import { Bot } from 'lucide-react'

interface ToolParameterFormProps {
  properties: Record<string, ToolSchemaProperty>
  required: string[]
  values: Record<string, unknown>
  agentArgs: string[]
  availableRefs?: RefSuggestion[]
  onChange: (values: Record<string, unknown>) => void
  onAgentArgsChange: (agentArgs: string[]) => void
}

export function ToolParameterForm({
  properties,
  required,
  values,
  agentArgs,
  availableRefs = [],
  onChange,
  onAgentArgsChange,
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

  const toggleAgentArg = (name: string, on: boolean) => {
    if (on) {
      onAgentArgsChange([...agentArgs.filter((a) => a !== name), name])
    } else {
      onAgentArgsChange(agentArgs.filter((a) => a !== name))
    }
  }

  return (
    <div className="space-y-3">
      {entries.map(([name, prop]) => {
        const isRequired = required.includes(name)
        const isAgentArg = agentArgs.includes(name)
        const currentValue = (values[name] ?? '') as string

        return (
          <div key={name} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Label className="font-mono text-xs">{name}</Label>
                {isRequired && (
                  <Badge variant="secondary" className="text-xs px-1 py-0 h-4">required</Badge>
                )}
                {prop.type && prop.type !== 'string' && (
                  <Badge variant="outline" className="text-xs px-1 py-0 h-4">{prop.type}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Bot className={`h-3 w-3 transition-colors ${isAgentArg ? 'text-primary' : 'text-muted-foreground/40'}`} />
                <Switch
                  checked={isAgentArg}
                  onCheckedChange={(checked) => toggleAgentArg(name, checked)}
                  className="scale-75 origin-right"
                />
              </div>
            </div>
            {prop.description && (
              <p className="text-xs text-muted-foreground">{prop.description}</p>
            )}
            {isAgentArg ? (
              <div className="flex items-center gap-2 h-8 px-3 rounded-md border border-dashed border-primary/40 bg-primary/5">
                <Bot className="h-3 w-3 text-primary/60 shrink-0" />
                <span className="text-xs text-primary/70 italic">Agent will populate</span>
              </div>
            ) : prop.enum ? (
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
              <PromptInput
                className="min-h-[72px] text-xs"
                value={currentValue}
                onChange={(v) => set(name, v)}
                suggestions={availableRefs}
                placeholder={prop.default !== undefined ? String(prop.default) : 'Type $ to insert a reference…'}
              />
            ) : (
              <ExpressionInput
                className="h-8 text-xs font-mono"
                value={currentValue}
                onChange={(v) => set(name, v)}
                suggestions={availableRefs}
                placeholder={prop.default !== undefined ? String(prop.default) : undefined}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
