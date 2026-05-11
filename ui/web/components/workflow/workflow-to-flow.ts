import type { Node, Edge } from "@xyflow/react"
import type { WorkflowNode } from "@/lib/opendora"

const NODE_WIDTH = 200
const NODE_HEIGHT = 80
const X_GAP = 24
const Y_GAP = 140

let _id = 0
function nextId() { return `wf-node-${_id++}` }

function getChildren(node: WorkflowNode): WorkflowNode[] {
  switch (node.kind) {
    case "sequence": return (node as any).steps ?? []
    case "parallel": return (node as any).branches ?? []
    case "foreach": return [(node as any).body].filter(Boolean)
    default: return []
  }
}

function subtreeWidth(node: WorkflowNode): number {
  const children = getChildren(node)
  if (children.length === 0) return NODE_WIDTH
  const childWidths = children.map(subtreeWidth)
  return childWidths.reduce((sum, w) => sum + w, 0) + X_GAP * (children.length - 1)
}

function layoutNode(
  node: WorkflowNode,
  depth: number,
  xStart: number,
  rfNodes: Node[],
  rfEdges: Edge[],
  parentRfId?: string,
  activeStepId?: string,
): void {
  const sw = subtreeWidth(node)
  const x = xStart + (sw - NODE_WIDTH) / 2
  const y = depth * Y_GAP

  const rfId = nextId()

  rfNodes.push({
    id: rfId,
    type: node.kind,
    position: { x, y },
    data: {
      ...node,
      _active: activeStepId != null && node.id === activeStepId,
    },
    style: { width: NODE_WIDTH, minHeight: NODE_HEIGHT },
  })

  if (parentRfId) {
    rfEdges.push({
      id: `e-${parentRfId}-${rfId}`,
      source: parentRfId,
      target: rfId,
      type: "smoothstep",
    })
  }

  const children = getChildren(node)
  let childX = xStart
  for (const child of children) {
    const cw = subtreeWidth(child)
    layoutNode(child, depth + 1, childX, rfNodes, rfEdges, rfId, activeStepId)
    childX += cw + X_GAP
  }
}

export function workflowToFlow(
  root: WorkflowNode,
  activeStepId?: string,
): { nodes: Node[]; edges: Edge[] } {
  _id = 0
  const nodes: Node[] = []
  const edges: Edge[] = []
  layoutNode(root, 0, 0, nodes, edges, undefined, activeStepId)
  return { nodes, edges }
}
