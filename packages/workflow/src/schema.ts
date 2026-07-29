import { z } from "zod"

// ─── Decide Node ──────────────────────────────────────────────────────────────

export const DecideOp = z.enum([
  "equals", "not_equals",
  "in", "not_in",
  "contains", "not_contains",
  "matches", "not_matches",
  "gt", "gte", "lt", "lte",
  "exists", "not_exists",
  "is_empty", "is_not_empty",
])
export type DecideOp = z.infer<typeof DecideOp>

export const DecideWhen = z.object({
  op: DecideOp,
  value: z.unknown().optional(),
})
export type DecideWhen = z.infer<typeof DecideWhen>

export const DecideCase = z.object({
  label: z.string(),
  when: DecideWhen.optional(),
})
export type DecideCase = z.infer<typeof DecideCase>

export const DecideParameters = z.object({
  mode: z.enum(["agent", "deterministic"]).default("agent"),
  input: z.string().optional(),
  cases: z.array(DecideCase).default([]),
  default: z.string().optional(),
  output: z.string().optional(),
})
export type DecideParameters = z.infer<typeof DecideParameters>

// ─── Node + Edge ──────────────────────────────────────────────────────────────

export const WorkflowNode = z.object({
  id: z.string(),
  type: z.literal("workflow"),
  data: z.record(z.string(), z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
})
export type WorkflowNode = z.infer<typeof WorkflowNode>

export const WorkflowEdge = z.object({
  id: z.string(),
  source: z.string().describe("Source node id"),
  target: z.string().describe("Target node id"),
  label: z.string().optional().describe("For decide nodes: the branch label this edge represents"),
})
export type WorkflowEdge = z.infer<typeof WorkflowEdge>

// ─── Workflow ─────────────────────────────────────────────────────────────────

export const Workflow = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default("1.0.0"),
  nodes: z.array(WorkflowNode),
  edges: z.array(WorkflowEdge),
})
export type Workflow = z.infer<typeof Workflow>

// ─── Reference resolution ─────────────────────────────────────────────────────

/** How a $ctx/$node reference embedded in prose is rendered by resolveTemplate.
 *  - "value"   : inline the full referenced value (String(val)) — the historical behavior.
 *  - "pointer" : render a compact citation instead of the full value, for nodes that run
 *                inline in the shared session where the referenced output is already visible. */
export type RefRenderMode = "value" | "pointer"

export interface RefRenderOptions {
  mode?: RefRenderMode
  /** ctx keys whose producing node emitted a tool card during the current run. In "pointer"
   *  mode a ref is only rendered as a pointer when its top-level key is present here; otherwise
   *  it falls back to the full value. Keys hydrated from a prior run (resume) are conservatively
   *  absent, so their refs expand to full text. */
  presentKeys?: Set<string>
  /** Produces the citation text for a pointer-eligible reference. `key` is the top-level ctx key,
   *  `path` the optional dot-path after it, `label` a human-readable name for the producing step. */
  renderPointer?: (key: string, path: string | undefined, label: string) => string
}

function defaultRenderPointer(key: string, path: string | undefined, label: string): string {
  const field = path ? `.${path}` : ""
  return `«output of the "${label}" step, shown above (referenced as $${key}${field})»`
}

export function resolveRef(
  value: string,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
): unknown {
  // Legacy: $input.x / $ctx.x / $output.x — kept for backward compatibility
  // Path uses dot-separated identifiers (no trailing dot) so sentence punctuation
  // like "$ctx.today_date." does not get consumed as part of the path.
  const legacy = /^\$(input|output|ctx)\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)$/.exec(value)
  if (legacy) {
    const [, ns, path] = legacy
    return getPath(ns === "input" ? input : ctx, path!)
  }
  // New: $nodeKey  or  $nodeKey.field.subfield
  // nodeKey must start with a letter and contain only lowercase letters, digits, underscores
  const nodeRef = /^\$([a-z][a-z0-9_]*)(?:\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*))?$/.exec(value)
  if (nodeRef) {
    const [, key, path] = nodeRef
    if (key === "input") return path ? getPath(input, path) : input
    const nodeVal = ctx[key!]
    if (path === undefined) return nodeVal
    return nodeVal != null && typeof nodeVal === "object"
      ? getPath(nodeVal as Record<string, unknown>, path)
      : undefined
  }
  // String with embedded references → substitute all occurrences in-place
  return resolveTemplate(value, input, ctx)
}

