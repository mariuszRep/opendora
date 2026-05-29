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
import { Brain } from 'lucide-react'
import { getHandlesForNodeType } from './node-handles'
import { getNodeTypeMetadata, NodeTypeId } from './node-type-registry'
import { resolveNodeType } from './node-utils'
import type { WorkflowNodeData } from './unified-node'

function isAiDriven(nodeData: WorkflowNodeData): boolean {
  const nodeType = resolveNodeType(nodeData)
  if (nodeType === NodeTypeId.Prompt) return true
  if (nodeType === NodeTypeId.Decide) return (nodeData.node?.parameters?.mode as string | undefined) !== 'deterministic'
  if (nodeType === NodeTypeId.Tool) return ((nodeData.agentArgs as string[] | undefined)?.length ?? 0) > 0
  return false
}

export function WorkflowNode({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData
  const nodeType = resolveNodeType(nodeData)
  const metadata = getNodeTypeMetadata(nodeType)
  const Icon = metadata.icon
  const ai = isAiDriven(nodeData)

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
            {nodeData.node?.label ?? ''}
          </WorkflowNodeTitle>
          {nodeData.node?.description ? (
            <WorkflowNodeDescription className="text-sm line-clamp-2 mt-1">
              {nodeData.node.description}
            </WorkflowNodeDescription>
          ) : null}
        </div>
      </WorkflowNodeHeader>

      <WorkflowNodeFooter className="border-t bg-muted/30 pt-3 mt-auto">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Icon className="size-3 shrink-0" />
          {metadata.label}
        </span>
        {ai && (
          <Brain className="size-3.5 shrink-0 text-primary/60 ml-auto" />
        )}
      </WorkflowNodeFooter>
    </WorkflowNodeBase>
  )
}
