import { z } from "zod"

export const WorkflowNode: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("task"),
      id: z.string().optional(),
      skill: z.string().describe("Skill name to load for this step"),
      input: z.record(z.string(), z.unknown()).optional().describe("Input passed to the skill. May contain $input.* and $ctx.* references."),
      output: z.string().describe("Name under which this step's output is stored in ctx"),
    }),
    z.object({
      kind: z.literal("sequence"),
      id: z.string().optional(),
      steps: z.array(WorkflowNode).describe("Steps to execute in order"),
    }),
    z.object({
      kind: z.literal("parallel"),
      id: z.string().optional(),
      branches: z.array(WorkflowNode).describe("Branches to execute concurrently"),
      join: z.enum(["all", "any", "n"]).default("all").describe("Join strategy: all must complete, any one completes, or n must complete"),
      joinN: z.number().int().positive().optional().describe("Number of branches that must complete when join is 'n'"),
    }),
    z.object({
      kind: z.literal("foreach"),
      id: z.string().optional(),
      items: z.string().describe("Dotted path to array in ctx, e.g. '$ctx.files'"),
      as: z.string().describe("Loop variable name, available as $<name> in body"),
      mode: z.enum(["sequential", "parallel"]).default("sequential"),
      body: WorkflowNode.describe("Step to execute for each item"),
    }),
    z.object({
      kind: z.literal("decide"),
      id: z.string().optional(),
      skill: z.string().describe("Skill name for the decision step"),
      input: z.record(z.string(), z.unknown()).optional().describe("Input for the decision. May contain $input.* and $ctx.* references."),
      branches: z.record(
        z.string(),
        z.object({
          goto: z.string().nullable().describe("Target step id, or null for terminal"),
        }),
      ).describe("Branch labels mapping to goto targets"),
    }),
  ]),
)

export const Workflow = z.object({
  id: z.string().describe("Unique workflow identifier"),
  name: z.string().describe("Human-readable name"),
  description: z.string().optional(),
  version: z.string().default("1.0.0"),
  input: z
    .object({
      type: z.literal("object"),
      properties: z.record(z.string(), z.object({ type: z.string() })),
      required: z.array(z.string()).optional(),
    })
    .optional()
    .describe("JSON Schema for workflow input"),
  root: WorkflowNode.describe("Root node of the workflow tree"),
})

export type Workflow = z.infer<typeof Workflow>
export type WorkflowNode = z.infer<typeof WorkflowNode>

export const RunState = z.object({
  runId: z.string(),
  workflowId: z.string(),
  input: z.record(z.string(), z.unknown()),
  cursor: z.string(),
  ctx: z.record(z.string(), z.unknown()).default({}),
  completed: z.array(z.string()).default([]),
  history: z.array(
    z.object({
      tool: z.string(),
      args: z.record(z.string(), z.unknown()),
      result: z.unknown(),
      at: z.number(),
    }),
  ).default([]),
})

export type RunState = z.infer<typeof RunState>

/** Resolve $input.* and $ctx.* references in a value */
export function resolveReferences(
  value: unknown,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
  loopVars?: Record<string, unknown>,
): unknown {
  if (typeof value === "string") {
    if (value.startsWith("$input.")) {
      const path = value.slice(7)
      return getByPath(input, path)
    }
    if (value.startsWith("$ctx.")) {
      const path = value.slice(5)
      return getByPath(ctx, path)
    }
    if (loopVars && value.startsWith("$")) {
      const varName = value.slice(1)
      if (varName in loopVars) return loopVars[varName]
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveReferences(v, input, ctx, loopVars))
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveReferences(v, input, ctx, loopVars)
    }
    return result
  }
  return value
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".")
  let current: unknown = obj
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

/** Find the first leaf node (task or decide) in tree order */
export function findFirstStep(node: WorkflowNode): string | undefined {
  switch (node.kind) {
    case "task":
    case "decide":
      return node.id
    case "sequence":
      for (const step of node.steps) {
        const found = findFirstStep(step)
        if (found) return found
      }
      return undefined
    case "parallel":
      for (const branch of node.branches) {
        const found = findFirstStep(branch)
        if (found) return found
      }
      return undefined
    case "foreach":
      return findFirstStep(node.body)
    default:
      return undefined
  }
}

/** Find a node by id in the workflow tree */
export function findNodeById(root: WorkflowNode, id: string): WorkflowNode | undefined {
  if (root.id === id) return root
  switch (root.kind) {
    case "sequence":
      for (const step of root.steps) {
        const found = findNodeById(step, id)
        if (found) return found
      }
      return undefined
    case "parallel":
      for (const branch of root.branches) {
        const found = findNodeById(branch, id)
        if (found) return found
      }
      return undefined
    case "foreach":
      return findNodeById(root.body, id)
    default:
      return undefined
  }
}

/** Find the next leaf step after the given id in tree order */
export function findNextStep(root: WorkflowNode, currentId: string): string | undefined {
  const ids = collectLeafIds(root)
  const idx = ids.indexOf(currentId)
  if (idx >= 0 && idx < ids.length - 1) return ids[idx + 1]
  return undefined
}

function collectLeafIds(node: WorkflowNode): string[] {
  switch (node.kind) {
    case "task":
    case "decide":
      return node.id ? [node.id] : []
    case "sequence":
      return node.steps.flatMap(collectLeafIds)
    case "parallel":
      return node.branches.flatMap(collectLeafIds)
    case "foreach":
      return collectLeafIds(node.body)
    default:
      return []
  }
}
