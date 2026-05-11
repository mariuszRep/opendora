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
        handle.position === 'top'
          ? Position.Top
          : handle.position === 'bottom'
            ? Position.Bottom
            : handle.position === 'left'
              ? Position.Left
              : Position.Right

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
      className={`min-w-[250px] ${selected ? 'ring-[3px] ring-ring/50 border-ring' : ''}`}
    >
      {renderHandles()}
      <WorkflowNodeHeader className="pb-3 bg-secondary/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <WorkflowNodeTitle className="text-sm font-medium">
                {nodeData.node.label}
              </WorkflowNodeTitle>
              <div className="text-xs text-muted-foreground mt-0.5">
                {metadata.label} Node
              </div>
              {nodeData.node.description && (
                <WorkflowNodeDescription className="text-xs mt-1">
                  {nodeData.node.description}
                </WorkflowNodeDescription>
              )}
              {nodeData.node.action_id && (
                <div className="mt-2">
                  <Badge variant="secondary" className="text-xs">
                    {nodeData.node.action_id.replace(/-/g, ' ')}
                  </Badge>
                </div>
              )}
              {nodeType === 'start' && (
                <div className="mt-2">
                  <Badge variant="outline" className="text-xs">
                    Workflow Entry
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>
      </WorkflowNodeHeader>
    </WorkflowNodeBase>
  )
}
