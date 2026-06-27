import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData } from '@/components/react-flow/unified-node'
import {
  getAvailableRefs as getAvailableRefsBase,
  type RefSuggestion as BaseRefSuggestion,
  type RefNode,
  type RefEdge,
} from '@projectflows/workflow/refs'

export type RefSuggestion = BaseRefSuggestion

export function getAvailableRefs(
  nodeId: string,
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): RefSuggestion[] {
  return getAvailableRefsBase(
    nodeId,
    nodes as unknown as RefNode[],
    edges as unknown as RefEdge[],
  )
}
