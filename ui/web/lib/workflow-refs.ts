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

    if (d.nodeType === 'parameters') {
      for (const p of d.workflowParameters ?? []) {
        if (p.name) {
          suggestions.push({
            ref: `$input.${p.name}`,
            source: d.node.label || 'Parameters',
            description: p.description || p.type,
          })
        }
      }
    }

    if (d.nodeType === 'decide') {
      const label = d.node.label || 'decide'
      const autoKey = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'decide'
      const explicitKey = d.node.parameters?.output as string | undefined
      suggestions.push({
        ref: `$output.${explicitKey || autoKey}`,
        source: d.node.label || 'Decide',
        description: 'decision result',
      })
    } else {
      const output = d.node.parameters?.output as string | undefined
      if (output) {
        suggestions.push({
          ref: `$output.${output}`,
          source: `${d.nodeType}: ${d.node.label || d.nodeType}`,
        })
      }
    }
  }

  return suggestions
}
