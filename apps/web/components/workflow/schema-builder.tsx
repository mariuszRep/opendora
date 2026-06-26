"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { ExpressionInput } from "./expression-input"
import { type RefSuggestion } from "@projectflows/workflow/refs"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScalarType = "string" | "number" | "boolean"
export type PropType = ScalarType | "array" | "object"
export type ArrayItemType = ScalarType | "object"

export interface FieldDisplay {
  /** How to render this field's value */
  as?: string
  /** Semantic role when inside a card/list item */
  role?: string
}

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
  /** Display configuration (UI-only, not included in JSON Schema) */
  display?: FieldDisplay
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

function getDisplayOptions(type: PropType, itemType?: ArrayItemType): { value: string; label: string }[] {
  const base = [{ value: "auto", label: "Auto" }]
  if (type === "string") return [...base, { value: "text", label: "Text" }, { value: "link", label: "Link" }, { value: "badge", label: "Badge" }, { value: "image", label: "Image" }, { value: "hidden", label: "Hidden" }]
  if (type === "number" || type === "boolean") return [...base, { value: "text", label: "Text" }, { value: "badge", label: "Badge" }, { value: "hidden", label: "Hidden" }]
  if (type === "array") {
    if (itemType === "object") return [...base, { value: "table", label: "Table" }, { value: "cards", label: "Cards" }, { value: "list", label: "List" }, { value: "hidden", label: "Hidden" }]
    return [...base, { value: "list", label: "List" }, { value: "badges", label: "Badges" }, { value: "comma", label: "Comma-separated" }, { value: "hidden", label: "Hidden" }]
  }
  if (type === "object") return [...base, { value: "card", label: "Card" }, { value: "details", label: "Details" }, { value: "hidden", label: "Hidden" }]
  return base
}

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
  suggestions: RefSuggestion[]
  onChange: (updated: SchemaProp) => void
  onDelete: () => void
  /** When true, show a Role selector (scalar fields inside array-of-object items) */
  showRole?: boolean
}

function PropRow({ prop, depth, suggestions, onChange, onDelete, showRole }: PropRowProps) {
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
        <ExpressionInput
          value={prop.description}
          onChange={(v) => update({ description: v })}
          suggestions={suggestions}
          placeholder="Description — helps the agent understand what to put here"
          className="text-xs min-h-0"
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

      {/* Display configuration */}
      <div className="px-2 pb-2 pl-8 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground shrink-0">Display</span>
        <Select
          value={prop.display?.as ?? "auto"}
          onValueChange={(v) => update({ display: { ...prop.display, as: v } })}
        >
          <SelectTrigger className="h-7 w-28 text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getDisplayOptions(prop.type, prop.itemType).map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showRole && (prop.type === "string" || prop.type === "number" || prop.type === "boolean") && (
          <>
            <span className="text-xs text-muted-foreground shrink-0">Role</span>
            <Select
              value={prop.display?.role ?? "none"}
              onValueChange={(v) => update({ display: { ...prop.display, role: v } })}
            >
              <SelectTrigger className="h-7 w-28 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">None</SelectItem>
                <SelectItem value="title" className="text-xs">Title</SelectItem>
                <SelectItem value="description" className="text-xs">Description</SelectItem>
                <SelectItem value="status" className="text-xs">Status (badge)</SelectItem>
                <SelectItem value="image" className="text-xs">Image</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* Nested properties — object children or array-of-object items */}
      {expanded && hasChildren && (
        <div className="px-2 pb-2 pl-8">
          {prop.type === "object" && (
            <SchemaBuilder
              props={prop.properties ?? []}
              onChange={(updated) => update({ properties: updated })}
              suggestions={suggestions}
              depth={depth + 1}
            />
          )}
          {prop.type === "array" && prop.itemType === "object" && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Item properties</span>
              <SchemaBuilder
                props={prop.itemProperties ?? []}
                onChange={(updated) => update({ itemProperties: updated })}
                suggestions={suggestions}
                depth={depth + 1}
                showRole
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
  suggestions?: RefSuggestion[]
  depth?: number
  showRole?: boolean
}

export function SchemaBuilder({ props, onChange, suggestions = [], depth = 0, showRole }: SchemaBuilderProps) {
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
          suggestions={suggestions}
          onChange={(updated) => updateProp(i, updated)}
          onDelete={() => deleteProp(i)}
          showRole={showRole}
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
