'use client'

import * as React from 'react'
import { type NodeProps, Handle, Position } from '@xyflow/react'
import {
  WorkflowNodeBase,
  WorkflowNodeHeader,
  WorkflowNodeTitle,
  WorkflowNodeDescription,
} from './workflow-node-base'
import { Badge } from '@/components/ui/badge'
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
      className={`min-w-[220px] ${selected ? 'ring-[3px] ring-ring/50 border-ring' : ''}`}
    >
      {renderHandles()}
      <WorkflowNodeHeader className="pb-3 bg-secondary/50">
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <WorkflowNodeTitle className="text-sm font-medium leading-tight">
              {nodeData.node.label}
            </WorkflowNodeTitle>
            {nodeType === 'tool' && nodeData.node.action_id ? (
              <Badge variant="secondary" className="mt-1.5 text-xs font-mono">
                {nodeData.node.action_id}
              </Badge>
            ) : nodeType === 'tool' ? (
              <div className="text-xs text-muted-foreground mt-0.5">No tool selected</div>
            ) : nodeType === 'start' ? (
              <div className="text-xs text-muted-foreground mt-0.5">Entry point</div>
            ) : nodeType === 'prompt' ? (
              nodeData.instructions ? (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap break-words">
                  {nodeData.instructions as string}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-0.5">No prompt set</div>
              )
            ) : null}
          </div>
        </div>
      </WorkflowNodeHeader>

    </WorkflowNodeBase>
  )
}
