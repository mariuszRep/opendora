import { BrainCircuit, Hammer, type LucideIcon } from 'lucide-react'
import type { NodeType } from './unified-node'

export interface NodeTypeMetadata {
  type: NodeType
  label: string
  description: string
  icon: LucideIcon
  defaultNodeData: {
    node: { label: string; description: string }
    data: { inputs: unknown[]; outputs: unknown[] }
  }
}

export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeMetadata> = {
  start: {
    type: 'start',
    label: 'Start',
    description: 'Workflow entry point',
    icon: BrainCircuit,
    defaultNodeData: {
      node: { label: 'Start', description: 'Workflow entry point' },
      data: { inputs: [], outputs: [] },
    },
  },
  stage: {
    type: 'stage',
    label: 'Stage',
    description: 'Workflow stage with actions',
    icon: BrainCircuit,
    defaultNodeData: {
      node: { label: 'Stage', description: 'Workflow stage' },
      data: { inputs: [], outputs: [] },
    },
  },
  action: {
    type: 'action',
    label: 'Action',
    description: 'Execute an action or task',
    icon: Hammer,
    defaultNodeData: {
      node: { label: 'Action', description: 'Execute an action or task' },
      data: { inputs: [], outputs: [] },
    },
  },
}

export function getNodeTypeMetadata(type: NodeType): NodeTypeMetadata {
  return NODE_TYPE_REGISTRY[type]
}

export function getAllNodeTypes(): NodeTypeMetadata[] {
  return Object.values(NODE_TYPE_REGISTRY)
}

export function getDefaultNodeData(type: NodeType) {
  return NODE_TYPE_REGISTRY[type].defaultNodeData
}
