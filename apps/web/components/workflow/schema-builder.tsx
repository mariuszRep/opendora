"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScalarType = "string" | "number" | "boolean"
export type PropType = ScalarType | "array" | "object"
export type ArrayItemType = ScalarType | "object"

export interface SchemaProp {
  name: string
  type: PropType
  description: string
  required: boolean
  /** Properties when type === "object" */
  properties?: SchemaProp[]
  /** Item type when type === "array" */
  itemType?: ArrayItemType
  /** Properties when type === "array" && itemType === "object" */
  itemProperties?: SchemaProp[]
}

// ─── JSON Schema ↔ SchemaProp conversion ─────────────────────────────────────

export function schemaPropsToJsonSchema(props: SchemaProp[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const p of props) {
    if (!p.name) continue
    if (p.required) required.push(p.name)

    if (p.type === "object") {
      properties[p.name] = {
        type: "object",
        description: p.description || undefined,
        ...(p.properties && p.properties.length > 0 ? schemaPropsToJsonSchema(p.properties) : { properties: {} }),
      }
    } else if (p.type === "array") {
      const itemSchema: Record<string, unknown> =
        p.itemType === "object"
          ? {
              type: "object",
              ...(p.itemProperties && p.itemProperties.length > 0
                ? schemaPropsToJsonSchema(p.itemProperties)
                : { properties: {} }),
            }
          : { type: p.itemType ?? "string" }
      properties[p.name] = {
        type: "array",
        description: p.description || undefined,
        items: itemSchema,
      }
    } else {
      properties[p.name] = {
        type: p.type,
        description: p.description || undefined,
      }
    }
  }

  return { type: "object", properties, ...(required.length > 0 ? { required } : {}) }
}

export function jsonSchemaToProps(schema: Record<string, unknown>): SchemaProp[] {
  if (!schema || schema.type !== "object") return []
  const raw = schema?.properties
  if (!raw || typeof raw !== "object") return []
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : []

  return Object.entries(raw as Record<string, Record<string, unknown>>).map(([name, def]) => {
    const type = (def.type as string) ?? "string"
    const description = (def.description as string) ?? ""
    const isRequired = required.includes(name)

    if (type === "object") {
      return {
        name,
        type: "object" as const,
        description,
        required: isRequired,
        properties: jsonSchemaToProps(def),
      }
    }

    if (type === "array") {
      const items = def.items as Record<string, unknown> | undefined
      const itemType = (items?.type as ArrayItemType) ?? "string"
      return {
        name,
        type: "array" as const,
        description,
        required: isRequired,
        itemType,
        itemProperties: itemType === "object" ? jsonSchemaToProps(items ?? {}) : undefined,
      }
    }

    return { name, type: type as ScalarType, description, required: isRequired }
  })
}

// ─── PropRow ──────────────────────────────────────────────────────────────────

const PROP_TYPES: { value: PropType; label: string }[] = [
  { value: "string", label: "string" },
  { value: "number", label: "number" },
  { value: "boolean", label: "boolean" },
  { value: "object", label: "object" },
  { value: "array", label: "array" },
]

const ITEM_TYPES: { value: ArrayItemType; label: string }[] = [
  { value: "string", label: "string" },
  { value: "number", label: "number" },
  { value: "boolean", label: "boolean" },
  { value: "object", label: "object" },
]

interface PropRowProps {
  prop: SchemaProp
  depth: number
  onChange: (updated: SchemaProp) => void
  onDelete: () => void
}

function PropRow({ prop, depth, onChange, onDelete }: PropRowProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = prop.type === "object" || (prop.type === "array" && prop.itemType === "object")

  const update = (patch: Partial<SchemaProp>) => onChange({ ...prop, ...patch })

  return (
    <div className={cn("border rounded-md", depth > 0 && "ml-4 border-l-2 border-l-muted-foreground/20")}>
      {/* Header row */}
      <div className="flex items-center gap-1.5 p-2">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <Input
          value={prop.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="name"
          className="font-mono text-xs flex-1 h-7 min-w-0"
        />

        <Select
          value={prop.type}
          onValueChange={(v) => {
            const t = v as PropType
            update({
              type: t,
              properties: t === "object" ? prop.properties ?? [] : undefined,
              itemType: t === "array" ? (prop.itemType ?? "string") : undefined,
              itemProperties: t === "array" && (prop.itemType ?? "string") === "object"
                ? prop.itemProperties ?? []
                : undefined,
            })
          }}
        >
          <SelectTrigger className="w-24 h-7 text-xs font-mono shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROP_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs font-mono">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Switch
          checked={prop.required}
          onCheckedChange={(v) => update({ required: v })}
          className="scale-75 origin-right shrink-0"
          title="Required"
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Description */}
      <div className="px-2 pb-2 pl-8">
        <Textarea
          value={prop.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Description — helps the agent understand what to put here"
          rows={1}
          className="text-xs resize-none min-h-0"
        />
      </div>

      {/* Array item type selector */}
      {prop.type === "array" && (
        <div className="px-2 pb-2 pl-8 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Item type</span>
          <Select
            value={prop.itemType ?? "string"}
            onValueChange={(v) => {
              const it = v as ArrayItemType
              update({
                itemType: it,
                itemProperties: it === "object" ? prop.itemProperties ?? [] : undefined,
              })
            }}
          >
            <SelectTrigger className="w-24 h-7 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs font-mono">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Nested properties — object children or array-of-object items */}
      {expanded && hasChildren && (
        <div className="px-2 pb-2 pl-8">
          {prop.type === "object" && (
            <SchemaBuilder
              props={prop.properties ?? []}
              onChange={(updated) => update({ properties: updated })}
              depth={depth + 1}
            />
          )}
          {prop.type === "array" && prop.itemType === "object" && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Item properties</span>
              <SchemaBuilder
                props={prop.itemProperties ?? []}
                onChange={(updated) => update({ itemProperties: updated })}
                depth={depth + 1}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SchemaBuilder ────────────────────────────────────────────────────────────

interface SchemaBuilderProps {
  props: SchemaProp[]
  onChange: (props: SchemaProp[]) => void
  depth?: number
}

export function SchemaBuilder({ props, onChange, depth = 0 }: SchemaBuilderProps) {
  const addProp = () =>
    onChange([...props, { name: "", type: "string", description: "", required: false }])

  const updateProp = (i: number, updated: SchemaProp) => {
    const next = [...props]
    next[i] = updated
    onChange(next)
  }

  const deleteProp = (i: number) => onChange(props.filter((_, j) => j !== i))

  return (
    <div className="space-y-2">
      {props.length === 0 && depth === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No fields yet. Add one to define the output structure.
        </p>
      )}

      {props.map((p, i) => (
        <PropRow
          key={i}
          prop={p}
          depth={depth}
          onChange={(updated) => updateProp(i, updated)}
          onDelete={() => deleteProp(i)}
        />
      ))}

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs w-full"
        onClick={addProp}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add field
      </Button>
    </div>
  )
}
