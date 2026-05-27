import { MessageSquare, SlidersHorizontal, Wrench, type LucideIcon } from 'lucide-react'
import type { NodeType } from './unified-node'

export interface NodeTypeMetadata {
  type: NodeType
  label: string
  description: string
  icon: LucideIcon
  defaultNodeData: {
    node: { label: string; description: string }
    data: { inputs: unknown[]; outputs: unknown[] }
    workflowParameters?: unknown[]
  }
}

export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeMetadata> = {
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
  parameters: {
    type: 'parameters',
    label: 'Parameters',
    description: 'Define workflow input parameters visible to triggers and the LLM',
    icon: SlidersHorizontal,
    defaultNodeData: {
      node: { label: 'Parameters', description: '' },
      data: { inputs: [], outputs: [] },
      workflowParameters: [],
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
