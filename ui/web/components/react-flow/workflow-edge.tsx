import {
  BaseEdge,
  type EdgeProps,
  getBezierPath,
  getSimpleBezierPath,
  type InternalNode,
  type Node,
  Position,
  useInternalNode,
} from '@xyflow/react'
import { getHandleDefinition, type HandleType, type HandlePosition } from './node-handles'
import type { NodeType, WorkflowNodeData } from './unified-node'

const getNodeTypeFromNode = (node: InternalNode<Node>): NodeType => {
  const data = node.data as WorkflowNodeData | null
  return data?.nodeType ?? 'tool'
}

const getHandleSchemaPosition = (
  node: InternalNode<Node>,
  handleId: string | null | undefined,
  handleType: HandleType
): HandlePosition | null => {
  const nodeType = getNodeTypeFromNode(node)
  const handle = getHandleDefinition(nodeType, handleId ?? null)
  if (handle && handle.type === handleType) return handle.position
  return null
}

const toReactFlowPosition = (position: HandlePosition | null): Position | null => {
  if (!position) return null
  switch (position) {
    case 'top': return Position.Top
    case 'bottom': return Position.Bottom
    case 'left': return Position.Left
    case 'right': return Position.Right
  }
}

const getHandleCoords = (
  node: InternalNode<Node>,
  handleId: string | null | undefined,
  handleType: 'source' | 'target'
) => {
  const position = toReactFlowPosition(getHandleSchemaPosition(node, handleId, handleType))
  if (!position) return null

  const handle = node.internals.handleBounds?.[handleType]?.find(
    (h) =>
      h.position === position &&
      (handleId === null || h.id === handleId || h.id === undefined)
  )
  if (!handle) return null

  let offsetX = handle.width / 2
  let offsetY = handle.height / 2

  switch (position) {
    case Position.Left: offsetX = 0; break
    case Position.Right: offsetX = handle.width; break
    case Position.Top: offsetY = 0; break
    case Position.Bottom: offsetY = handle.height; break
  }

  const x = node.internals.positionAbsolute.x + handle.x + offsetX
  const y = node.internals.positionAbsolute.y + handle.y + offsetY

  return { x, y, position }
}

const WorkflowTemporaryEdge = (props: EdgeProps) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style } = props

  const [edgePath] = getSimpleBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <BaseEdge
      className="stroke-1"
      id={id}
      path={edgePath}
      style={{ ...style, strokeDasharray: '5, 5' }}
    />
  )
}

const WorkflowAnimatedEdge = (props: EdgeProps) => {
  const { id, source, target, markerEnd, style } = props
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  const edgeData = props as { sourceHandle?: string; targetHandle?: string }
  const sourceHandle = edgeData.sourceHandle
  const targetHandle = edgeData.targetHandle

  if (!(sourceNode && targetNode)) return null

  const sourceResult = getHandleCoords(sourceNode, sourceHandle ?? null, 'source')
  const targetResult = getHandleCoords(targetNode, targetHandle ?? null, 'target')

  const sx = sourceResult?.x ?? props.sourceX
  const sy = sourceResult?.y ?? props.sourceY
  const sourcePosition = sourceResult?.position ?? props.sourcePosition
  const tx = targetResult?.x ?? props.targetX
  const ty = targetResult?.y ?? props.targetY
  const targetPosition = targetResult?.position ?? props.targetPosition

  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition,
    targetX: tx,
    targetY: ty,
    targetPosition,
  })

  return (
    <>
      <BaseEdge id={id} markerEnd={markerEnd} path={edgePath} style={style} />
      <circle fill="var(--primary)" r="4">
        <animateMotion dur="2s" path={edgePath} repeatCount="indefinite" />
      </circle>
    </>
  )
}

export const WorkflowEdge = {
  Temporary: WorkflowTemporaryEdge,
  Animated: WorkflowAnimatedEdge,
}
