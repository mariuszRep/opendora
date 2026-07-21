import { dump } from "js-yaml"
import type { SchemaProp } from "@/components/workflow/schema-builder"

export type RenderLayoutConfig = {
  arrayAs?: "auto" | "table" | "cards" | "list"
  objectAs?: "auto" | "card" | "details"
  titleField?: string
  descriptionField?: string
  statusField?: string
  imageField?: string
  iconField?: string
  metadataFields?: string[]
  actions?: string[]
  visibleFields?: string[]
  fieldOrder?: string[]
}

export function dataToJson(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

export function dataToYaml(data: unknown): string {
  return dump(data, { indent: 2, lineWidth: -1, noRefs: true })
}

function cleanTagName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[^a-z]+/, "")
  return cleaned || "item"
}

function valueToXml(value: unknown, tag: string, depth: number): string {
  const pad = "  ".repeat(depth)
  const innerPad = "  ".repeat(depth + 1)

  if (value === null || value === undefined) {
    return `${pad}<${tag}/>`
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => valueToXml(item, "item", depth + 1))
      .join("\n")
    return `${pad}<${tag}>\n${items}\n${pad}</${tag}>`
  }

  if (typeof value === "object") {
    const children = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => valueToXml(v, cleanTagName(k), depth + 1))
      .join("\n")
    if (children) {
      return `${pad}<${tag}>\n${children}\n${pad}</${tag}>`
    }
    return `${pad}<${tag}/>`
  }

  const text = String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return `${pad}<${tag}>${text}</${tag}>`
}

export function dataToXml(data: unknown, rootName = "root"): string {
  const body = valueToXml(data, cleanTagName(rootName) || "root", 0)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
}

function escapeMarkdown(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return `\`${JSON.stringify(value)}\``
  return String(value).replace(/\|/g, "\\|")
}

