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
import { migrateWorkflow, needsMigration } from './migrate-workflow'

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

function WorkflowEditorInner({ workflow: workflowProp, directory, onSave }: WorkflowEditorProps) {
  const reactFlowInstance = useReactFlow()
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null)

  const workflow = React.useMemo(
    () => migrateWorkflow(workflowProp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflowProp.id]
  )

  const [nodes, setNodes] = React.useState<Node<WorkflowNodeData>[]>(() =>
    toReactFlowNodes(workflow)
  )
  const [edges, setEdges] = React.useState<Edge[]>(() =>
    toReactFlowEdges(workflow)
  )

  // Stable refs so saveWorkflow never goes stale
  const onSaveRef = React.useRef(onSave)
  const workflowRef = React.useRef(workflow)
  const nodesRef = React.useRef(nodes)
  const edgesRef = React.useRef(edges)
  React.useEffect(() => { onSaveRef.current = onSave }, [onSave])
  React.useEffect(() => { workflowRef.current = workflow }, [workflow])
  React.useEffect(() => { nodesRef.current = nodes }, [nodes])
  React.useEffect(() => { edgesRef.current = edges }, [edges])

  React.useEffect(() => {
    if (needsMigration(workflowProp)) {
      onSave(workflow).catch(() => {})
    }
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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

  // Stable save — uses refs so it never needs to be recreated
  const saveWorkflow = React.useCallback(
    async (updatedNodes: Node<WorkflowNodeData>[], updatedEdges: Edge[]) => {
      setIsSaving(true)
      try {
        await onSaveRef.current({
          ...workflowRef.current,
          nodes: fromReactFlowNodes(updatedNodes) as Workflow['nodes'],
          edges: fromReactFlowEdges(updatedEdges),
        })
      } catch (err) {
        toast.error('Failed to save workflow')
        console.error('[WorkflowEditor] save error:', err)
      } finally {
        setIsSaving(false)
      }
    },
    [] // stable — reads latest values via refs
  )

  const positionSaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const onNodesChange: OnNodesChange = React.useCallback(
    (changes) => {
      setNodes((nds) => {
        const newNodes = applyNodeChanges(changes, nds) as Node<WorkflowNodeData>[]
        // Save when a drag ends (dragging: false = drop completed)
        if (changes.some((c) => c.type === 'position' && c.dragging === false)) {
          if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current)
          positionSaveTimer.current = setTimeout(() => {
            saveWorkflow(newNodes, edgesRef.current)
          }, 300)
        }
        return newNodes
      })
    },
    [saveWorkflow]
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

      const sourceNode = nodesRef.current.find((n) => n.id === connection.source)
      const targetNode = nodesRef.current.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return

      const sourceType = (sourceNode.data as WorkflowNodeData).nodeType ?? 'tool'
      const targetType = (targetNode.data as WorkflowNodeData).nodeType ?? 'tool'

      const result = validateConnectionSchema(
        sourceType as NodeType,
        connection.source,
        connection.sourceHandle ?? null,
        targetType as NodeType,
        connection.target,
        connection.targetHandle ?? null,
        edgesRef.current
      )

      if (!result.valid) {
        toast.error(result.error ?? 'Connection not allowed')
        return
      }

      const newEdges = addEdge({ ...connection, type: 'animated' }, edgesRef.current)
      setEdges(newEdges)
      saveWorkflow(nodesRef.current, newEdges)
    },
    [saveWorkflow]
  )

  const onNodeDoubleClick: NodeMouseHandler = React.useCallback(
    (_event, node) => {
      setDrawerType('node')
      setDrawerData({ node: node as Node<WorkflowNodeData> })
      setDrawerOpen(true)
    },
    []
  )

  const openWorkflowSettings = React.useCallback(() => {
    setDrawerType('workflow')
    setDrawerData({
      name: workflowRef.current.name,
      description: workflowRef.current.description,
    } as any)
    setDrawerOpen(true)
  }, [])

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
      const updatedNodes = nodesRef.current.filter((n) => !deletedNodes.find((d) => d.id === n.id))
      const deletedIds = new Set(deletedNodes.map((n) => n.id))
      const updatedEdges = edgesRef.current.filter(
        (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)
      )
      setNodes(updatedNodes)
      setEdges(updatedEdges)
      saveWorkflow(updatedNodes, updatedEdges)
    },
    [saveWorkflow]
  )

  const onEdgesDelete = React.useCallback(
    (deletedEdges: Edge[]) => {
      const deletedIds = new Set(deletedEdges.map((e) => e.id))
      const updatedEdges = edgesRef.current.filter((e) => !deletedIds.has(e.id))
      setEdges(updatedEdges)
      saveWorkflow(nodesRef.current, updatedEdges)
    },
    [saveWorkflow]
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

      const updatedNodes = [...nodesRef.current, newNode]
      setNodes(updatedNodes)
      saveWorkflow(updatedNodes, edgesRef.current)
    },
    [reactFlowInstance, saveWorkflow]
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

      const updatedNodes = [...nodesRef.current, newNode]
      setNodes(updatedNodes)
      saveWorkflow(updatedNodes, edgesRef.current)
    },
    [reactFlowInstance, saveWorkflow]
  )

  const handleDrawerSave = React.useCallback(
    (formData: DrawerFormData) => {
      if (drawerType === 'workflow') {
        // Update workflow metadata (name, description)
        workflowRef.current = {
          ...workflowRef.current,
          name: formData.name ?? workflowRef.current.name,
          description: formData.description,
        }
        saveWorkflow(nodesRef.current, edgesRef.current)
        setDrawerOpen(false)
        return
      }

      if (drawerType === 'node' && drawerData?.node) {
        const targetId = drawerData.node.id
        const updatedNodes = nodesRef.current.map((n) => {
          if (n.id !== targetId) return n
          return {
            ...n,
            data: {
              ...n.data,
              nodeType: formData.nodeType ?? n.data.nodeType,
              ...(formData.instructions !== undefined ? { instructions: formData.instructions } : {}),
              node: {
                ...n.data.node,
                label: formData.label ?? n.data.node.label,
                action_id: formData.action_id,
                parameters: formData.parameters,
              },
              data: {
                ...n.data.data,
                ...(formData.inputs !== undefined ? { inputs: formData.inputs } : {}),
              },
            },
          }
        })
        setNodes(updatedNodes)
        saveWorkflow(updatedNodes, edgesRef.current)
        setDrawerOpen(false)
        return
      }

      if (drawerType === 'edge' && drawerData?.edge) {
        const targetId = drawerData.edge.id
        const updatedEdges = edgesRef.current.map((e) => {
          if (e.id !== targetId) return e
          return { ...e, type: formData.type ?? e.type }
        })
        setEdges(updatedEdges)
        saveWorkflow(nodesRef.current, updatedEdges)
        setDrawerOpen(false)
        return
      }
    },
    [drawerType, drawerData, saveWorkflow]
  )

  const handleDrawerDelete = React.useCallback(() => {
    if (drawerType === 'node' && drawerData?.node) {
      const targetId = drawerData.node.id
      const updatedNodes = nodesRef.current.filter((n) => n.id !== targetId)
      const updatedEdges = edgesRef.current.filter(
        (e) => e.source !== targetId && e.target !== targetId
      )
      setNodes(updatedNodes)
      setEdges(updatedEdges)
      saveWorkflow(updatedNodes, updatedEdges)
      setDrawerOpen(false)
    } else if (drawerType === 'edge' && drawerData?.edge) {
      const targetId = drawerData.edge.id
      const updatedEdges = edgesRef.current.filter((e) => e.id !== targetId)
      setEdges(updatedEdges)
      saveWorkflow(nodesRef.current, updatedEdges)
      setDrawerOpen(false)
    }
  }, [drawerType, drawerData, saveWorkflow])

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
