import { MessageSquare, Play, Wrench, type LucideIcon } from 'lucide-react'
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
    description: 'Workflow entry point with input fields',
    icon: Play,
    defaultNodeData: {
      node: { label: 'Start', description: 'Workflow entry point' },
      data: { inputs: [], outputs: [] },
    },
  },
  tool: {
    type: 'tool',
    label: 'Tool',
    description: 'Run any tool',
    icon: Wrench,
    defaultNodeData: {
      node: { label: 'Tool', description: '' },
      data: { inputs: [], outputs: [] },
    },
  },
  prompt: {
    type: 'prompt',
    label: 'Prompt',
    description: 'Send a message to the agent and capture the response',
    icon: MessageSquare,
    defaultNodeData: {
      node: { label: 'Prompt', description: '' },
      data: { inputs: [], outputs: [] },
    },
  },
}

export function getNodeTypeMetadata(type: NodeType): NodeTypeMetadata {
  return NODE_TYPE_REGISTRY[type] ?? NODE_TYPE_REGISTRY.tool
}

export function getAllNodeTypes(): NodeTypeMetadata[] {
  return Object.values(NODE_TYPE_REGISTRY)
}

export function getDefaultNodeData(type: NodeType) {
  return NODE_TYPE_REGISTRY[type]?.defaultNodeData ?? NODE_TYPE_REGISTRY.tool.defaultNodeData
}
