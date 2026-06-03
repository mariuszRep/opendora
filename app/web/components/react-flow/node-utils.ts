import type { NodeType, WorkflowNodeData } from './unified-node'

export function resolveNodeType(nodeData: WorkflowNodeData): NodeType {
  return nodeData.nodeType ?? 'tool'
}

export function normalizeNodeName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function generateUniqueNodeName(
  label: string,
  existingNames: Set<string>
): string {
  const baseName = normalizeNodeName(label)
  if (!existingNames.has(baseName)) return baseName

  let counter = 1
  let uniqueName = `${baseName}_${counter}`
  while (existingNames.has(uniqueName)) {
    counter++
    uniqueName = `${baseName}_${counter}`
  }
  return uniqueName
}
