'use client'

import * as React from 'react'
import { type NodeProps, Handle, Position } from '@xyflow/react'
import {
  WorkflowNodeBase,
  WorkflowNodeHeader,
  WorkflowNodeTitle,
  WorkflowNodeDescription,
  WorkflowNodeFooter,
} from './workflow-node-base'
import { Badge } from '@/components/ui/badge'
import { Bot, GitBranch } from 'lucide-react'
import { getHandlesForNodeType } from './node-handles'
import { getNodeTypeMetadata } from './node-type-registry'
import { resolveNodeType } from './node-utils'
import type { WorkflowNodeData } from './unified-node'

export function WorkflowNode({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData
  const nodeType = resolveNodeType(nodeData)
  const metadata = getNodeTypeMetadata(nodeType)
  const Icon = metadata.icon

  const renderHandles = () =>
    getHandlesForNodeType(nodeType).map((handle) => {
      const position =
        handle.position === 'top' ? Position.Top :
        handle.position === 'bottom' ? Position.Bottom :
        handle.position === 'left' ? Position.Left :
        Position.Right

      return (
        <Handle
          key={`${handle.type}-${handle.position}-${handle.id ?? 'default'}`}
          position={position}
          type={handle.type}
          id={handle.id ?? undefined}
          className="!bg-primary !w-3 !h-3 !border-2 !border-background !z-10"
        />
      )
    })

  return (
    <WorkflowNodeBase
      handles={{ target: false, source: false }}
      className={`min-w-[80px] ${selected ? 'ring-[3px] ring-ring/50 border-ring' : ''}`}
    >
      {renderHandles()}
      <WorkflowNodeHeader className="pb-2 flex-1 bg-secondary/50">
        <div className="min-w-0 flex-1">
          <WorkflowNodeTitle className="text-base leading-tight">
            {nodeType === 'tool' && nodeData.node.action_id
              ? nodeData.node.action_id
              : nodeData.node.label}
          </WorkflowNodeTitle>
          {nodeType === 'tool' && nodeData.node.action_id ? (
            <WorkflowNodeDescription className="text-sm line-clamp-2 mt-1">
              {nodeData.node.label}
            </WorkflowNodeDescription>
          ) : nodeType === 'prompt' ? (
            nodeData.instructions ? (
              <WorkflowNodeDescription className="text-sm line-clamp-2 mt-1 whitespace-pre-wrap break-words">
                {nodeData.instructions as string}
              </WorkflowNodeDescription>
            ) : (
              <WorkflowNodeDescription className="text-sm line-clamp-2 mt-1">
                No prompt set
              </WorkflowNodeDescription>
            )
          ) : nodeType === 'decide' ? (
            (() => {
              const cases = (nodeData.node.parameters?.cases as Array<{ label: string }> | undefined) ?? []
              const mode = (nodeData.node.parameters?.mode as string) ?? 'agent'
              return (
                <div className="mt-1.5 space-y-1.5">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                    {mode === 'agent' ? 'AI' : '='}
                  </Badge>
                  {cases.length === 0 ? (
                    <WorkflowNodeDescription className="text-xs">No cases</WorkflowNodeDescription>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {cases.slice(0, 5).map((c, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-mono leading-tight">
                          {c.label || '…'}
                        </span>
                      ))}
                      {cases.length > 5 && (
                        <span className="text-[10px] text-muted-foreground">+{cases.length - 5}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })()
          ) : null}
        </div>
      </WorkflowNodeHeader>

      <WorkflowNodeFooter className="border-t bg-muted/30 pt-3 mt-auto">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          {nodeType === 'decide' ? <GitBranch className="size-3 shrink-0" /> : <Icon className="size-3 shrink-0" />}
          {nodeType}
        </span>
        {nodeType === 'tool' && nodeData.agentArgs && (nodeData.agentArgs as string[]).length > 0 && (
          <span className="text-xs text-primary/70 flex items-center gap-1">
            <Bot className="size-3 shrink-0" />
            {(nodeData.agentArgs as string[]).length} agent
          </span>
        )}
      </WorkflowNodeFooter>

    </WorkflowNodeBase>
  )
}
