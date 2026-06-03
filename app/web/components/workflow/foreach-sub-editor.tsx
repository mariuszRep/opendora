'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { WorkflowEditor } from './workflow-editor'
import type { Workflow } from '@/lib/opendora'

interface SubWorkflow {
  nodes: Workflow['nodes']
  edges: Workflow['edges']
}

interface ForEachSubEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId: string
  nodeLabel: string
  itemVariable: string
  subWorkflow: SubWorkflow | undefined
  onSave: (subWorkflow: SubWorkflow) => void
  directory?: string
}

export function ForEachSubEditor({
  open,
  onOpenChange,
  nodeId,
  nodeLabel,
  itemVariable,
  subWorkflow,
  onSave,
  directory,
}: ForEachSubEditorProps) {
  const syntheticWorkflow = React.useMemo<Workflow>(() => ({
    id: `foreach-sub-${nodeId}`,
    name: `Loop body: ${nodeLabel}`,
    description: `Sub-pipeline executed for each item in the For Each loop. The current item is available as $ctx.${itemVariable || 'item'}.`,
    version: '1.0.0',
    nodes: subWorkflow?.nodes ?? [],
    edges: subWorkflow?.edges ?? [],
  }), [nodeId, nodeLabel, itemVariable, subWorkflow])

  const handleSave = React.useCallback(
    async (updated: Workflow) => {
      onSave({ nodes: updated.nodes, edges: updated.edges })
    },
    [onSave],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-sm font-semibold">
              Loop body — {nodeLabel}
            </DialogTitle>
            <Badge variant="secondary" className="font-mono text-xs">
              $ctx.{itemVariable || 'item'}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Build the pipeline that runs for each item. Reference the current item as{' '}
            <code className="font-mono">$ctx.{itemVariable || 'item'}</code> in any node.
            Changes are saved automatically when you close.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <WorkflowEditor
            workflow={syntheticWorkflow}
            directory={directory}
            onSave={handleSave}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
