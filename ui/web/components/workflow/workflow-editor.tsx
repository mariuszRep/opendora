'use client'

import * as React from 'react'
import {
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import { nanoid } from 'nanoid'
import {
  WorkflowCanvas,
  WorkflowEdge,
  WorkflowMiniMap,
  WorkflowNode,
  WorkflowNodePalette,
} from '@/components/react-flow'
import { getDefaultNodeData } from '@/components/react-flow/node-type-registry'
import { validateConnection as validateConnectionSchema } from '@/components/react-flow/node-handles'
import type { NodeType, WorkflowNodeData } from '@/components/react-flow/unified-node'
import { WorkflowEditDrawer, type DrawerFormData } from './workflow-edit-drawer'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { toast } from 'sonner'
import type { Workflow, WorkflowNodeType } from '@/lib/opendora'

const nodeTypes = {
  workflow: WorkflowNode,
} satisfies NodeTypes

const edgeTypes = {
  animated: WorkflowEdge.Animated,
  temporary: WorkflowEdge.Temporary,
} satisfies EdgeTypes

function toReactFlowNodes(workflow: Workflow): Node<WorkflowNodeData>[] {
  return (workflow.nodes ?? [])
    .filter((n) => n.type === 'workflow')
    .map((n) => ({
      id: n.id,
      type: 'workflow',
      position: n.position,
      data: n.data as unknown as WorkflowNodeData,
    }))
}

function toReactFlowEdges(workflow: Workflow): Edge[] {
  return (workflow.edges ?? []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'animated',
  }))
}

function fromReactFlowNodes(nodes: Node<WorkflowNodeData>[]): Workflow['nodes'] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'workflow' as WorkflowNodeType,
    position: n.position,
    data: n.data as Record<string, unknown>,
  })) as Workflow['nodes']
}

function fromReactFlowEdges(edges: Edge[]): Workflow['edges'] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: typeof e.label === 'string' ? e.label : undefined,
  }))
}

interface WorkflowEditorProps {
  workflow: Workflow
  directory?: string
  onSave: (workflow: Workflow) => Promise<void>
}