export function dataToMarkdown(data: unknown): string {
  if (data === null || data === undefined) return "(empty)"

  if (Array.isArray(data)) {
    if (data.length === 0) return "(empty array)"

    const firstObj = data.find((item) => item !== null && typeof item === "object" && !Array.isArray(item))
    if (firstObj) {
      const allKeys = Array.from(
        new Set(data.flatMap((item) => (item !== null && typeof item === "object" && !Array.isArray(item) ? Object.keys(item as object) : [])))
      )
      if (allKeys.length > 0) {
        const header = `| ${allKeys.join(" | ")} |`
        const separator = `| ${allKeys.map(() => "---").join(" | ")} |`
        const rows = data.map((item) => {
          if (item !== null && typeof item === "object" && !Array.isArray(item)) {
            const row = allKeys.map((k) => escapeMarkdown((item as Record<string, unknown>)[k]))
            return `| ${row.join(" | ")} |`
          }
          return `| ${escapeMarkdown(item)}${allKeys.slice(1).map(() => " | ").join("")} |`
        })
        return [header, separator, ...rows].join("\n")
      }
    }

    return data.map((item, i) => `${i + 1}. ${escapeMarkdown(item)}`).join("\n")
  }

  if (typeof data === "object") {
    return Object.entries(data as Record<string, unknown>)
      .map(([k, v]) => `- **${k}**: ${escapeMarkdown(v)}`)
      .join("\n")
  }

  return String(data)
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function resolveField(obj: Record<string, unknown>, fieldPath: string): unknown {
  return fieldPath.split(".").reduce<unknown>((acc, key) =>
    acc !== null && acc !== undefined && typeof acc === "object"
      ? (acc as Record<string, unknown>)[key]
      : undefined,
    obj
  )
}

function pickFields(obj: Record<string, unknown>, layout: RenderLayoutConfig): [string, unknown][] {
  let keys = Object.keys(obj)
  if (layout.visibleFields && layout.visibleFields.length > 0) {
    keys = keys.filter((k) => layout.visibleFields!.includes(k))
  }
  if (layout.fieldOrder && layout.fieldOrder.length > 0) {
    const ordered = layout.fieldOrder.filter((k) => keys.includes(k))
    const rest = keys.filter((k) => !layout.fieldOrder!.includes(k))
    keys = [...ordered, ...rest]
  }
  return keys.map((k) => [k, obj[k]])
}

const HTML_STYLE = `
  :root { --bg:#fff;--fg:#111;--border:#e5e7eb;--muted:#6b7280;--label:#374151;--accent:#3b82f6;--badge-bg:#dbeafe;--badge-fg:#1e40af; }
  @media (prefers-color-scheme:dark) {
    :root { --bg:#1f2937;--fg:#f9fafb;--border:#374151;--muted:#9ca3af;--label:#d1d5db;--accent:#60a5fa;--badge-bg:#1e3a5f;--badge-fg:#93c5fd; }
  }
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:var(--fg);background:var(--bg);margin:0;padding:16px;line-height:1.5}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{padding:6px 10px;text-align:left;border-bottom:2px solid var(--border);white-space:nowrap;color:var(--label)}
  td{padding:6px 10px;border-bottom:1px solid var(--border)}
  tr:hover td{background:color-mix(in srgb,var(--border) 40%,transparent)}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
  .card{border:1px solid var(--border);border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:8px}
  .card-img{width:100%;max-height:120px;object-fit:cover;border-radius:4px}
  .card-title{font-weight:600;font-size:15px;margin:0}
  .card-desc{color:var(--muted);font-size:13px;margin:0}
  .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:var(--badge-bg);color:var(--badge-fg)}
  .card-meta{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px}
  .card-meta span strong{color:var(--label)}
  .card-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
  .card-actions a,.card-actions button{padding:4px 10px;border-radius:5px;font-size:12px;background:var(--accent);color:#fff;text-decoration:none;border:none;cursor:pointer}
  .list-item{display:flex;flex-direction:column;padding:10px 0;border-bottom:1px solid var(--border)}
  .list-item:last-child{border-bottom:none}
  .list-title{font-weight:600}
  .list-desc{color:var(--muted);font-size:13px}
  .details-title{font-size:20px;font-weight:700;margin:0 0 4px}
  .details-desc{color:var(--muted);margin:0 0 12px}
  dl{margin:0} dt{font-weight:600;color:var(--label);margin-top:8px} dd{margin:2px 0 0 16px}
  code{background:color-mix(in srgb,var(--border) 60%,transparent);padding:1px 4px;border-radius:3px;font-size:11px}
`

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<style>${HTML_STYLE}</style>\n</head>\n<body>${body}</body>\n</html>`
}

// ── Layout renderers ──────────────────────────────────────────────────────────

function renderTable(arr: unknown[], layout: RenderLayoutConfig): string {
  if (arr.length === 0) return "<em>No items</em>"
  const allKeys = Array.from(new Set(arr.flatMap((item) =>
    item !== null && typeof item === "object" && !Array.isArray(item) ? Object.keys(item as object) : []
  )))
  let cols = allKeys
  if (layout.visibleFields?.length) cols = cols.filter((k) => layout.visibleFields!.includes(k))
  if (layout.fieldOrder?.length) {
    const ord = layout.fieldOrder.filter((k) => cols.includes(k))
    const rest = cols.filter((k) => !layout.fieldOrder!.includes(k))
    cols = [...ord, ...rest]
  }
  if (!cols.length) cols = allKeys
  const thead = cols.map((k) => `<th>${escHtml(k)}</th>`).join("")
  const tbody = arr.map((item) => {
    const obj = (item !== null && typeof item === "object" && !Array.isArray(item)) ? item as Record<string, unknown> : {}
    const cells = cols.map((k) => {
      const v = obj[k]
      const disp = v === null || v === undefined ? "" : typeof v === "object" ? `<code>${escHtml(JSON.stringify(v))}</code>` : escHtml(String(v))
      return `<td>${disp}</td>`
    }).join("")
    return `<tr>${cells}</tr>`
  }).join("")
  return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`
}

