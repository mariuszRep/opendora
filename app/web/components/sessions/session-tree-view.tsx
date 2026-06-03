"use client"

import { ChevronRightIcon, MessageSquareIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { SESSION_TYPE_CONFIG } from "./session-create-dialog"
import { useState } from "react"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"

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
  isLast?: boolean
  activeLines?: boolean[]
  onNodeClick?: (node: SessionTreeNode) => void
  selectedNodeId?: string
  activeNodeIds?: Set<string>
  autoExpandTarget?: boolean
}

function TreeNodeRow({ 
  node, 
  depth,
  isLast = false,
  activeLines = [],
  onNodeClick,
  selectedNodeId,
  activeNodeIds,
  autoExpandTarget = true
}: TreeNodeRowProps) {
  const hasChildren = node.children && node.children.length > 0
  const shouldAutoExpand = autoExpandTarget && (node.isTarget || depth === 0)
  const [isExpanded, setIsExpanded] = useState(shouldAutoExpand)
  
  const sessionType = (node.type || "scope") as keyof typeof SESSION_TYPE_CONFIG
  const Icon = SESSION_TYPE_CONFIG[sessionType]?.icon || MessageSquareIcon
  
  const isSelected = selectedNodeId === node.id
  const isActive = activeNodeIds?.has(node.id)

  const childActiveLines = depth === 0 ? [] : [...activeLines, !isLast]

  const NodeContent = (
    <div
      onClick={() => onNodeClick?.(node)}
      style={{ paddingLeft: `calc(0.5rem + ${depth * 1.25}rem)` }}
      className={cn(
        "group relative flex w-full items-center gap-1.5 rounded-md pr-2 py-1 text-sm outline-none transition-colors cursor-pointer select-none",
        "hover:bg-accent hover:text-accent-foreground",
        node.isTarget && "bg-primary/10 font-medium text-primary",
        isSelected && "bg-accent text-accent-foreground font-medium",
      )}
    >
      {/* Draw Ancestor vertical continuous lines */}
      {activeLines.map((isActiveLine, i) => {
        if (!isActiveLine) return null
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-[1px] bg-muted-foreground transition-colors pointer-events-none"
            style={{ left: `calc(0.5rem + ${i * 1.25}rem + 0.625rem)` }}
          />
        )
      })}

      {/* Draw the L/T-connector for this specific node if it's not the root */}
      {depth > 0 && (
        <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `calc(0.5rem + ${(depth - 1) * 1.25}rem + 0.625rem)` }}>
          <div className="absolute top-0 w-[1px] bg-muted-foreground transition-colors" style={{ height: isLast ? '50%' : '100%' }} />
          <div 
             className="absolute top-1/2 h-[1px] bg-muted-foreground transition-colors" 
             style={{ width: '1.25rem' }} 
          />
        </div>
      )}

      {/* Actual Node Interactive Content */}
      <div className="relative z-10 flex flex-1 overflow-hidden items-center gap-1.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted/80 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ChevronRightIcon
              className={cn("h-4 w-4 transition-transform duration-200", isExpanded && "rotate-90")}
            />
          </button>
        ) : (
          <div className="h-5 w-5 shrink-0" />
        )}

        <Icon className={cn("h-4 w-4 shrink-0", node.isTarget ? "text-primary" : "text-muted-foreground/70")} />
        
        <span className="flex-1 truncate">{formatSessionTitle(node)}</span>

        {node.isTarget && (
          <span className="text-[10px] text-primary/80 font-bold tracking-wider mr-1 shrink-0">TARGET</span>
        )}

        {isActive && (
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0 animate-pulse mx-1" title="Active" />
        )}

        {node.stats && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 font-medium tracking-tight shrink-0">
            <span title="Messages">{node.stats.messageCount}m</span>
            <span title="Tool calls">{node.stats.toolCallCount}t</span>
          </div>
        )}
      </div>
    </div>
  )

  if (!hasChildren) {
    return NodeContent
  }

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="w-full flex flex-col gap-0"
    >
      {NodeContent}
      <CollapsibleContent className="w-full overflow-hidden flex flex-col gap-0 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {node.children.map((child, idx) => (
          <TreeNodeRow 
            key={child.id}
            node={child} 
            depth={depth + 1}
            isLast={idx === node.children.length - 1}
            activeLines={childActiveLines}
            onNodeClick={onNodeClick}
            selectedNodeId={selectedNodeId}
            activeNodeIds={activeNodeIds}
            autoExpandTarget={autoExpandTarget}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
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
    <div className="rounded-md bg-background px-1 py-1.5 font-sans">
      <TreeNodeRow 
        node={tree} 
        depth={0}
        activeLines={[]}
        isLast={true}
        onNodeClick={onNodeClick}
        selectedNodeId={selectedNodeId}
        activeNodeIds={activeNodeIds}
        autoExpandTarget={autoExpandTarget}
      />
    </div>
  )
}
