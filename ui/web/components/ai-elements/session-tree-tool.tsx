"use client"

import type { ToolPart } from "@/lib/opendora"
import { ChevronRightIcon, MessageSquareIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { SESSION_TYPE_CONFIG } from "@/components/sessions/session-create-dialog"
import { useState } from "react"

type SessionTreeNode = {
  id: string
  title: string | null
  type: string | null
  status: string | null
  agentId: string | null
  isTarget?: boolean
  stats?: {
    messageCount: number
    toolCallCount: number
  }
  children: SessionTreeNode[]
}

type SessionTreeOutput = {
  target: string
  depth: number
  path: string[]
  tree: SessionTreeNode
}

function formatSessionTitle(node: SessionTreeNode): string {
  return node.title || node.id.slice(0, 12)
}

type TreeNodeRowProps = {
  node: SessionTreeNode
  depth: number
  isExpanded: boolean
  onToggle: () => void
}

function TreeNodeRow({ node, depth, isExpanded, onToggle }: TreeNodeRowProps) {
  const hasChildren = node.children && node.children.length > 0
  const sessionType = (node.type || "scope") as keyof typeof SESSION_TYPE_CONFIG
  const Icon = SESSION_TYPE_CONFIG[sessionType]?.icon || MessageSquareIcon

  return (
    <div>
      <div className="relative">
        {/* Tree lines */}
        {depth > 0 && (
          <>
            <div 
              className="absolute top-0 bottom-0 w-px bg-border"
              style={{ left: depth * 20 - 10 }}
            />
            <div 
              className="absolute top-1/2 h-px bg-border"
              style={{ 
                left: depth * 20 - 10,
                width: '14px'
              }}
            />
          </>
        )}

        <div
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded text-sm hover:bg-muted/50 transition-colors",
            node.isTarget && "bg-primary/10 font-medium"
          )}
          style={{ paddingLeft: depth * 20 + 8 }}
        >
          {hasChildren ? (
            <button
              onClick={onToggle}
              className="shrink-0 hover:bg-muted rounded p-0.5 -m-0.5"
            >
              <ChevronRightIcon
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  isExpanded && "rotate-90"
                )}
              />
            </button>
          ) : (
            <span className="size-3.5 shrink-0" />
          )}

          <Icon className="size-4 shrink-0 text-muted-foreground" />

          <span className="flex-1 truncate">{formatSessionTitle(node)}</span>

          {node.isTarget && (
            <span className="text-xs text-primary font-medium">●</span>
          )}

          {node.stats && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span title="Messages">{node.stats.messageCount}m</span>
              <span title="Tool calls">{node.stats.toolCallCount}t</span>
            </div>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="relative">
          {node.children.map((child, idx) => {
            const isLast = idx === node.children.length - 1
            return (
              <div key={child.id} className="relative">
                {isLast && (
                  <div 
                    className="absolute top-0 h-1/2 w-px bg-background"
                    style={{ left: (depth + 1) * 20 - 10 }}
                  />
                )}
                <TreeNodeRowWrapper node={child} depth={depth + 1} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TreeNodeRowWrapper({ node, depth }: { node: SessionTreeNode; depth: number }) {
  const [isExpanded, setIsExpanded] = useState(node.isTarget || depth === 0)
  
  return (
    <TreeNodeRow
      node={node}
      depth={depth}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
    />
  )
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
        <div className="rounded-md border bg-background p-2">
          <TreeNodeRowWrapper node={data.tree} depth={0} />
        </div>
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
