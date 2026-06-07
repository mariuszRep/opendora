"use client"

import type { ToolPart } from "@/lib/opendora"
import { SessionTreeView, type SessionTreeNode } from "@/components/sessions/session-tree-view"

type SessionTreeOutput = {
  target: string
  depth: number
  path: string[]
  tree: SessionTreeNode
}

export type SessionTreeToolContentProps = {
  tool: ToolPart
}

export const SessionTreeToolContent = ({ tool }: SessionTreeToolContentProps) => {
  const output = "output" in tool.state ? tool.state.output : undefined
  
  if (!output || typeof output !== "string") {
    return <div className="text-sm text-muted-foreground">No tree data available</div>
  }

  try {
    const data: SessionTreeOutput = JSON.parse(output)
    
    return (
      <div className="space-y-3">
        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-2">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Target:</span>
            <code className="px-1.5 py-0.5 rounded bg-muted font-mono">{data.target.slice(0, 12)}</code>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Depth:</span>
            <span>{data.depth}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Path:</span>
            <span>{data.path.length} session{data.path.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Tree visualization */}
        <SessionTreeView tree={data.tree} autoExpandTarget={true} />
      </div>
    )
  } catch (err) {
    return (
      <div className="text-sm text-destructive">
        Failed to parse session tree: {err instanceof Error ? err.message : String(err)}
      </div>
    )
  }
}

export function getSessionTreeToolTitle(tool: ToolPart): string {
  const output = "output" in tool.state ? tool.state.output : undefined
  
  if (output && typeof output === "string") {
    try {
      const data: SessionTreeOutput = JSON.parse(output)
      const targetNode = findNodeById(data.tree, data.target)
      if (targetNode?.title) {
        return `Session Tree: ${targetNode.title}`
      }
    } catch {
      // Fall through
    }
  }
  
  return "Session Tree"
}

function findNodeById(node: SessionTreeNode, id: string): SessionTreeNode | null {
  if (node.id === id) return node
  for (const child of node.children || []) {
    const found = findNodeById(child, id)
    if (found) return found
  }
  return null
}

export function isSessionTreeTool(toolName: string): boolean {
  return toolName === "session_tree"
}
