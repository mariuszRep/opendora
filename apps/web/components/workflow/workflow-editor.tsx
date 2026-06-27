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
import { GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  WorkflowCanvas,
  WorkflowEdge,
  WorkflowMiniMap,
  WorkflowNode,
  WorkflowNodePalette,
} from '@/components/react-flow'
import { getDefaultNodeData, NodeTypeId } from '@/components/react-flow/node-type-registry'
import { validateConnection as validateConnectionSchema } from '@/components/react-flow/node-handles'
import { generateUniqueNodeName } from '@/components/react-flow/node-utils'
import type { NodeType, WorkflowNodeData } from '@/components/react-flow/unified-node'
import { WorkflowEditDrawer, type DrawerFormData } from './workflow-edit-drawer'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { toast } from 'sonner'
import { opendora, type Workflow, type WorkflowNodeType } from '@/lib/opendora'
import { migrateWorkflow, needsMigration } from './migrate-workflow'
import { getAvailableRefs } from '@/lib/workflow-refs'
import { cn } from '@/lib/utils'

// ─── Navigation ───────────────────────────────────────────────────────────────

type NavEntry = {
  kind: 'foreach' | 'workflow'
  /** Stable React key for this view */
  key: string
  /** Breadcrumb label */
  label: string
  workflow: Workflow
  onSave: (updated: Workflow) => Promise<void>
  /** Refs pre-seeded from the parent context (e.g. the loop item variable) */
  injectedRefs?: import('@/lib/workflow-refs').RefSuggestion[]
}

const nodeTypes = {
  workflow: WorkflowNode,
} satisfies NodeTypes

const edgeTypes = {
  animated: WorkflowEdge.Animated,
  temporary: WorkflowEdge.Temporary,
} satisfies EdgeTypes

function normalizeNodeData(raw: unknown): WorkflowNodeData {
  const d = (raw ?? {}) as Record<string, unknown>
  const nodeType = (d.nodeType as NodeType) ?? NodeTypeId.Tool
  const defaults = getDefaultNodeData(nodeType)
  const node = d.node && typeof d.node === 'object' ? (d.node as Record<string, unknown>) : null
  return {
    ...(d as WorkflowNodeData),
    node: node
      ? { ...defaults.node, ...(node as unknown as WorkflowNodeData['node']), label: (node.label as string) || defaults.node.label }
      : defaults.node,
    data: (d.data as WorkflowNodeData['data']) ?? defaults.data,
  }
}