function renderCard(item: Record<string, unknown>, layout: RenderLayoutConfig): string {
  const title = layout.titleField ? resolveField(item, layout.titleField) : undefined
  const desc = layout.descriptionField ? resolveField(item, layout.descriptionField) : undefined
  const status = layout.statusField ? resolveField(item, layout.statusField) : undefined
  const img = layout.imageField ? resolveField(item, layout.imageField) : undefined

  const usedFields = new Set<string>([
    layout.titleField, layout.descriptionField, layout.statusField,
    layout.imageField, layout.iconField,
    ...(layout.metadataFields ?? []),
    ...(layout.actions ?? []),
  ].filter(Boolean) as string[])

  let autoTitle: unknown
  let autoDesc: unknown

  if (!title && !desc) {
    const keys = Object.keys(item)
    const strKeys = keys.filter((k) => typeof item[k] === "string" || typeof item[k] === "number")
    autoTitle = strKeys[0] !== undefined ? item[strKeys[0]] : undefined
    autoDesc = strKeys[1] !== undefined ? item[strKeys[1]] : undefined
    if (strKeys[0]) usedFields.add(strKeys[0])
    if (strKeys[1]) usedFields.add(strKeys[1])
  }

  const effectiveTitle = title ?? autoTitle
  const effectiveDesc = desc ?? autoDesc

  let metaEntries = (layout.metadataFields ?? []).map((f) => [f, resolveField(item, f)] as [string, unknown])
  if (metaEntries.length === 0) {
    const remaining = pickFields(item, layout).filter(([k]) => !usedFields.has(k))
    metaEntries = remaining
  }

  const imgHtml = img ? `<img class="card-img" src="${escHtml(String(img))}" alt="" />` : ""
  const titleHtml = effectiveTitle != null ? `<p class="card-title">${escHtml(String(effectiveTitle))}</p>` : ""
  const statusHtml = status != null ? `<span class="badge">${escHtml(String(status))}</span>` : ""
  const descHtml = effectiveDesc != null ? `<p class="card-desc">${escHtml(String(effectiveDesc))}</p>` : ""
  const metaHtml = metaEntries.length > 0
    ? `<div class="card-meta">${metaEntries.map(([k, v]) =>
        `<span><strong>${escHtml(k)}:</strong> ${v === null || v === undefined ? "" : typeof v === "object" ? `<code>${escHtml(JSON.stringify(v))}</code>` : escHtml(String(v))}</span>`
      ).join("")}</div>`
    : ""
  const actionsHtml = (layout.actions ?? []).length > 0
    ? `<div class="card-actions">${(layout.actions!).map((f) => {
        const v = resolveField(item, f)
        return `<a href="${escHtml(String(v ?? "#"))}">${escHtml(f)}</a>`
      }).join("")}</div>`
    : ""

  return `<div class="card">${imgHtml}${titleHtml}${statusHtml}${descHtml}${metaHtml}${actionsHtml}</div>`
}

function renderCards(arr: unknown[], layout: RenderLayoutConfig): string {
  const items = arr.map((item) => {
    const obj = (item !== null && typeof item === "object" && !Array.isArray(item)) ? item as Record<string, unknown> : {}
    return renderCard(obj, layout)
  }).join("")
  return `<div class="cards">${items}</div>`
}

function renderList(arr: unknown[], layout: RenderLayoutConfig): string {
  const items = arr.map((item) => {
    if (item === null || item === undefined) return `<div class="list-item"><span class="list-title">${escHtml(String(item))}</span></div>`
    if (typeof item !== "object" || Array.isArray(item)) {
      return `<div class="list-item"><span class="list-title">${escHtml(String(item))}</span></div>`
    }
    const obj = item as Record<string, unknown>
    const title = layout.titleField ? resolveField(obj, layout.titleField) : undefined
    const desc = layout.descriptionField ? resolveField(obj, layout.descriptionField) : undefined
    const autoTitle = title ?? (Object.values(obj).find((v) => typeof v === "string" || typeof v === "number"))
    const autoDesc = desc ?? (Object.values(obj).filter((v) => typeof v === "string" || typeof v === "number")[1])
    return `<div class="list-item">
  <span class="list-title">${autoTitle != null ? escHtml(String(autoTitle)) : ""}</span>
  ${autoDesc != null ? `<span class="list-desc">${escHtml(String(autoDesc))}</span>` : ""}
