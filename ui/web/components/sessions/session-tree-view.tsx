"use client"

import { ChevronRightIcon, MessageSquareIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { SESSION_TYPE_CONFIG } from "./session-create-dialog"
import { useState } from "react"

export type SessionTreeNode = {
  id: string
  title: string | null
  type: string | null
  status?: string | null
  agentId?: string | null
  isTarget?: boolean
  stats?: {
    messageCount: number
    toolCallCount: number
  }
  children: SessionTreeNode[]
}

function formatSessionTitle(node: SessionTreeNode): string {
  return node.title || node.id.slice(0, 12)
}

type TreeNodeRowProps = {
  node: SessionTreeNode
  depth: number
  isExpanded: boolean
  onToggle: () => void
  onNodeClick?: (node: SessionTreeNode) => void
  isSelected?: boolean
  isActive?: boolean
}

function TreeNodeRow({ 
  node, 
  depth, 
  isExpanded, 
  onToggle, 
  onNodeClick,
  isSelected,
  isActive 
}: TreeNodeRowProps) {
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
          onClick={() => onNodeClick?.(node)}
          className={cn(
            "flex items-center gap-2 py-1.5 px-2 rounded text-sm transition-colors cursor-pointer",
            "hover:bg-muted/50",
            node.isTarget && "bg-primary/10 font-medium",
            isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          )}
          style={{ paddingLeft: depth * 20 + 8 }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
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

          {isActive && (
            <div className="size-2 rounded-full bg-green-500 shrink-0 animate-pulse" title="Active" />
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
                <TreeNodeRowWrapper 
                  node={child} 
                  depth={depth + 1}
                  onNodeClick={onNodeClick}
                  selectedNodeId={isSelected ? undefined : undefined}
                  activeNodeIds={isActive ? new Set([node.id]) : undefined}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type TreeNodeRowWrapperProps = {
  node: SessionTreeNode
  depth: number
  onNodeClick?: (node: SessionTreeNode) => void
  selectedNodeId?: string
  activeNodeIds?: Set<string>
  autoExpandTarget?: boolean
}

function TreeNodeRowWrapper({ 
  node, 
  depth, 
  onNodeClick,
  selectedNodeId,
  activeNodeIds,
  autoExpandTarget = true
}: TreeNodeRowWrapperProps) {
  const shouldAutoExpand = autoExpandTarget && (node.isTarget || depth === 0)
  const [isExpanded, setIsExpanded] = useState(shouldAutoExpand)
  
  return (
    <TreeNodeRow
      node={node}
      depth={depth}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      onNodeClick={onNodeClick}
      isSelected={selectedNodeId === node.id}
      isActive={activeNodeIds?.has(node.id)}
    />
  )
}

export type SessionTreeViewProps = {
  tree: SessionTreeNode
  onNodeClick?: (node: SessionTreeNode) => void
  selectedNodeId?: string
  activeNodeIds?: Set<string>
  autoExpandTarget?: boolean
}

export function SessionTreeView({ 
  tree, 
  onNodeClick,
  selectedNodeId,
  activeNodeIds,
  autoExpandTarget = true
}: SessionTreeViewProps) {
  return (
    <div className="rounded-md border bg-background p-2">
      <TreeNodeRowWrapper 
        node={tree} 
        depth={0}
        onNodeClick={onNodeClick}
        selectedNodeId={selectedNodeId}
        activeNodeIds={activeNodeIds}
        autoExpandTarget={autoExpandTarget}
      />
    </div>
  )
}