function toReactFlowNodes(workflow: Workflow): Node<WorkflowNodeData>[] {
  return (workflow.nodes ?? [])
    .filter((n) => n.type === 'workflow')
    .map((n) => ({
      id: n.id,
      type: 'workflow',
      position: n.position,
      data: normalizeNodeData(n.data),
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
  onNavStackChange?: (entries: Array<{ label: string }>) => void
  popToRef?: React.MutableRefObject<((idx: number) => void) | null>
}

type DecideCase = { label: string; when?: unknown }

function syncDecideCaseRename(
  nodes: Node<WorkflowNodeData>[],
  sourceNodeId: string,
  oldLabel: string,
  newLabel: string
): Node<WorkflowNodeData>[] {
  return nodes.map((n) => {
    if (n.id !== sourceNodeId) return n
    if (n.data.nodeType !== NodeTypeId.Decide) return n
    const params = (n.data.node.parameters ?? {}) as Record<string, unknown>
    const cases = (params.cases as DecideCase[] | undefined) ?? []
    // If newLabel already matches an existing case this is a condition switch, not a rename
    if (cases.some((c) => c.label === newLabel)) return n
    return {
      ...n,
      data: {
        ...n.data,
        node: {
          ...n.data.node,
          parameters: {
            ...params,
            cases: cases.map((c) => c.label === oldLabel ? { ...c, label: newLabel } : c),
          },
        },
      },
    }
  }) as Node<WorkflowNodeData>[]
}

interface WorkflowEditorInnerProps extends WorkflowEditorProps {
  onPushNavEntry?: (entry: NavEntry) => void
  currentWorkflowId?: string
  injectedRefs?: import('@/lib/workflow-refs').RefSuggestion[]
}

function WorkflowEditorInner({
  workflow: workflowProp,
  directory,
  onSave,
  onPushNavEntry,
  currentWorkflowId,
  injectedRefs,
}: WorkflowEditorInnerProps) {
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
  const [pendingDecideConn, setPendingDecideConn] = React.useState<{
    connection: Parameters<OnConnect>[0]
    cases: Array<{ label: string }>
  } | null>(null)
  const [decideLabelValue, setDecideLabelValue] = React.useState('')
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [drawerType, setDrawerType] = React.useState<'workflow' | 'node' | 'edge'>('workflow')
  const [drawerData, setDrawerData] = React.useState<{
    name?: string
    description?: string
    node?: Node<WorkflowNodeData>
    edge?: Edge
    sourceDecideCases?: Array<{ label: string }>
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

  const confirmDecideEdge = React.useCallback(
    (label: string) => {
      if (!pendingDecideConn || !label.trim()) return
      const conn = pendingDecideConn.connection
      const trimmed = label.trim()
      const newEdges = addEdge({ ...conn, type: 'animated', label: trimmed }, edgesRef.current)
      setEdges(newEdges)

      // "result" is a routing keyword — it always fires and carries the decision value,
      // so it is not a decision case and should not be added to the decide node's cases.
      const updatedNodes = trimmed === 'result' ? nodesRef.current : nodesRef.current.map((n) => {
        if (n.id !== conn.source) return n
        const data = n.data as WorkflowNodeData
        const params = (data.node.parameters ?? {}) as Record<string, unknown>
        const cases = (params.cases as Array<{ label: string; when?: unknown }> | undefined) ?? []
        if (cases.some((c) => c.label === trimmed)) return n
        const mode = (params.mode as string) ?? 'agent'
        const newCase = mode === 'deterministic'
          ? { label: trimmed, when: { op: 'equals', value: trimmed } }
          : { label: trimmed }
        return {
          ...n,
          data: { ...n.data, node: { ...data.node, parameters: { ...params, cases: [...cases, newCase] } } },
        }
      })
      setNodes(updatedNodes)
      saveWorkflow(updatedNodes, newEdges)
      setPendingDecideConn(null)
      setDecideLabelValue('')
    },
    [pendingDecideConn, saveWorkflow]
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

      if (sourceType === 'decide') {
        const cases = ((sourceNode.data as WorkflowNodeData).node.parameters?.cases as Array<{ label: string }> | undefined) ?? []
        const targetLabel = (targetNode.data as WorkflowNodeData).node.label || ''
        setPendingDecideConn({ connection, cases })
        setDecideLabelValue(targetLabel)
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
      const sourceNode = nodesRef.current.find((n) => n.id === edge.source)
      const nodeData = sourceNode?.data as WorkflowNodeData | undefined
      const sourceDecideCases = nodeData?.nodeType === NodeTypeId.Decide
        ? (nodeData.node.parameters?.cases as Array<{ label: string }> | undefined) ?? []
        : undefined
      setDrawerType('edge')
      setDrawerData({ edge, sourceDecideCases })
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

      // Remove cases from decide nodes when their labeled outgoing edges are deleted
      let updatedNodes = nodesRef.current
      for (const edge of deletedEdges) {
        if (typeof edge.label !== 'string' || !edge.label) continue
        const sourceNode = updatedNodes.find((n) => n.id === edge.source)
        if (!sourceNode || (sourceNode.data as WorkflowNodeData).nodeType !== 'decide') continue
        // Only remove if no remaining edge from this decide node still uses this label
        const labelStillUsed = updatedEdges.some((e) => e.source === edge.source && e.label === edge.label)
        if (labelStillUsed) continue
        const label = edge.label
        updatedNodes = updatedNodes.map((n) => {
          if (n.id !== edge.source) return n
          const data = n.data as WorkflowNodeData
          const params = (data.node.parameters ?? {}) as Record<string, unknown>
          const cases = (params.cases as Array<{ label: string }> | undefined) ?? []
          return {
            ...n,
            data: { ...n.data, node: { ...data.node, parameters: { ...params, cases: cases.filter((c) => c.label !== label) } } },
          }
        })
      }

      setEdges(updatedEdges)
      if (updatedNodes !== nodesRef.current) setNodes(updatedNodes)
      saveWorkflow(updatedNodes, updatedEdges)
    },
    [saveWorkflow]
  )

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const makeNodeKey = React.useCallback((label: string): string => {
    const existingKeys = new Set(
      nodesRef.current.map((n) => (n.data?.node as any)?.key).filter(Boolean) as string[]
    )
    const raw = generateUniqueNodeName(label, existingKeys)
    return /^[0-9]/.test(raw) ? `n_${raw}` : raw
  }, [])

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const nodeType = event.dataTransfer.getData('application/reactflow') as NodeType
      if (!nodeType) return

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const defaultData = getDefaultNodeData(nodeType)
      const key = makeNodeKey(defaultData.node.label)
      const newNode: Node<WorkflowNodeData> = {
        id: nanoid(),
        type: 'workflow',
        position,
        data: {
          nodeType,
          node: { ...defaultData.node, key },
          data: { inputs: [], outputs: [] },
        },
      }

      const updatedNodes = [...nodesRef.current, newNode]
      setNodes(updatedNodes)
      saveWorkflow(updatedNodes, edgesRef.current)
    },
    [reactFlowInstance, saveWorkflow, makeNodeKey]
  )

  const onNodeDoubleClickFromPalette = React.useCallback(
    (nodeType: string) => {
      const type = nodeType as NodeType
      const defaultData = getDefaultNodeData(type)
      const center = reactFlowInstance.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })

      const key = makeNodeKey(defaultData.node.label)
      const newNode: Node<WorkflowNodeData> = {
        id: nanoid(),
        type: 'workflow',
        position: center,
        data: {
          nodeType: type,
          node: { ...defaultData.node, key },
          data: { inputs: [], outputs: [] },
        },
      }

      const updatedNodes = [...nodesRef.current, newNode]
      setNodes(updatedNodes)
      saveWorkflow(updatedNodes, edgesRef.current)
    },
    [reactFlowInstance, saveWorkflow, makeNodeKey]
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
              ...(formData.agentArgs !== undefined ? { agentArgs: formData.agentArgs } : {}),
              ...(formData.workflowParameters !== undefined ? { workflowParameters: formData.workflowParameters } : {}),
              ...(formData.outputSchema !== undefined ? { outputSchema: formData.outputSchema } : {}),
              ...(formData.schemaProps !== undefined ? { schemaProps: formData.schemaProps } : {}),
              ...(formData.renderLayout !== undefined ? { renderLayout: formData.renderLayout } : formData.renderLayout === null ? { renderLayout: undefined } : {}),
              model: formData.model ?? undefined,
              node: {
                ...n.data.node,
                label: formData.label ?? n.data.node.label,
                action_id: formData.action_id,
                parameters: formData.parameters,
                ...(formData.retry !== undefined ? { retry: formData.retry } : {}),
              },
              data: {
                ...n.data.data,
                ...(formData.inputs !== undefined ? { inputs: formData.inputs } : {}),
              },
            },
          }
        })

        // Decide nodes: keep outgoing edge labels in sync when a case is renamed
        // in the drawer (index-based pairing). Without this the runner finds a
        // matching case in params.cases but no edge with that label, and throws.
        let updatedEdges = edgesRef.current
        const oldNodeData = drawerData.node.data as WorkflowNodeData | undefined
        if (oldNodeData?.nodeType === NodeTypeId.Decide && formData.nodeType !== undefined && formData.nodeType === NodeTypeId.Decide) {
          const oldCases = ((oldNodeData.node.parameters?.cases as DecideCase[] | undefined) ?? [])
          const newCases = (((formData.parameters as Record<string, unknown> | undefined)?.cases as DecideCase[] | undefined) ?? [])
          const renames = new Map<string, string>()
          for (let i = 0; i < Math.min(oldCases.length, newCases.length); i++) {
            const oldLabel = oldCases[i]?.label
            const newLabel = newCases[i]?.label
            if (oldLabel && newLabel && oldLabel !== newLabel) renames.set(oldLabel, newLabel)
          }
          if (renames.size > 0) {
            updatedEdges = edgesRef.current.map((e) => {
              if (e.source !== targetId) return e
              if (typeof e.label !== 'string') return e
              const mapped = renames.get(e.label)
              return mapped ? { ...e, label: mapped } : e
            })
          }
        }

        setNodes(updatedNodes)
        if (updatedEdges !== edgesRef.current) setEdges(updatedEdges)
        saveWorkflow(updatedNodes, updatedEdges)
        setDrawerOpen(false)
        return
      }

      if (drawerType === 'edge' && drawerData?.edge) {
        const targetId = drawerData.edge.id
        const oldLabel = typeof drawerData.edge.label === 'string' ? drawerData.edge.label : undefined
        const newLabel = formData.edgeLabel?.trim()

        let updatedNodes = nodesRef.current
        if (newLabel !== undefined && oldLabel !== undefined && newLabel !== oldLabel && newLabel !== 'result') {
          updatedNodes = syncDecideCaseRename(nodesRef.current, drawerData.edge.source, oldLabel, newLabel)
        }

        const updatedEdges = edgesRef.current.map((e) => {
          if (e.id !== targetId) return e
          return { ...e, type: formData.type ?? e.type, label: newLabel !== undefined ? newLabel : e.label }
        })

        if (updatedNodes !== nodesRef.current) setNodes(updatedNodes)
        setEdges(updatedEdges)
        saveWorkflow(updatedNodes, updatedEdges)
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

  const handleOpenForEachCanvas = React.useCallback(() => {
    if (!drawerData?.node) return
    const node = nodesRef.current.find((n) => n.id === drawerData.node!.id)
    if (!node) return
    const nodeData = node.data as WorkflowNodeData
    const params = (nodeData.node.parameters ?? {}) as Record<string, unknown>
    const nodeId = node.id
    const label = nodeData.node.label || 'For Each'
    const itemVariable = (params.item_variable as string) || 'item'
    const sub = (nodeData as any).subWorkflow as { nodes: Workflow['nodes']; edges: Workflow['edges'] } | undefined

    setDrawerOpen(false)

    // Collect parent-workflow refs available to the ForEach node itself so they're
    // also accessible inside the loop body
    const parentRefs = getAvailableRefs(nodeId, nodesRef.current, edgesRef.current)

    onPushNavEntry?.({
      kind: 'foreach',
      key: `foreach-sub-${nodeId}`,
      label: `${label}`,
      workflow: {
        id: `foreach-sub-${nodeId}`,
        name: `${label}`,
        description: `Loop body — $${itemVariable} is the current item.`,
        version: '1.0.0',
        nodes: sub?.nodes ?? [],
        edges: sub?.edges ?? [],
      },
      onSave: async (updated) => {
        const updatedNodes = nodesRef.current.map((n) => {
          if (n.id !== nodeId) return n
          return { ...n, data: { ...n.data, subWorkflow: { nodes: updated.nodes, edges: updated.edges } } }
        })
        setNodes(updatedNodes)
        await saveWorkflow(updatedNodes, edgesRef.current)
      },
      injectedRefs: [
        {
          ref: `$${itemVariable}`,
          source: label,
          description: 'current loop item',
        },
        ...parentRefs,
      ],
    })
  }, [drawerData, nodesRef, onPushNavEntry, saveWorkflow])

  const handleEditWorkflow = React.useCallback(
    async (workflowId: string) => {
      try {
        const wf = await opendora.workflow.get(workflowId)
        setDrawerOpen(false)
        onPushNavEntry?.({
          kind: 'workflow',
          key: `workflow-${workflowId}`,
          label: wf.name || workflowId,
          workflow: wf,
          onSave: async (updated) => { await opendora.workflow.update(workflowId, updated) },
        })
      } catch {
        toast.error(`Could not load workflow "${workflowId}"`)
      }
    },
    [onPushNavEntry],
  )

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

          <Dialog open={!!pendingDecideConn} onOpenChange={(open) => { if (!open) { setPendingDecideConn(null); setDecideLabelValue('') } }}>
            <DialogContent className="w-80">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sm">
                  <GitBranch className="h-4 w-4" /> Name this branch
                </DialogTitle>
                <DialogDescription className="text-xs">
                  This becomes the condition label on the decide node.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-1.5">
                {pendingDecideConn?.cases.filter((c) => c.label).map((c) => (
                  <Button key={c.label} variant="outline" size="sm" className="font-mono text-xs h-7"
                    onClick={() => confirmDecideEdge(c.label)}>
                    {c.label}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="font-mono text-xs h-7 text-muted-foreground"
                  onClick={() => confirmDecideEdge('result')}>
                  result
                </Button>
              </div>

              <Input
                placeholder="Or type a new condition name…"
                value={decideLabelValue}
                onChange={(e) => setDecideLabelValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmDecideEdge(decideLabelValue)
                  if (e.key === 'Escape') { setPendingDecideConn(null); setDecideLabelValue('') }
                }}
                className="font-mono text-xs"
                autoFocus
              />

              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => { setPendingDecideConn(null); setDecideLabelValue('') }}>Cancel</Button>
                <Button size="sm" onClick={() => confirmDecideEdge(decideLabelValue)} disabled={!decideLabelValue.trim()}>Connect</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
            availableRefs={
              drawerType === 'node' && drawerData?.node
                ? [
                    ...(injectedRefs ?? []),
                    ...getAvailableRefs((drawerData.node as Node<WorkflowNodeData>).id, nodes, edges),
                  ]
                : (injectedRefs?.length ? injectedRefs : undefined)
            }
            sourceDecideCases={drawerData?.sourceDecideCases}
            currentWorkflowId={currentWorkflowId ?? workflowRef.current.id}
            onOpenForEachCanvas={handleOpenForEachCanvas}
            onEditWorkflow={handleEditWorkflow}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export function WorkflowEditor({ workflow, directory, onSave, onNavStackChange, popToRef }: WorkflowEditorProps) {
  const [navStack, setNavStack] = React.useState<NavEntry[]>([])

  const pushNavEntry = React.useCallback((entry: NavEntry) => {
    setNavStack((prev) => {
      const idx = prev.findIndex((e) => e.key === entry.key)
      if (idx !== -1) return [...prev.slice(0, idx), entry]
      return [...prev, entry]
    })
  }, [])

  const popTo = React.useCallback((idx: number) => {
    setNavStack((prev) => prev.slice(0, idx))
  }, [])

  // Expose popTo to parent so the page-level breadcrumb can trigger back-navigation
  React.useEffect(() => {
    if (popToRef) popToRef.current = popTo
  }, [popTo, popToRef])

  // Notify parent when nav stack changes so it can extend the page breadcrumb
  React.useEffect(() => {
    onNavStackChange?.(navStack.map((e) => ({ label: e.label })))
  }, [navStack, onNavStackChange])

  const allViews = React.useMemo(() => [
    { key: workflow.id, label: workflow.name, workflow, onSave },
    ...navStack,
  ], [workflow, onSave, navStack])

  const currentIdx = allViews.length - 1

  return (
    <div className="h-full w-full relative overflow-hidden">
      {allViews.map((view, idx) => (
        <div
          key={view.key}
          className={cn('absolute inset-0', idx !== currentIdx && 'hidden')}
        >
          <ReactFlowProvider>
            <WorkflowEditorInner
              workflow={view.workflow}
              directory={directory}
              onSave={view.onSave}
              onPushNavEntry={pushNavEntry}
              currentWorkflowId={workflow.id}
              injectedRefs={(view as NavEntry).injectedRefs}
            />
          </ReactFlowProvider>
        </div>
      ))}
    </div>
  )
}