</div>`
  }).join("")
  return `<div>${items}</div>`
}

function renderObjectCard(obj: Record<string, unknown>, layout: RenderLayoutConfig): string {
  return `<div class="cards"><div style="max-width:480px">${renderCard(obj, layout)}</div></div>`
}

function renderObjectDetails(obj: Record<string, unknown>, layout: RenderLayoutConfig): string {
  const title = layout.titleField ? resolveField(obj, layout.titleField) : undefined
  const desc = layout.descriptionField ? resolveField(obj, layout.descriptionField) : undefined
  const usedFields = new Set<string>([layout.titleField, layout.descriptionField].filter(Boolean) as string[])
  const rest = pickFields(obj, layout).filter(([k]) => !usedFields.has(k))
  const titleHtml = title != null ? `<h1 class="details-title">${escHtml(String(title))}</h1>` : ""
  const descHtml = desc != null ? `<p class="details-desc">${escHtml(String(desc))}</p>` : ""
  const fieldHtml = rest.map(([k, v]) => {
    const disp = v === null || v === undefined ? "" : typeof v === "object" ? `<code>${escHtml(JSON.stringify(v))}</code>` : escHtml(String(v))
    return `<dt>${escHtml(k)}</dt><dd>${disp}</dd>`
  }).join("")
  return `${titleHtml}${descHtml}<dl>${fieldHtml}</dl>`
}

// ── Default (phase-1 auto) rendering ─────────────────────────────────────────

function valueToHtmlAuto(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return `<em style="color:var(--muted)">null</em>`

  if (Array.isArray(value)) {
    if (value.length === 0) return `<em style="color:var(--muted)">(empty)</em>`
    const firstObj = value.find((item) => item !== null && typeof item === "object" && !Array.isArray(item))
    if (firstObj) {
      const allKeys = Array.from(new Set(value.flatMap((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item) ? Object.keys(item as object) : []
      )))
      if (allKeys.length > 0) {
        const thCells = allKeys.map((k) => `<th>${escHtml(k)}</th>`).join("")
        const rows = value.map((item) => {
          const cells = allKeys.map((k) => {
            const v = item !== null && typeof item === "object" ? (item as Record<string, unknown>)[k] : undefined
            const cellVal = typeof v === "object" ? `<code>${escHtml(JSON.stringify(v))}</code>` : escHtml(String(v ?? ""))
            return `<td>${cellVal}</td>`
          }).join("")
          return `<tr>${cells}</tr>`
        }).join("")
        return `<table><thead><tr>${thCells}</tr></thead><tbody>${rows}</tbody></table>`
      }
    }
    const items = value.map((item) => `<li>${valueToHtmlAuto(item, depth + 1)}</li>`).join("")
    return `<ol style="margin:0;padding-left:20px">${items}</ol>`
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return `<em style="color:var(--muted)">(empty object)</em>`
    const rows = entries.map(([k, v]) => `<dt>${escHtml(k)}</dt><dd>${valueToHtmlAuto(v, depth + 1)}</dd>`).join("")
    return `<dl>${rows}</dl>`
  }

  return escHtml(String(value))
}

// ── schemaProps-driven renderers ─────────────────────────────────────────────
// Mirrors apps/web/components/ai-elements/data-view.tsx's component structure
// (DataCard/DataObjectCard/DataTable/DataList/DataObjectDetails/SmartCell)
// exactly, so HTML Code and Preview make the same layout decisions off the same
// schemaProps data — this is the primary path now (schemaProps, set via the
// SchemaBuilder UI's per-field Display/Role controls, always exist once a
// Structured node's output schema has been edited). renderLayout is only
// consulted as a legacy fallback when schemaProps is absent entirely.

function propByName(props: SchemaProp[] | undefined, name: string): SchemaProp | undefined {
  return props?.find((p) => p.name === name)
}

function isHidden(props: SchemaProp[] | undefined, name: string): boolean {
  return propByName(props, name)?.display?.as === "hidden"
}

// Mirrors SmartCell: hidden → nothing, link/badge/image display hints, else plain value.
function cellHtmlSP(value: unknown, prop?: SchemaProp): string {
  const as = prop?.display?.as ?? "auto"
  if (as === "hidden") return ""
  if (value === null || value === undefined) return `<span style="color:var(--muted)">—</span>`
  if (as === "link" || (as === "auto" && typeof value === "string" && /^https?:\/\//.test(value))) {
    return `<a href="${escHtml(String(value))}" target="_blank" rel="noopener noreferrer">${escHtml(String(value))}</a>`
  }
  if (as === "badge") return `<span class="badge">${escHtml(String(value))}</span>`
  if (as === "image" && typeof value === "string") return `<img class="card-img" src="${escHtml(value)}" alt="" style="max-height:40px;max-width:40px" />`
  if (typeof value === "object") return `<code>${escHtml(JSON.stringify(value))}</code>`
  return escHtml(String(value))
}

// Mirrors resolveColumns + DataTable.
function renderTableSP(rows: Record<string, unknown>[], itemProps?: SchemaProp[]): string {
  if (rows.length === 0) return "<em>No items</em>"
  let cols = Object.keys(rows[0] ?? {})
  if (itemProps?.length) {
    const schemaNames = itemProps.filter((p) => p.display?.as !== "hidden").map((p) => p.name).filter(Boolean)
    const ordered = schemaNames.filter((n) => cols.includes(n))
    const rest = cols.filter((n) => !schemaNames.includes(n))
    cols = [...ordered, ...rest]
  }
  const thead = cols.map((k) => `<th>${escHtml(k)}</th>`).join("")
  const tbody = rows.map((row) => {
    const cells = cols.map((k) => `<td>${cellHtmlSP(row[k], propByName(itemProps, k))}</td>`).join("")
    return `<tr>${cells}</tr>`
  }).join("")
  return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`
}

