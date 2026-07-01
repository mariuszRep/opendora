import {
  resolveRef,
  resolveRefs,
  resolveTemplate,
  resolveDeep,
} from "./schema"

export { resolveRef, resolveRefs, resolveTemplate, resolveDeep }

/** Recursively resolve only `description` and `title` strings in a JSON schema. */
function resolveSchemaDescriptionsImpl(
  value: unknown,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveSchemaDescriptionsImpl(item, input, ctx))
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((k === "description" || k === "title") && typeof v === "string") {
        out[k] = resolveTemplate(v, input, ctx)
      } else {
        out[k] = resolveSchemaDescriptionsImpl(v, input, ctx)
      }
    }
    return out
  }
  return value
}

export function resolveSchemaDescriptions(
  schema: Record<string, unknown>,
  input: Record<string, unknown>,
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  return resolveSchemaDescriptionsImpl(schema, input, ctx) as Record<string, unknown>
}

export interface RefSuggestion {
  ref: string
  source: string
  description?: string
}

/** Token used by the workflow reference-aware UI inputs to highlight $ refs. */
export const REF_PATTERN = /(\$(?:(?:input|output|ctx)\.[a-zA-Z0-9_.]+|[a-z][a-z0-9_]*(?:\.[a-zA-Z0-9_.]+)*))/g

/**
 * Find the start index of a $ reference that the cursor is currently inside.
 * Returns the index of the $ sign, or -1 if the cursor is not in a reference.
 */
export function tokenStart(val: string, cur: number): number {
  for (let i = cur - 1; i >= 0; i--) {
    if (val[i] === "$") return i
    if (/[\s,;)\}\]]/.test(val.charAt(i))) return -1
  }
  return -1
}

/**
 * Return the in-progress $ reference substring starting at the cursor,
 * or null if the cursor is not inside a reference.
 */
export function partialToken(val: string, cursor: number): string | null {
  const start = tokenStart(val, cursor)
  if (start === -1) return null
  return val.slice(start, cursor)
}

// Minimal node/edge shapes so the shared library does not depend on React Flow.
export interface RefNode {
  id: string
  data: {
    nodeType?: string
    node?: {
      label?: string
      key?: string
      parameters?: Record<string, unknown>
    }
    workflowParameters?: Array<{ name?: string; description?: string; type?: string }>
    outputSchema?: Record<string, unknown>
    [key: string]: unknown
  }
}

export interface RefEdge {
  source: string
  target: string
}

function upstreamIds(nodeId: string, edges: RefEdge[]): Set<string> {
  const visited = new Set<string>()
  const queue = [nodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        visited.add(edge.source)
        queue.push(edge.source)
      }
    }
  }
  return visited
}

/**
 * Build a list of available $ references for the node at `nodeId` based on
 * upstream nodes and workflow parameters.
 */
export function getAvailableRefs(
  nodeId: string,
  nodes: RefNode[],
  edges: RefEdge[],
): RefSuggestion[] {
  const ids = upstreamIds(nodeId, edges)
  const suggestions: RefSuggestion[] = []

  for (const node of nodes) {
    if (!ids.has(node.id)) continue
    const d = node.data
    const nodeKey = d.node?.key
    const nodeLabel = d.node?.label || d.nodeType || node.id

    // Parameters node: inputs are referenced as $input.<name>
    if (d.nodeType === "parameters") {
      for (const p of d.workflowParameters ?? []) {
        if (p.name) {
          suggestions.push({
            ref: `$input.${p.name}`,
            source: nodeLabel,
            description: p.description || p.type,
          })
        }
      }
      continue
    }

    if (!nodeKey) {
      // Backward compat: nodes without a key still surface old-style $output.storeAs refs
      const storeAs = d.node?.parameters?.output as string | undefined
      if (storeAs) {
        suggestions.push({
          ref: `$output.${storeAs}`,
          source: nodeLabel,
        })
      }
      continue
    }

    // Primary: $nodeKey for the full output
    suggestions.push({
      ref: `$${nodeKey}`,
      source: nodeLabel,
      description: d.nodeType === "decide" ? "chosen branch label" : "full output",
    })

    // For Structured nodes: also surface individual fields from the output schema
    if (d.nodeType === "structured") {
      const schema = d.outputSchema
      const props = (schema?.properties ?? {}) as Record<string, { description?: string; type?: string }>
      for (const [fieldName, fieldDef] of Object.entries(props)) {
        suggestions.push({
          ref: `$${nodeKey}.${fieldName}`,
          source: nodeLabel,
          description: fieldDef.description || fieldDef.type,
        })
      }
    }
  }

  return suggestions
}
