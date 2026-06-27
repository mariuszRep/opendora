import { dump } from "js-yaml"

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

// ── Public API ────────────────────────────────────────────────────────────────

export function dataToHtml(data: unknown, renderLayout?: RenderLayoutConfig): string {
  let body: string

  if (!renderLayout || ((!renderLayout.arrayAs || renderLayout.arrayAs === "auto") && (!renderLayout.objectAs || renderLayout.objectAs === "auto"))) {
    body = valueToHtmlAuto(data)
  } else if (Array.isArray(data)) {
    switch (renderLayout.arrayAs) {
      case "table": body = renderTable(data, renderLayout); break
      case "cards": body = renderCards(data, renderLayout); break
      case "list":  body = renderList(data, renderLayout); break
      default:      body = valueToHtmlAuto(data)
    }
  } else if (data !== null && typeof data === "object") {
    const obj = data as Record<string, unknown>
    switch (renderLayout.objectAs) {
      case "card":    body = renderObjectCard(obj, renderLayout); break
      case "details": body = renderObjectDetails(obj, renderLayout); break
      default:        body = valueToHtmlAuto(data)
    }
  } else {
    body = valueToHtmlAuto(data)
  }

  return wrapHtml(body)
}

export function translateAll(
  data: unknown,
  renderLayout?: RenderLayoutConfig,
): Record<"json" | "yaml" | "xml" | "markdown" | "html", string> {
  return {
    json: dataToJson(data),
    yaml: dataToYaml(data),
    xml: dataToXml(data),
    markdown: dataToMarkdown(data),
    html: dataToHtml(data, renderLayout),
  }
}
