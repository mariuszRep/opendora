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
}

// start  → tool(s) via bottom handle (unlimited)
// tool   ← start or tool via top handle (single input)
// tool   → tool(s) via bottom handle (unlimited)
export const HANDLE_SCHEMA: Record<NodeType, NodeHandleConfig> = {
  start: {
    handles: [
      {
        id: null,
        position: 'bottom',
        type: 'source',
        connections: {
          canConnectTo: [
            { nodeType: 'tool', handleId: null, maxConnections: 'unlimited' },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: 0,
      allowedOutboundEdges: 'unlimited',
      hiddenFields: [],
      requiredFields: ['label'],
      exposedFields: ['inputSchema'],
    },
  },
  tool: {
    handles: [
      {
        id: null,
        position: 'top',
        type: 'target',
        connections: {
          canReceiveFrom: [
            { nodeType: 'start', handleId: null, maxConnections: 1 },
            { nodeType: 'tool', handleId: null, maxConnections: 1 },
          ],
        },
      },
      {
        id: null,
        position: 'bottom',
        type: 'source',
        connections: {
          canConnectTo: [
            { nodeType: 'tool', handleId: null, maxConnections: 'unlimited' },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: 1,
      allowedOutboundEdges: 'unlimited',
      hiddenFields: [],
      requiredFields: ['label'],
      exposedFields: ['action_id', 'parameters'],
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
  if (!config) return undefined

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
    return { valid: false, error: `Invalid source handle: ${sourceNodeType}` }
  }

  const targetHandle = getHandleDefinition(targetNodeType, targetHandleId, 'target')
  if (!targetHandle) {
    return { valid: false, error: `Invalid target handle: ${targetNodeType}` }
  }

  const allowedTarget = sourceHandle.connections.canConnectTo?.find(
    c => c.nodeType === targetNodeType
  )
  if (!allowedTarget) {
    return { valid: false, error: `${sourceNodeType} cannot connect to ${targetNodeType}` }
  }

  const allowedSource = targetHandle.connections.canReceiveFrom?.find(
    c => c.nodeType === sourceNodeType
  )
  if (!allowedSource) {
    return { valid: false, error: `${targetNodeType} cannot receive from ${sourceNodeType}` }
  }

  const sourceOutCount = countEdgesFromHandle(existingEdges, sourceNodeId, sourceHandleId)
  if (
    allowedTarget.maxConnections !== 'unlimited' &&
    sourceOutCount >= allowedTarget.maxConnections
  ) {
    return { valid: false, error: `${sourceNodeType} has reached maximum outbound connections` }
  }

  const targetInCount = countEdgesToHandle(existingEdges, targetNodeId, targetHandleId)
  if (
    allowedSource.maxConnections !== 'unlimited' &&
    targetInCount >= allowedSource.maxConnections
  ) {
    return { valid: false, error: `${targetNodeType} already has an incoming connection` }
  }

  return { valid: true }
}

export function getHandlesForNodeType(nodeType: NodeType): HandleDefinition[] {
  return HANDLE_SCHEMA[nodeType]?.handles ?? []
}

export function getNodeConstraints(nodeType: NodeType): NodeConstraints {
  return HANDLE_SCHEMA[nodeType]?.constraints ?? HANDLE_SCHEMA.tool.constraints
}

export function isVerticalHandle(position: HandlePosition): boolean {
  return position === 'top' || position === 'bottom'
}

export function isHorizontalHandle(position: HandlePosition): boolean {
  return position === 'left' || position === 'right'
}
