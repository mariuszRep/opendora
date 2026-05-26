import { z } from "zod"

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
  if (value.startsWith("$input.")) return getPath(input, value.slice(7))
  if (value.startsWith("$ctx.")) return getPath(ctx, value.slice(5))
  return value
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
  return template.replace(/\$(input|ctx)\.([a-zA-Z0-9_.]+)/g, (_, ns, path) => {
    const val = getPath(ns === "input" ? input : ctx, path)
    return val == null ? "" : String(val)
  })
}