function WorkflowEditorInner({ workflow, directory, onSave }: WorkflowEditorProps) {
  const reactFlowInstance = useReactFlow()
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null)

  const [nodes, setNodes] = React.useState<Node<WorkflowNodeData>[]>(() =>
    toReactFlowNodes(workflow)
  )
  const [edges, setEdges] = React.useState<Edge[]>(() =>
    toReactFlowEdges(workflow)
  )
  const [isSaving, setIsSaving] = React.useState(false)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [drawerType, setDrawerType] = React.useState<'workflow' | 'node' | 'edge'>('workflow')
  const [drawerData, setDrawerData] = React.useState<{
    name?: string
    description?: string
    node?: Node<WorkflowNodeData>
    edge?: Edge
  } | null>(null)
  const [showMiniMap, setShowMiniMap] = React.useState(true)

  const saveWorkflow = React.useCallback(
    async (updatedNodes: Node<WorkflowNodeData>[], updatedEdges: Edge[]) => {
      setIsSaving(true)
      try {
        await onSave({
          ...workflow,
          nodes: fromReactFlowNodes(updatedNodes) as Workflow['nodes'],
          edges: fromReactFlowEdges(updatedEdges),
        })
      } catch {
        toast.error('Failed to save workflow')
      } finally {
        setIsSaving(false)
      }
    },
    [workflow, onSave]
  )

  const onNodesChange: OnNodesChange = React.useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds) as Node<WorkflowNodeData>[])
    },
    []
  )

  const onEdgesChange: OnEdgesChange = React.useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds))
    },
    []
  )

  const onConnect: OnConnect = React.useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return

      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return

      const sourceType = (sourceNode.data as WorkflowNodeData).nodeType ?? 'stage'
      const targetType = (targetNode.data as WorkflowNodeData).nodeType ?? 'stage'

      const result = validateConnectionSchema(
        sourceType as NodeType,
        connection.source,
        connection.sourceHandle ?? null,
        targetType as NodeType,
        connection.target,
        connection.targetHandle ?? null,
        edges
      )

      if (!result.valid) {
        toast.error(result.error ?? 'Connection not allowed')
        return
      }

      const newEdges = addEdge({ ...connection, type: 'animated' }, edges)
      setEdges(newEdges)
      saveWorkflow(nodes, newEdges)
    },
    [nodes, edges, saveWorkflow]
  )

  const onNodeDoubleClick: NodeMouseHandler = React.useCallback(
    (_event, node) => {
      setDrawerType('node')
      setDrawerData({ node: node as Node<WorkflowNodeData> })
      setDrawerOpen(true)
    },
    []
  )

  const onEdgeDoubleClick: EdgeMouseHandler = React.useCallback(
    (_event, edge) => {
      setDrawerType('edge')
      setDrawerData({ edge })
      setDrawerOpen(true)
    },
    []
  )

  const onNodesDelete = React.useCallback(
    (deletedNodes: Node[]) => {
      const updatedNodes = nodes.filter((n) => !deletedNodes.find((d) => d.id === n.id))
      const deletedIds = new Set(deletedNodes.map((n) => n.id))
      const updatedEdges = edges.filter(
        (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)
      )
      setNodes(updatedNodes)
      setEdges(updatedEdges)
      saveWorkflow(updatedNodes, updatedEdges)
    },
    [nodes, edges, saveWorkflow]
  )

  const onEdgesDelete = React.useCallback(
    (deletedEdges: Edge[]) => {
      const deletedIds = new Set(deletedEdges.map((e) => e.id))
      const updatedEdges = edges.filter((e) => !deletedIds.has(e.id))
      setEdges(updatedEdges)
      saveWorkflow(nodes, updatedEdges)
    },
    [nodes, edges, saveWorkflow]
  )

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const nodeType = event.dataTransfer.getData('application/reactflow') as NodeType
      if (!nodeType) return

      const wrapperBounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!wrapperBounds) return

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - wrapperBounds.left,
        y: event.clientY - wrapperBounds.top,
      })

      const defaultData = getDefaultNodeData(nodeType)
      const newNode: Node<WorkflowNodeData> = {
        id: nanoid(),
        type: 'workflow',
        position,
        data: {
          nodeType,
          node: defaultData.node,
          data: { inputs: [], outputs: [] },
        },
      }

      const updatedNodes = [...nodes, newNode]
      setNodes(updatedNodes)
      saveWorkflow(updatedNodes, edges)
    },
    [reactFlowInstance, nodes, edges, saveWorkflow]
  )

  const onNodeDoubleClickFromPalette = React.useCallback(
    (nodeType: string) => {
      const type = nodeType as NodeType
      const defaultData = getDefaultNodeData(type)
      const center = reactFlowInstance.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })

      const newNode: Node<WorkflowNodeData> = {
        id: nanoid(),
        type: 'workflow',
        position: center,
        data: {
          nodeType: type,
          node: defaultData.node,
          data: { inputs: [], outputs: [] },
        },
      }

      const updatedNodes = [...nodes, newNode]
      setNodes(updatedNodes)
      saveWorkflow(updatedNodes, edges)
    },
    [reactFlowInstance, nodes, edges, saveWorkflow]
  )

  const handleDrawerSave = React.useCallback(
    (formData: DrawerFormData) => {
      if (drawerType === 'workflow') {
        saveWorkflow(nodes, edges)
        setDrawerOpen(false)
        return
      }

      if (drawerType === 'node' && drawerData?.node) {
        const targetId = drawerData.node.id
        const updatedNodes = nodes.map((n) => {
          if (n.id !== targetId) return n
          return {
            ...n,
            data: {
              ...n.data,
              nodeType: formData.nodeType ?? n.data.nodeType,
              node: {
                ...n.data.node,
                label: formData.label ?? n.data.node.label,
                action_id: formData.action_id,
                parameters: formData.parameters,
              },
            },
          }
        })
        setNodes(updatedNodes)
        saveWorkflow(updatedNodes, edges)
        setDrawerOpen(false)
        return
      }

      if (drawerType === 'edge' && drawerData?.edge) {
        const targetId = drawerData.edge.id
        const updatedEdges = edges.map((e) => {
          if (e.id !== targetId) return e
          return { ...e, type: formData.type ?? e.type }
        })
        setEdges(updatedEdges)
        saveWorkflow(nodes, updatedEdges)
        setDrawerOpen(false)
        return
      }
    },
    [drawerType, drawerData, nodes, edges, saveWorkflow]
  )

  const handleDrawerDelete = React.useCallback(() => {
    if (drawerType === 'node' && drawerData?.node) {
      const targetId = drawerData.node.id
      const updatedNodes = nodes.filter((n) => n.id !== targetId)
      const updatedEdges = edges.filter(
        (e) => e.source !== targetId && e.target !== targetId
      )
      setNodes(updatedNodes)
      setEdges(updatedEdges)
      saveWorkflow(updatedNodes, updatedEdges)
      setDrawerOpen(false)
    } else if (drawerType === 'edge' && drawerData?.edge) {
      const targetId = drawerData.edge.id
      const updatedEdges = edges.filter((e) => e.id !== targetId)
      setEdges(updatedEdges)
      saveWorkflow(nodes, updatedEdges)
      setDrawerOpen(false)
    }
  }, [drawerType, drawerData, nodes, edges, saveWorkflow])

  return (
    <SidebarProvider className="relative flex h-full w-full overflow-hidden">
      <WorkflowNodePalette onNodeDoubleClick={onNodeDoubleClickFromPalette} />
      <SidebarInset className="relative flex-1 overflow-hidden">
        <div className="flex items-center h-8 px-2 border-b bg-muted/30 gap-2">
          <SidebarTrigger className="size-7" />
          {isSaving && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
        </div>

        <div
          ref={reactFlowWrapper}
          className="relative flex-1 h-[calc(100%-2rem)]"
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            proOptions={{ hideAttribution: true }}
          >
            {showMiniMap && <WorkflowMiniMap />}
          </WorkflowCanvas>

          <WorkflowEditDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            editType={drawerType}
            data={drawerData ?? undefined}
            onSave={handleDrawerSave}
            onDelete={handleDrawerDelete}
            isSaving={isSaving}
            showMiniMap={showMiniMap}
            setShowMiniMap={setShowMiniMap}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  )
}
