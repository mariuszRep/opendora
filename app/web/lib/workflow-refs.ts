import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData } from '@/components/react-flow/unified-node'

export interface RefSuggestion {
  ref: string
  source: string
  description?: string
}

function upstreamIds(nodeId: string, edges: Edge[]): Set<string> {
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

export function getAvailableRefs(
  nodeId: string,
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): RefSuggestion[] {
  const ids = upstreamIds(nodeId, edges)
  const suggestions: RefSuggestion[] = []

  for (const node of nodes) {
    if (!ids.has(node.id)) continue
    const d = node.data
    const nodeKey = (d.node as any)?.key as string | undefined
    const nodeLabel = d.node.label || d.nodeType || node.id

    // Parameters node: inputs are referenced as $input.<name>
    if (d.nodeType === 'parameters') {
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
      const storeAs = (d.node.parameters as any)?.output as string | undefined
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
      description: d.nodeType === 'decide' ? 'chosen branch label' : 'full output',
    })

    // For Structured nodes: also surface individual fields from the output schema
    if (d.nodeType === 'structured') {
      const schema = (d as any).outputSchema as Record<string, unknown> | undefined
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
