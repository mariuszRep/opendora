"use client"

import type { RenderLayoutConfig } from "@/lib/format-translator"
import type { SchemaProp } from "@/components/workflow/schema-builder"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// ─── Primitive value renderer (auto-detect) ───────────────────────────────────

function ValueCell({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>
  if (typeof value === "boolean")
    return <Badge variant={value ? "default" : "secondary"}>{String(value)}</Badge>
  if (typeof value === "number")
    return <code className="text-xs font-mono">{value}</code>
  if (typeof value === "string") return <span>{value}</span>
  if (Array.isArray(value))
    return <span className="text-muted-foreground text-xs">[{value.length} items]</span>
  return <code className="text-xs font-mono break-all">{JSON.stringify(value)}</code>
}

// ─── Schema-aware value renderer ──────────────────────────────────────────────

function SmartCell({ value, prop }: { value: unknown; prop?: SchemaProp }) {
  const as = prop?.display?.as ?? "auto"

  if (as === "hidden") return null
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>

  if (as === "link" || (as === "auto" && typeof value === "string" && /^https?:\/\//.test(value))) {
    return (
      <a
        href={String(value)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline text-xs truncate max-w-xs block"
      >
        {String(value)}
      </a>
    )
  }
  if (as === "badge") return <Badge variant="outline">{String(value)}</Badge>
  if (as === "image" && typeof value === "string") {
    return <img src={value} alt="" className="h-10 w-10 object-cover rounded" />
  }

  // Array field with itemProperties — render inline DataView
  if (Array.isArray(value) && prop) {
    return <DataView data={value} displayProps={prop.itemProperties} />
  }

  return <ValueCell value={value} />
}

// ─── Column resolution ────────────────────────────────────────────────────────

function resolveColumns(rows: Record<string, unknown>[], props?: SchemaProp[]): string[] {
  let cols = Object.keys(rows[0] ?? {})
  if (props?.length) {
    // Filter to visible (not hidden) props in schema order
    const schemaNames = props
      .filter((p) => p.display?.as !== "hidden")
      .map((p) => p.name)
      .filter(Boolean)
    // Use schema order for known fields, append unknown fields after
    const ordered = schemaNames.filter((n) => cols.includes(n))
    const rest = cols.filter((n) => !schemaNames.includes(n))
    cols = [...ordered, ...rest]
  }
  return cols
}

// ─── Table ────────────────────────────────────────────────────────────────────

function DataTable({
  rows,
  columns,
  itemProps,
}: {
  rows: Record<string, unknown>[]
  columns: string[]
  itemProps?: SchemaProp[]
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col}>{col}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {columns.map((col) => {
              const prop = itemProps?.find((p) => p.name === col)
              return (
                <TableCell key={col}>
                  <SmartCell value={row[col]} prop={prop} />
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function DataCard({
  item,
  itemProps,
}: {
  item: Record<string, unknown>
  itemProps?: SchemaProp[]
}) {
  const titleProp = itemProps?.find((p) => p.display?.role === "title")
  const descProp = itemProps?.find((p) => p.display?.role === "description")
  const statusProp = itemProps?.find((p) => p.display?.role === "status")
  const usedNames = new Set(
    [titleProp?.name, descProp?.name, statusProp?.name].filter(Boolean) as string[]
  )

  const title = titleProp ? item[titleProp.name] : undefined
  const desc = descProp ? item[descProp.name] : undefined
  const status = statusProp ? item[statusProp.name] : undefined

  // Remaining fields not used as roles and not hidden
  const bodyEntries = Object.entries(item).filter(([k]) => {
    if (usedNames.has(k)) return false
    const p = itemProps?.find((p) => p.name === k)
    return p?.display?.as !== "hidden"
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        {title !== undefined && <CardTitle className="text-base">{String(title)}</CardTitle>}
        {desc !== undefined && <CardDescription>{String(desc)}</CardDescription>}
        {status !== undefined && <Badge className="w-fit">{String(status)}</Badge>}
        {title === undefined && desc === undefined && status === undefined && (
          <CardTitle className="text-base text-muted-foreground text-sm font-normal">Item</CardTitle>
        )}
      </CardHeader>
      {bodyEntries.length > 0 && (
        <CardContent className="space-y-1">
          {bodyEntries.map(([k, v]) => {
            const prop = itemProps?.find((p) => p.name === k)
            return (
              <div key={k} className="flex gap-2 text-sm">
                <span className="text-muted-foreground font-medium min-w-[6rem] shrink-0">{k}</span>
                <SmartCell value={v} prop={prop} />
              </div>
            )
          })}
        </CardContent>
      )}
    </Card>
  )
}

function DataCards({
  items,
  itemProps,
}: {
  items: Record<string, unknown>[]
  itemProps?: SchemaProp[]
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item, i) => (
        <DataCard key={i} item={item} itemProps={itemProps} />
      ))}
    </div>
  )
}

function DataList({ items, itemProps }: { items: unknown[]; itemProps?: SchemaProp[] }) {
  const titleProp = itemProps?.find((p) => p.display?.role === "title")
  return (
    <ul className="space-y-1 list-none">
      {items.map((item, i) => {
        const label =
          titleProp && typeof item === "object" && item !== null
            ? String((item as Record<string, unknown>)[titleProp.name] ?? JSON.stringify(item))
            : typeof item === "object"
            ? JSON.stringify(item)
            : String(item)
        return (
          <li key={i} className="flex gap-2 text-sm py-0.5">
            <span className="text-muted-foreground select-none">{i + 1}.</span>
            <span>{label}</span>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Object rendering ─────────────────────────────────────────────────────────

function DataObjectCard({
  obj,
  props,
}: {
  obj: Record<string, unknown>
  props?: SchemaProp[]
}) {
  const titleProp = props?.find((p) => p.display?.role === "title")
  const descProp = props?.find((p) => p.display?.role === "description")
  const statusProp = props?.find((p) => p.display?.role === "status")
  const usedNames = new Set(
    [titleProp?.name, descProp?.name, statusProp?.name].filter(Boolean) as string[]
  )

  const title = titleProp ? obj[titleProp.name] : undefined
  const desc = descProp ? obj[descProp.name] : undefined
  const status = statusProp ? obj[statusProp.name] : undefined

  const bodyEntries = Object.entries(obj).filter(([k]) => {
    if (usedNames.has(k)) return false
    const p = props?.find((p) => p.name === k)
    return p?.display?.as !== "hidden"
  })

  return (
    <Card>
      {(title !== undefined || desc !== undefined || status !== undefined) && (
        <CardHeader className="pb-3">
          {title !== undefined && <CardTitle className="text-base">{String(title)}</CardTitle>}
          {desc !== undefined && <CardDescription>{String(desc)}</CardDescription>}
          {status !== undefined && <Badge className="w-fit">{String(status)}</Badge>}
        </CardHeader>
      )}
      {bodyEntries.length > 0 && (
        <CardContent className="space-y-1">
          {bodyEntries.map(([k, v]) => {
            const prop = props?.find((p) => p.name === k)
            return (
              <div key={k} className="flex gap-2 text-sm">
                <span className="text-muted-foreground font-medium min-w-[8rem] shrink-0">{k}</span>
                <SmartCell value={v} prop={prop} />
              </div>
            )
          })}
        </CardContent>
      )}
    </Card>
  )
}

function DataObjectDetails({ obj, props }: { obj: Record<string, unknown>; props?: SchemaProp[] }) {
  const entries = Object.entries(obj).filter(([k]) => {
    const p = props?.find((p) => p.name === k)
    return p?.display?.as !== "hidden"
  })
  return (
    <dl className="space-y-2">
      {entries.map(([k, v]) => {
        const prop = props?.find((p) => p.name === k)
        return (
          <div key={k} className="flex gap-3 text-sm">
            <dt className="text-muted-foreground font-medium min-w-[8rem] shrink-0">{k}</dt>
            <dd>
              <SmartCell value={v} prop={prop} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function DataView({
  data,
  displayProps,
  renderLayout,
}: {
  data: unknown
  /** Schema props with display config — from the structured node's schemaProps */
  displayProps?: SchemaProp[] | unknown[]
  /** Legacy flat render layout — fallback when displayProps absent */
  renderLayout?: RenderLayoutConfig
}) {
  const schemaProps = displayProps as SchemaProp[] | undefined

  // ── Array ──────────────────────────────────────────────────────────────────
  if (Array.isArray(data)) {
    const rows = data as Record<string, unknown>[]
    const firstIsObj =
      rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null && !Array.isArray(rows[0])

    if (firstIsObj) {
      // displayProps here are the item properties (passed from SmartCell for nested arrays)
      const cols = resolveColumns(rows, schemaProps)
      const arrayAs = renderLayout?.arrayAs ?? "auto"
      if (arrayAs === "cards") return <DataCards items={rows} itemProps={schemaProps} />
      if (arrayAs === "list") return <DataList items={rows} itemProps={schemaProps} />
      return <DataTable rows={rows} columns={cols} itemProps={schemaProps} />
    }

    // Array of primitives — check for "badges" display
    const asPrim = schemaProps?.[0]?.display?.as
    if (asPrim === "badges") {
      return (
        <div className="flex flex-wrap gap-1">
          {(data as unknown[]).map((v, i) => (
            <Badge key={i} variant="secondary">{String(v)}</Badge>
          ))}
        </div>
      )
    }
    if (asPrim === "comma") {
      return <span className="text-sm">{(data as unknown[]).map(String).join(", ")}</span>
    }
    return <DataList items={data} itemProps={schemaProps} />
  }

  // ── Object ─────────────────────────────────────────────────────────────────
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>

    // If we have schema props, use them to drive rendering
    if (schemaProps?.length) {
      // Find the first non-hidden prop that is an array — render it as the primary content
      const arrayProp = schemaProps.find(
        (p) => p.type === "array" && p.display?.as !== "hidden"
      )
      if (arrayProp && Array.isArray(obj[arrayProp.name])) {
        const arrAs = arrayProp.display?.as ?? "auto"
        const arrData = obj[arrayProp.name] as unknown[]
        const itemProps = arrayProp.itemProperties

        if (arrAs === "cards") return <DataCards items={arrData as Record<string, unknown>[]} itemProps={itemProps} />
        if (arrAs === "list") return <DataList items={arrData} itemProps={itemProps} />
        if (arrAs === "table" || (arrAs === "auto" && itemProps?.length)) {
          const rows = arrData as Record<string, unknown>[]
          const cols = resolveColumns(rows, itemProps)
          return <DataTable rows={rows} columns={cols} itemProps={itemProps} />
        }
        // Auto with primitive items
        return <DataList items={arrData} itemProps={itemProps} />
      }

      // Object display config
      const objAs = schemaProps.find((p) => p.type === "object")?.display?.as
      if (objAs === "details") return <DataObjectDetails obj={obj} props={schemaProps} />
      return <DataObjectCard obj={obj} props={schemaProps} />
    }

    // ── Fallback: legacy renderLayout or auto-detect ─────────────────────────
    const objectAs = renderLayout?.objectAs ?? "auto"
    if (objectAs === "details") return <DataObjectDetails obj={obj} />

    // Auto-unwrap: single-key object whose value is an array → render the array
    if (objectAs === "auto") {
      const entries = Object.entries(obj)
      if (entries.length === 1 && Array.isArray(entries[0][1])) {
        return <DataView data={entries[0][1]} renderLayout={renderLayout} />
      }
      // All-arrays object → render each as a labeled section
      const arrayEntries = entries.filter(([, v]) => Array.isArray(v))
      if (arrayEntries.length > 0 && arrayEntries.length === entries.length) {
        return (
          <div className="space-y-4">
            {arrayEntries.map(([key, arr]) => (
              <div key={key} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{key}</p>
                <DataView data={arr} renderLayout={renderLayout} />
              </div>
            ))}
          </div>
        )
      }
    }

    return <DataObjectCard obj={obj} />
  }

  // ── Primitive ──────────────────────────────────────────────────────────────
  return <p className="text-sm text-muted-foreground">{String(data ?? "")}</p>
}
