"use client"

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type NodeTypes,
  type Edge,
} from "@xyflow/react"
import { useMemo } from "react"
import type { Workflow } from "@/lib/opendora"
import { InputNode } from "./nodes/input-node"
import { SkillLoadNode } from "./nodes/skill-load-node"
import { ToolCallNode } from "./nodes/tool-call-node"
import { AgentNode } from "./nodes/agent-node"
import { DecideNode } from "./nodes/decide-node"
import { OutputNode } from "./nodes/output-node"

const nodeTypes: NodeTypes = {
  input: InputNode as any,
  skill_load: SkillLoadNode as any,
  tool_call: ToolCallNode as any,
  agent: AgentNode as any,
  decide: DecideNode as any,
  output: OutputNode as any,
}

interface WorkflowCanvasProps {
  workflow: Workflow
  activeNodeId?: string
  height?: number
}

function Canvas({ workflow, activeNodeId, height = 520 }: WorkflowCanvasProps) {
  const nodes = useMemo(
    () =>
      workflow.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { ...n.data, _active: activeNodeId === n.id },
      })),
    [workflow.nodes, activeNodeId],
  )

  const edges: Edge[] = useMemo(
    () =>
      workflow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: "smoothstep",
      })),
    [workflow.edges],
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
