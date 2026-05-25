import { z } from "zod"

// ─── Node data schemas ────────────────────────────────────────────────────────

export const InputNodeData = z.object({
  type: z.literal("input"),
  fields: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["string", "number", "boolean", "object"]).default("string"),
        required: z.boolean().default(true),
        description: z.string().optional(),
      }),
    )
    .default([]),
})

export const SkillLoadNodeData = z.object({
  type: z.literal("skill_load"),
  skill: z.string().describe("Skill name (matches .opendora/skill/<name>/)"),
  storeAs: z.string().optional().describe("Key name to store skill content in ctx (optional)"),
})

export const ToolCallNodeData = z.object({
  type: z.literal("tool_call"),
  tool: z.string().describe("Tool name to call (must be available in this session)"),
  args: z
    .record(z.string(), z.string())
    .default({})
    .describe("Tool arguments. Values may reference $input.<field> or $ctx.<key>"),
  agentArgs: z
    .array(z.string())
    .default([])
    .describe("Parameter names the agent should populate. One forced LLM call fills all of them."),
  output: z.string().optional().describe("Context key to store the tool result under"),
})

export const AgentNodeData = z.object({
  type: z.literal("agent"),
  prompt: z.string().describe("Instruction sent to the agent. May reference $input.<field> or $ctx.<key>"),
  output: z.string().optional().describe("Context key to store the agent's response text under"),
})

export const DecideNodeData = z.object({
  type: z.literal("decide"),
  prompt: z.string().describe("Question/instruction for the agent to decide between branches"),
  branches: z.array(z.string()).describe("Branch labels — must match edge labels from this node"),
})

export const OutputNodeData = z.object({
  type: z.literal("output"),
  message: z.string().optional().describe("Final summary message (may reference $ctx.<key>)"),
})

export const NodeData = z.discriminatedUnion("type", [
  InputNodeData,
  SkillLoadNodeData,
  ToolCallNodeData,
  AgentNodeData,
  DecideNodeData,
  OutputNodeData,
])
export type NodeData = z.infer<typeof NodeData>

// ─── Node + Edge ──────────────────────────────────────────────────────────────

const LegacyWorkflowNode = z.object({
  id: z.string(),
  type: z.enum(["input", "skill_load", "tool_call", "agent", "decide", "output"]),
  data: NodeData,
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
})

const VisualWorkflowNode = z.object({
  id: z.string(),
  type: z.literal("workflow"),
  data: z.record(z.string(), z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
})

export const WorkflowNode = z.union([LegacyWorkflowNode, VisualWorkflowNode])
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
