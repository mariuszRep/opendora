import {
  NodeTypeId,
  NodeRegistry,
  type HandlePosition,
  type HandleType,
  type NodeHandleDefinition,
  type NodeConstraints,
} from "@opendora/workflow/node-registry"
import type { NodeType } from "./unified-node"
import type { Edge } from "@xyflow/react"

// Re-export types from canonical definitions
export type {
  HandlePosition,
  HandleType,
  EdgeLimit,
  HandleConnectionRule,
  NodeHandleDefinition,
  NodeConstraints,
} from "@opendora/workflow/node-registry"

export {
  /** @deprecated Import from @opendora/workflow/node-registry directly */
  NodeTypeId,
}

/**
 * @deprecated Use NodeRegistry.getHandles() / NodeRegistry.getConstraints() instead.
 * Derived from the canonical NodeRegistry; will be removed once all consumers migrate.
 */
export const HANDLE_SCHEMA: Record<NodeType, { handles: NodeHandleDefinition[]; constraints: NodeConstraints }> =
  Object.fromEntries(
    NodeRegistry.getAll().map((def) => [
      def.type,
      { handles: NodeRegistry.getHandles(def.type), constraints: NodeRegistry.getConstraints(def.type) },
    ])
  ) as Record<NodeType, { handles: NodeHandleDefinition[]; constraints: NodeConstraints }>

/** @deprecated Use `NodeHandleDefinition` from canonical definitions instead. */
export type HandleDefinition = NodeHandleDefinition

export function getNodeHandleConfig(nodeType: NodeType): { handles: NodeHandleDefinition[]; constraints: NodeConstraints } | undefined {
  return HANDLE_SCHEMA[nodeType]
}

export function getHandleDefinition(
  nodeType: NodeType,
  handleId: string | null | undefined,
  handleType?: HandleType
): NodeHandleDefinition | undefined {
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

  const allowedTarget = sourceHandle.connections?.canConnectTo?.find(
    c => c.nodeType === targetNodeType
  )
  if (!allowedTarget) {
    return { valid: false, error: `${sourceNodeType} cannot connect to ${targetNodeType}` }
  }

  const allowedSource = targetHandle.connections?.canReceiveFrom?.find(
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

export function getHandlesForNodeType(nodeType: NodeType): NodeHandleDefinition[] {
  return HANDLE_SCHEMA[nodeType]?.handles ?? []
}

export function getNodeConstraints(nodeType: NodeType): NodeConstraints {
  return HANDLE_SCHEMA[nodeType]?.constraints ?? HANDLE_SCHEMA[NodeTypeId.Tool].constraints
}

export function isVerticalHandle(position: HandlePosition): boolean {
  return position === 'top' || position === 'bottom'
}

export function isHorizontalHandle(position: HandlePosition): boolean {
  return position === 'left' || position === 'right'
}
