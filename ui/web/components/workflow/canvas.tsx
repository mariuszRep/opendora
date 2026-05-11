"use client"

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type NodeTypes,
} from "@xyflow/react"
import { useMemo } from "react"
import type { Workflow } from "@/lib/opendora"
import { workflowToFlow } from "./workflow-to-flow"
import { TaskNode } from "./nodes/task-node"
import { DecideNode } from "./nodes/decide-node"
import { SequenceNode } from "./nodes/sequence-node"
import { ParallelNode } from "./nodes/parallel-node"
import { ForeachNode } from "./nodes/foreach-node"

const nodeTypes: NodeTypes = {
  task: TaskNode as any,
  decide: DecideNode as any,
  sequence: SequenceNode as any,
  parallel: ParallelNode as any,
  foreach: ForeachNode as any,
}

interface WorkflowCanvasProps {
  workflow: Workflow
  activeStepId?: string
  height?: number
}

function Canvas({ workflow, activeStepId, height = 520 }: WorkflowCanvasProps) {
  const { nodes, edges } = useMemo(
    () => workflowToFlow(workflow.root as any, activeStepId),
    [workflow, activeStepId],
  )

  return (
    <div style={{ width: "100%", height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={2}
          zoomable
          pannable
          className="!border-border !bg-card"
        />
      </ReactFlow>
    </div>
  )
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}