// Mirrors DataCard/DataObjectCard (shared logic — used for both array items and a single tagged object).
function renderCardSP(obj: Record<string, unknown>, props?: SchemaProp[]): string {
  const titleProp = props?.find((p) => p.display?.role === "title")
  const descProp = props?.find((p) => p.display?.role === "description")
  const statusProp = props?.find((p) => p.display?.role === "status")
  const footerProp = props?.find((p) => p.display?.role === "footer")
  const usedNames = new Set([titleProp?.name, descProp?.name, statusProp?.name, footerProp?.name].filter(Boolean) as string[])

  const title = titleProp ? obj[titleProp.name] : undefined
  const desc = descProp ? obj[descProp.name] : undefined
  const status = statusProp ? obj[statusProp.name] : undefined
  const footer = footerProp ? obj[footerProp.name] : undefined

  const bodyEntries = Object.entries(obj).filter(([k]) => !usedNames.has(k) && !isHidden(props, k))

  const titleHtml = title !== undefined ? `<p class="card-title">${escHtml(String(title))}</p>` : ""
  const descHtml = desc !== undefined ? `<p class="card-desc">${escHtml(String(desc))}</p>` : ""
  const statusHtml = status !== undefined ? `<span class="badge">${escHtml(String(status))}</span>` : ""
  const bodyHtml = bodyEntries.length > 0
    ? `<div class="card-meta">${bodyEntries.map(([k, v]) => `<span><strong>${escHtml(k)}:</strong> ${cellHtmlSP(v, propByName(props, k))}</span>`).join("")}</div>`
    : ""
  const footerHtml = footer !== undefined ? `<div class="card-footer"><span class="badge">${escHtml(String(footer))}</span></div>` : ""

  return `<div class="card">${titleHtml}${statusHtml}${descHtml}${bodyHtml}${footerHtml}</div>`
}

function renderCardsSP(items: unknown[], itemProps?: SchemaProp[]): string {
  const html = items.map((item) => {
    const obj = (item !== null && typeof item === "object" && !Array.isArray(item)) ? item as Record<string, unknown> : {}
    return renderCardSP(obj, itemProps)
  }).join("")
  return `<div class="cards">${html}</div>`
}

// Mirrors DataList: title-tagged field only, falls back to the item's JSON/string form.
function renderListSP(items: unknown[], itemProps?: SchemaProp[]): string {
  const titleProp = itemProps?.find((p) => p.display?.role === "title")
  const html = items.map((item) => {
    const label = titleProp && typeof item === "object" && item !== null
      ? String((item as Record<string, unknown>)[titleProp.name] ?? JSON.stringify(item))
      : typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)
    return `<div class="list-item"><span class="list-title">${escHtml(label)}</span></div>`
  }).join("")
  return `<div>${html}</div>`
}

// Mirrors DataObjectDetails: flat, hidden-filtered field list — no title/description
// promotion (that's what the tagged-card path below is for; Details is deliberately
// the "just show me everything, plainly" mode).
function renderFlatSP(obj: Record<string, unknown>, props?: SchemaProp[]): string {
  const entries = Object.entries(obj).filter(([k]) => !isHidden(props, k))
  const rows = entries.map(([k, v]) => `<dt>${escHtml(k)}</dt><dd>${cellHtmlSP(v, propByName(props, k))}</dd>`).join("")
  return `<dl>${rows}</dl>`
}