export function resolveRefs(
  args: Record<string, string>,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    out[k] = resolveRef(v, input, ctx)
  }
  return out
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => {
    if (cur && typeof cur === "object") return (cur as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

export function resolveDeep(
  value: unknown,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
): unknown {
  if (typeof value === "string") return resolveRef(value, input, ctx)
  if (Array.isArray(value)) return value.map((item) => resolveDeep(item, input, ctx))
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveDeep(v, input, ctx)
    }
    return out
  }
  return value
}

// Plain values embed as-is (String(42) === "42", no surprise quoting); objects/arrays
// have no meaningful String() form ("[object Object]" / comma-joined garbage), so those
// get JSON.stringify'd instead — lets a bash/tool node's command reference a structured
// node's array/object field (e.g. "$ctx.review.decisions") directly and receive real,
// parseable JSON, instead of every workflow author needing the node to *also* emit a
// redundant hand-serialized "payload_json" string just to work around this.
function stringifyRefValue(val: unknown): string {
  if (val == null) return ""
  if (typeof val === "object") return JSON.stringify(val)
  return String(val)
}

export function resolveTemplate(
  template: string,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
  opts?: RefRenderOptions,
): string {
  // Replace legacy $input.x / $ctx.x / $output.x AND new $nodeKey / $nodeKey.field
  // Path uses dot-separated identifiers (no trailing dot) so sentence punctuation
  // like "$ctx.today_date." does not get consumed as part of the path.
  const pointerMode = opts?.mode === "pointer"
  const presentKeys = opts?.presentKeys
  const renderPointer = opts?.renderPointer ?? defaultRenderPointer

  // A ctx-namespace reference is rendered as a compact pointer instead of its full value when:
  //   - we're in pointer mode, AND
  //   - the referenced top-level key was produced during the current run (present in the shared
  //     session history). $input.x refs are never pointer-eligible: inputs are small params that
  //     are not written as labeled cards into session history.
  const asPointer = (key: string, path: string | undefined): string | undefined => {
    if (!pointerMode) return undefined
    if (presentKeys && !presentKeys.has(key)) return undefined
    return renderPointer(key, path, key)
  }

  return template.replace(
    /\$(input|output|ctx)\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)|\$([a-z][a-z0-9_]*)(?:\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*))?/g,
    (match, legacyNs, legacyPath, nodeKey, nodePath) => {
      if (legacyNs) {
        if (legacyNs !== "input") {
          // $ctx.x / $output.x — the top-level ctx key is the first path segment.
          const [topKey, ...rest] = String(legacyPath).split(".")
          const pointer = asPointer(topKey!, rest.length > 0 ? rest.join(".") : undefined)
          if (pointer !== undefined) return pointer
        }
        const val = getPath(legacyNs === "input" ? input : ctx, legacyPath)
        return stringifyRefValue(val)
      }
      if (nodeKey) {
        if (nodeKey === "input") {
          const val = nodePath ? getPath(input, nodePath) : input
          return stringifyRefValue(val)
        }
        const pointer = asPointer(nodeKey, nodePath || undefined)
        if (pointer !== undefined) return pointer
        const nodeVal = ctx[nodeKey]
        const val = nodePath && nodeVal != null && typeof nodeVal === "object"
          ? getPath(nodeVal as Record<string, unknown>, nodePath)
          : nodeVal
        return stringifyRefValue(val)
      }
      return match
    }
  )
}

/** Compact one-line-per-key description of the workflow ctx, naming each key and a short
 *  type/shape hint but never the full value. Used in place of JSON.stringify(ctx) for prompts
 *  that run in the shared session (Decide routing, agent-driven tool fill) where the real
 *  outputs are already visible in the session history — the model only needs the key manifest. */
export function describeCtxManifest(ctx: Record<string, unknown>): string {
  const numberFmt = new Intl.NumberFormat("en-US")
  const describe = (val: unknown): string => {
    if (val === null) return "null"
    if (val === undefined) return "undefined"
    if (typeof val === "string") return `string (${numberFmt.format(val.length)} chars)`
    if (typeof val === "number") return "number"
    if (typeof val === "boolean") return "boolean"
    if (Array.isArray(val)) return `array[${val.length}]`
    if (typeof val === "object") {
      const keys = Object.keys(val as Record<string, unknown>)
      const shown = keys.slice(0, 8).join(", ")
      return `object { ${shown}${keys.length > 8 ? ", …" : ""} }`
    }
    return typeof val
  }
  return Object.entries(ctx)
    .map(([key, val]) => `- ${key}: ${describe(val)}`)
    .join("\n")
}
