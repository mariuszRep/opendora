import type { NodeType } from './unified-node'
import type { Edge } from '@xyflow/react'

export type HandlePosition = 'top' | 'bottom' | 'left' | 'right'
export type HandleType = 'source' | 'target'
export type EdgeLimit = number | 'unlimited'

export interface HandleConnectionRule {
  nodeType: NodeType
  handleId: string | null
  maxConnections: number | 'unlimited'
}

export interface HandleDefinition {
  id: string | null
  position: HandlePosition
  type: HandleType
  connections: {
    canConnectTo?: HandleConnectionRule[]
    canReceiveFrom?: HandleConnectionRule[]
  }
}

export interface NodeHandleConfig {
  handles: HandleDefinition[]
  constraints: NodeConstraints
}

export interface NodeConstraints {
  allowedInboundEdges: EdgeLimit
  allowedOutboundEdges: EdgeLimit
  hiddenFields: string[]
  requiredFields: string[]
  exposedFields: string[]
  allowedExecutionModes?: Array<'automatic' | 'manual'>
}

export const HANDLE_SCHEMA: Record<NodeType, NodeHandleConfig> = {
  start: {
    handles: [
      {
        id: 'horizontal',
        position: 'right',
        type: 'source',
        connections: {
          canConnectTo: [
            { nodeType: 'stage', handleId: null, maxConnections: 1 },
          ],
        },
      },
      {
        id: 'vertical',
        position: 'bottom',
        type: 'source',
        connections: {
          canConnectTo: [
            { nodeType: 'action', handleId: null, maxConnections: 'unlimited' },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: 0,
      allowedOutboundEdges: 'unlimited',
      hiddenFields: ['conditions', 'action_id', 'outputSchema'],
      requiredFields: ['label'],
      exposedFields: ['toolName', 'toolTitle', 'toolDescription', 'toolAnnotations', 'inputSchema', 'instructions', 'execution_mode'],
      allowedExecutionModes: ['automatic', 'manual'],
    },
  },
  stage: {
    handles: [
      {
        id: null,
        position: 'left',
        type: 'target',
        connections: {
          canReceiveFrom: [
            { nodeType: 'start', handleId: 'horizontal', maxConnections: 'unlimited' },
            { nodeType: 'stage', handleId: 'horizontal', maxConnections: 'unlimited' },
          ],
        },
      },
      {
        id: 'horizontal',
        position: 'right',
        type: 'source',
        connections: {
          canConnectTo: [
            { nodeType: 'stage', handleId: null, maxConnections: 'unlimited' },
          ],
        },
      },
      {
        id: 'vertical',
        position: 'bottom',
        type: 'source',
        connections: {
          canConnectTo: [
            { nodeType: 'action', handleId: null, maxConnections: 'unlimited' },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: 'unlimited',
      allowedOutboundEdges: 'unlimited',
      hiddenFields: [],
      requiredFields: ['label'],
      exposedFields: ['action_id', 'inputSchema', 'outputSchema', 'conditions', 'instructions', 'input_mapping', 'output_field_selection'],
      allowedExecutionModes: ['automatic', 'manual'],
    },
  },
  action: {
    handles: [
      {
        id: null,
        position: 'top',
        type: 'target',
        connections: {
          canReceiveFrom: [
            { nodeType: 'start', handleId: 'vertical', maxConnections: 1 },
            { nodeType: 'stage', handleId: 'vertical', maxConnections: 1 },
            { nodeType: 'action', handleId: null, maxConnections: 1 },
          ],
        },
      },
      {
        id: null,
        position: 'bottom',
        type: 'source',
        connections: {
          canConnectTo: [
            { nodeType: 'action', handleId: null, maxConnections: 'unlimited' },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: 1,
      allowedOutboundEdges: 'unlimited',
      hiddenFields: [],
      requiredFields: ['label'],
      exposedFields: ['action_id', 'inputSchema', 'outputSchema', 'conditions', 'instructions', 'input_mapping', 'output_field_selection'],
      allowedExecutionModes: ['automatic', 'manual'],
    },
  },
}

export function getNodeHandleConfig(nodeType: NodeType): NodeHandleConfig {
  return HANDLE_SCHEMA[nodeType]
}

export function getHandleDefinition(
  nodeType: NodeType,
  handleId: string | null | undefined,
  handleType?: HandleType
): HandleDefinition | undefined {
  const config = HANDLE_SCHEMA[nodeType]

  if (handleId == null) {
    if (handleType) {
      return config.handles.find(
        h => h.type === handleType && (h.id === null || h.id === undefined)
      )
    }
    return config.handles.find(h => h.id === null || h.id === undefined)
  }

  return config.handles.find(h => h.id === handleId)
}

export function countEdgesFromHandle(
  edges: Edge[],
  sourceNodeId: string,
  sourceHandleId: string | null
): number {
  return edges.filter(
    e => e.source === sourceNodeId && (e.sourceHandle ?? null) === sourceHandleId
  ).length
}

export function countEdgesToHandle(
  edges: Edge[],
  targetNodeId: string,
  targetHandleId: string | null
): number {
  return edges.filter(
    e => e.target === targetNodeId && (e.targetHandle ?? null) === targetHandleId
  ).length
}

export function validateConnection(
  sourceNodeType: NodeType,
  sourceNodeId: string,
  sourceHandleId: string | null,
  targetNodeType: NodeType,
  targetNodeId: string,
  targetHandleId: string | null,
  existingEdges: Edge[]
): { valid: boolean; error?: string } {
  const sourceHandle = getHandleDefinition(sourceNodeType, sourceHandleId, 'source')
  if (!sourceHandle) {
    return { valid: false, error: `Invalid source handle: ${sourceNodeType}.${sourceHandleId}` }
  }

  const targetHandle = getHandleDefinition(targetNodeType, targetHandleId, 'target')
  if (!targetHandle) {
    return { valid: false, error: `Invalid target handle: ${targetNodeType}.${targetHandleId}` }
  }

  const allowedTarget = sourceHandle.connections.canConnectTo?.find(
    c => c.nodeType === targetNodeType && c.handleId === targetHandle.id
  )
  if (!allowedTarget) {
    return { valid: false, error: `${sourceNodeType} ${sourceHandle.position} cannot connect to ${targetNodeType}` }
  }

  const allowedSource = targetHandle.connections.canReceiveFrom?.find(
    c => c.nodeType === sourceNodeType && c.handleId === sourceHandle.id
  )
  if (!allowedSource) {
    return { valid: false, error: `${targetNodeType} cannot receive from ${sourceNodeType} ${sourceHandle.position}` }
  }

  const sourceOutCount = countEdgesFromHandle(existingEdges, sourceNodeId, sourceHandleId)
  if (
    allowedTarget.maxConnections !== 'unlimited' &&
    sourceOutCount >= allowedTarget.maxConnections
  ) {
    return { valid: false, error: `${sourceNodeType} ${sourceHandle.position} has reached maximum connections` }
  }

  const targetInCount = countEdgesToHandle(existingEdges, targetNodeId, targetHandleId)
  if (
    allowedSource.maxConnections !== 'unlimited' &&
    targetInCount >= allowedSource.maxConnections
  ) {
    return { valid: false, error: `${targetNodeType} ${targetHandle.position} has reached maximum connections` }
  }

  return { valid: true }
}

export function getHandlesForNodeType(nodeType: NodeType): HandleDefinition[] {
  return HANDLE_SCHEMA[nodeType].handles
}

export function getNodeConstraints(nodeType: NodeType): NodeConstraints {
  return HANDLE_SCHEMA[nodeType].constraints
}

export function isVerticalHandle(position: HandlePosition): boolean {
  return position === 'top' || position === 'bottom'
}

export function isHorizontalHandle(position: HandlePosition): boolean {
  return position === 'left' || position === 'right'
}