// Mirrors DataView's object+schemaProps branch exactly: promote a primary array
// field via its own Display setting; else a details-tagged nested object field;
// else a single tagged object renders as a card, an untagged one renders flat
// (a lone object gets no benefit from a card wrapper — see this goal's history).
function renderObjectSP(obj: Record<string, unknown>, schemaProps: SchemaProp[]): string {
  const arrayProp = schemaProps.find((p) => p.type === "array" && p.display?.as !== "hidden")
  if (arrayProp && Array.isArray(obj[arrayProp.name])) {
    const arrAs = arrayProp.display?.as ?? "auto"
    const arrData = obj[arrayProp.name] as unknown[]
    const itemProps = arrayProp.itemProperties
    if (arrAs === "cards") return renderCardsSP(arrData, itemProps)
    if (arrAs === "list") return renderListSP(arrData, itemProps)
    if (arrAs === "table" || (arrAs === "auto" && itemProps?.length)) {
      return renderTableSP(arrData as Record<string, unknown>[], itemProps)
    }
    return renderListSP(arrData, itemProps)
  }

  const objAs = schemaProps.find((p) => p.type === "object")?.display?.as
  if (objAs === "details") return renderFlatSP(obj, schemaProps)

  const hasAnyRole = schemaProps.some((p) => ["title", "description", "status", "footer"].includes(p.display?.role ?? ""))
  return hasAnyRole ? renderCardSP(obj, schemaProps) : renderFlatSP(obj, schemaProps)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function dataToHtml(data: unknown, renderLayout?: RenderLayoutConfig, schemaProps?: SchemaProp[]): string {
  let body: string

  if (typeof data === "object" && data !== null && !Array.isArray(data) && schemaProps?.length) {
    body = renderObjectSP(data as Record<string, unknown>, schemaProps)
  } else if (Array.isArray(data)) {
    // Top-level array output — rare (SchemaBuilder only builds object-root schemas),
    // reachable only via hand-authored workflow JSON. Legacy renderLayout-driven path.
    const arrayAs = renderLayout?.arrayAs ?? "auto"
    if (arrayAs === "table") body = renderTable(data, renderLayout ?? {})
    else if (arrayAs === "cards") body = renderCards(data, renderLayout ?? {})
    else if (arrayAs === "list") body = renderList(data, renderLayout ?? {})
    else body = valueToHtmlAuto(data)
  } else if (typeof data === "object" && data !== null) {
    // Object with no schemaProps — legacy renderLayout fallback, mirrors DataView's
    // own fallback branch (explicit details/card, or auto single-array-key unwrap).
    const obj = data as Record<string, unknown>
    const objectAs = renderLayout?.objectAs ?? "auto"
    if (objectAs === "details") {
      body = renderFlatSP(obj, undefined)
    } else if (objectAs === "card") {
      body = renderCardSP(obj, undefined)
    } else {
      const entries = Object.entries(obj)
      if (entries.length === 1 && Array.isArray(entries[0][1])) {
        body = dataToHtmlBody(entries[0][1], renderLayout, undefined)
      } else {
        const arrayEntries = entries.filter(([, v]) => Array.isArray(v))
        if (arrayEntries.length > 0 && arrayEntries.length === entries.length) {
          body = arrayEntries.map(([key, arr]) =>
            `<div style="margin-bottom:16px"><p style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;margin:0 0 4px">${escHtml(key)}</p>${dataToHtmlBody(arr, renderLayout, undefined)}</div>`
          ).join("")
        } else {
          body = renderFlatSP(obj, undefined)
        }
      }
    }
  } else {
    body = valueToHtmlAuto(data)
  }

  return wrapHtml(body)
}

// Body-only variant (no <html> wrapper) for recursive calls within dataToHtml's fallback branch.
function dataToHtmlBody(data: unknown, renderLayout?: RenderLayoutConfig, schemaProps?: SchemaProp[]): string {
  const full = dataToHtml(data, renderLayout, schemaProps)
  const match = full.match(/<body>([\s\S]*)<\/body>/)
  return match ? match[1] : full
}

export function translateAll(
  data: unknown,
  renderLayout?: RenderLayoutConfig,
  schemaProps?: SchemaProp[],
): Record<"json" | "yaml" | "xml" | "markdown" | "html", string> {
  return {
    json: dataToJson(data),
    yaml: dataToYaml(data),
    xml: dataToXml(data),
    markdown: dataToMarkdown(data),
    html: dataToHtml(data, renderLayout, schemaProps),
  }
}
