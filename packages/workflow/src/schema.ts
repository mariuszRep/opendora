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

export function resolveRef(
  value: string,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
): unknown {
  // Pure reference (entire value is a single reference expression) → return raw value to preserve type
  const pure = /^\$(input|output|ctx)\.([a-zA-Z0-9_.]+)$/.exec(value)
  if (pure) {
    const [, ns, path] = pure
    return getPath(ns === "input" ? input : ctx, path)
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

export function resolveTemplate(
  template: string,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
): string {
  return template.replace(/\$(input|output|ctx)\.([a-zA-Z0-9_.]+)/g, (_, ns, path) => {
    const val = getPath(ns === "input" ? input : ctx, path)
    return val == null ? "" : String(val)
  })
}
