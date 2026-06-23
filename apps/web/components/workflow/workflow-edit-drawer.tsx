'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@/components/ui/combobox'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Trash2, Save, X, GitBranch, Workflow as WorkflowIcon, Map as MapIcon, Plus, Cpu, ChevronDown, ExternalLink, LayoutGrid } from 'lucide-react'
import { WorkflowControls, WorkflowControlButton, WorkflowZoomBar } from '@/components/react-flow'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, UnifiedNodeData, NodeType, WorkflowParameter, JsonSchemaType, NodeModel } from '@/components/react-flow/unified-node'
import { getNodeTypeMetadata, NodeTypeId } from '@/components/react-flow/node-type-registry'
import { resolveNodeType } from '@/components/react-flow/node-utils'
import { useToolSchemas } from '@/hooks/use-tool-schemas'
import { ToolParameterForm } from './tool-parameter-form'
import { opendora, type ToolSchema, type ToolSchemaProperty, type Workflow as WorkflowDef } from '@/lib/opendora'
import { useModelList } from '@/hooks/use-model-list'
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector'
import { TOOL_GROUP_ORDER, TOOL_GROUP_LABELS, getToolGroup, HIDDEN_TOOLS } from '@/lib/tool-groups'
import { ExpressionInput } from './expression-input'
import { PromptInput } from './prompt-input'
import { SchemaBuilder, schemaPropsToJsonSchema, jsonSchemaToProps, type SchemaProp } from './schema-builder'
import type { RefSuggestion } from '@/lib/workflow-refs'

interface ModelPickerProps {
  value: NodeModel | undefined
  onChange: (model: NodeModel | undefined) => void
}

function ModelPicker({ value, onChange }: ModelPickerProps) {
  const { modelList, modelsByProvider, refreshProviders } = useModelList()
  const [open, setOpen] = React.useState(false)

  const selectedModelName = React.useMemo(() => {
    if (!value) return null
    const entry = modelList.find((m) => m.providerID === value.providerID && m.modelID === value.modelID)
    return entry?.modelName ?? value.modelID
  }, [value, modelList])

  return (
    <ModelSelector
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (isOpen) refreshProviders().catch(() => {})
      }}
    >
      <ModelSelectorTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between font-normal h-8 text-xs">
          <span className="flex items-center gap-1.5 min-w-0">
            {value ? (
              <>
                <ModelSelectorLogo provider={value.providerID} />
                <ModelSelectorName className="truncate">{selectedModelName}</ModelSelectorName>
              </>
            ) : (
              <span className="text-muted-foreground">Agent default</span>
            )}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models…" />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          <ModelSelectorGroup heading="Default">
            <ModelSelectorItem value="__default__" onSelect={() => { onChange(undefined); setOpen(false) }}>
              <ModelSelectorName>Agent default</ModelSelectorName>
            </ModelSelectorItem>
          </ModelSelectorGroup>
          {[...modelsByProvider.entries()].map(([providerName, models]) => (
            <ModelSelectorGroup key={providerName} heading={providerName}>
              {models.map((m) => (
                <ModelSelectorItem
                  key={`${m.providerID}::${m.modelID}`}
                  value={`${m.providerID}::${m.modelID} ${m.modelName}`}
                  onSelect={() => { onChange({ providerID: m.providerID, modelID: m.modelID }); setOpen(false) }}
                >
                  <ModelSelectorLogo provider={m.providerID} />
                  <ModelSelectorName>{m.modelName}</ModelSelectorName>
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  )
}

function useWorkflowList() {
  const [workflows, setWorkflows] = React.useState<WorkflowDef[]>([])
  React.useEffect(() => {
    opendora.workflow.list().then(setWorkflows).catch(() => {})
  }, [])
  return workflows
}

function useAgentList() {
  const [agents, setAgents] = React.useState<Array<{ id?: string; name: string }>>([])
  React.useEffect(() => {
    opendora.agent.list().then(setAgents).catch(() => {})
  }, [])
  return agents
}

function useWorkflowParams(workflowId: string) {
  const [wfParams, setWfParams] = React.useState<WorkflowParameter[]>([])
  const [loading, setLoading] = React.useState(false)
  React.useEffect(() => {
    if (!workflowId) { setWfParams([]); return }
    setLoading(true)
    opendora.workflow.get(workflowId)
      .then((wf) => {
        const paramsNode = wf.nodes.find((n: any) => (n.data as any)?.nodeType === 'parameters')
        setWfParams(((paramsNode?.data as any)?.workflowParameters as WorkflowParameter[]) ?? [])
      })
      .catch(() => setWfParams([]))
      .finally(() => setLoading(false))
  }, [workflowId])
  return { wfParams, loading }
}

type EditType = 'workflow' | 'node' | 'edge'

type BuiltinSchema = { description: string; properties: Record<string, ToolSchemaProperty>; required: string[] }

const BUILTIN_SCHEMAS: Record<string, BuiltinSchema> = {
  skill_load: {
    description: 'Load a skill into the workflow context so agent nodes can use it.',
    properties: {
      name: { type: 'string', description: 'Name of the skill to load (must exist in .projectflows/skill/)' },
      storeAs: { type: 'string', description: 'Context key to store the skill under (default: skill_<name>)' },
    },
    required: ['name'],
  },
  agent: {
    description: 'Send a prompt to the agent and store the response.',
    properties: {
      prompt: { type: 'string', description: 'Prompt to send. Use $input.fieldName or $ctx.key for substitution.' },
      output: { type: 'string', description: 'Context key to store the agent response under' },
    },
    required: ['prompt'],
  },
  decide: {
    description: 'Ask the agent to choose a branch and route execution accordingly.',
    properties: {
      prompt: { type: 'string', description: 'Decision prompt. Use $ctx.key for context. Agent must reply with one branch name.' },
      branches: { type: 'string', description: 'Comma-separated branch names (e.g. "yes, no" or "summarize, deeper")' },
    },
    required: ['prompt', 'branches'],
  },
  output: {
    description: 'Final output node — displays a message and ends execution.',
    properties: {
      message: { type: 'string', description: 'Message to display. Use $ctx.key for substitution.' },
    },
    required: [],
  },
}

type TabId = 'general' | 'input' | 'settings' | 'output'

const TAB_MANIFEST: Record<NodeTypeId, TabId[]> = {
  [NodeTypeId.Tool]:        ['general', 'input', 'settings', 'output'],
  [NodeTypeId.Prompt]:      ['general', 'input', 'settings'],
  [NodeTypeId.Structured]:  ['general', 'input', 'settings'],
  [NodeTypeId.Parameters]:  ['general', 'input'],
  [NodeTypeId.Decide]:      ['general', 'input', 'settings', 'output'],
  [NodeTypeId.SetWorkdir]:  ['general', 'input'],
  [NodeTypeId.ForEach]:     ['general', 'input', 'output'],
  [NodeTypeId.RunWorkflow]: ['general', 'input', 'output'],
  [NodeTypeId.ConfigureSession]: ['general', 'input'],
  [NodeTypeId.Variable]:    ['general', 'input', 'output'],
  [NodeTypeId.Output]:      ['general', 'input'],
}

const TAB_LABELS: Record<TabId, string> = {
  general:  'General',
  input:    'Input',
  settings: 'Settings',
  output:   'Output',
}

const DECIDE_OPS = [
  { value: 'equals', label: '= equals' },
  { value: 'not_equals', label: '≠ not equals' },
  { value: 'contains', label: '⊃ contains' },
  { value: 'gt', label: '> greater than' },
  { value: 'gte', label: '≥ greater or equal' },
  { value: 'lt', label: '< less than' },
  { value: 'lte', label: '≤ less or equal' },
] as const

const PARAM_TYPES: JsonSchemaType[] = ['string', 'number', 'integer', 'boolean', 'object', 'array']

export type DrawerFormData = {
  name?: string
  description?: string
  label?: string
  action_id?: string
  parameters?: Record<string, unknown>
  agentArgs?: string[]
  inputs?: import('@/components/react-flow/unified-node').ParameterSchema[]
  instructions?: string
  nodeType?: NodeType
  type?: string
  workflowParameters?: WorkflowParameter[]
  outputSchema?: Record<string, unknown>
  edgeLabel?: string
  model?: NodeModel
  retry?: { maxAttempts: number; delaySeconds: number }
}

interface WorkflowEditDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editType: EditType
  data?: {
    name?: string
    description?: string
    node?: Node<WorkflowNodeData>
    edge?: Edge
  }
  onSave: (data: DrawerFormData) => void
  onDelete?: () => void
  isSaving?: boolean
  showMiniMap?: boolean
  setShowMiniMap?: (show: boolean) => void
  availableRefs?: RefSuggestion[]
  sourceDecideCases?: Array<{ label: string }>
  currentWorkflowId?: string
  onOpenForEachCanvas?: () => void
  onEditWorkflow?: (workflowId: string) => void
}

function ToolComboboxItem({ schema, showMcp }: { schema: ToolSchema; showMcp?: boolean }) {
  return (
    <ComboboxItem value={schema.id}>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-mono text-xs">{schema.id}</span>
        {schema.description && (
          <span className="text-xs text-muted-foreground truncate max-w-[280px]">{schema.description}</span>
        )}
      </div>
      {showMcp && (
        <Badge variant="secondary" className="ml-2 text-xs shrink-0">MCP</Badge>
      )}
    </ComboboxItem>
  )
}

function EnumTagInput({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  function add(raw: string) {
    const v = raw.trim()
    if (!v || values.includes(v)) { setDraft(''); return }
    onChange([...values, v])
    setDraft('')
  }

  return (
    <div
      className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs transition-colors focus-within:ring-1 focus-within:ring-ring cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium">
          {v}
          <X className="size-2.5 cursor-pointer opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onChange(values.filter((_, j) => j !== i)) }} />
        </span>
      ))}
      <input
        ref={inputRef}
        className="flex-1 min-w-[80px] bg-transparent outline-none font-mono text-xs placeholder:text-muted-foreground"
        placeholder={values.length === 0 ? 'Type a value, press Enter…' : 'Add another…'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) }
          else if (e.key === 'Backspace' && draft === '' && values.length > 0) onChange(values.slice(0, -1))
        }}
        onBlur={() => { if (draft.trim()) add(draft) }}
      />
    </div>
  )
}

export function WorkflowEditDrawer({
  open,
  onOpenChange,
  editType,
  data,
  onSave,
  onDelete,
  isSaving = false,
  showMiniMap = false,
  setShowMiniMap,
  availableRefs = [],
  sourceDecideCases,
  currentWorkflowId,
  onOpenForEachCanvas,
  onEditWorkflow,
}: WorkflowEditDrawerProps) {
  const [formData, setFormData] = React.useState<DrawerFormData>({})
  const [editingNodeData, setEditingNodeData] = React.useState<UnifiedNodeData | null>(null)
  const [activeTab, setActiveTab] = React.useState('general')
  const [toolSearch, setToolSearch] = React.useState('')
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragY, setDragY] = React.useState(0)
  const [dragStartY, setDragStartY] = React.useState(0)
  React.useEffect(() => {
    if (!open) {
      setDragY(0)
      setIsDragging(false)
    }
  }, [open])
  const { schemas, loading: loadingSchemas } = useToolSchemas()
  const allWorkflows = useWorkflowList()
  const availableWorkflows = currentWorkflowId
    ? allWorkflows.filter((w) => w.id !== currentWorkflowId)
    : allWorkflows
  const agentList = useAgentList()

  // Tracked separately so useWorkflowParams always has a stable hook call
  const runWorkflowId = editingNodeData?.nodeType === NodeTypeId.RunWorkflow
    ? ((editingNodeData.node.parameters ?? {}) as Record<string, unknown>).workflowId as string ?? ''
    : ''
  const { wfParams, loading: loadingWfParams } = useWorkflowParams(runWorkflowId)

  React.useEffect(() => {
    if (open && data) {
      setActiveTab('general')
      if (editType === 'workflow') {
        setFormData({
          name: data.name || '',
          description: data.description || '',
        })
        setEditingNodeData(null)
      } else if (editType === 'node' && data.node) {
        const nodeData = data.node.data as UnifiedNodeData
        setEditingNodeData(nodeData)
        setFormData({
          label: nodeData.node.label || '',
          action_id: nodeData.node.action_id || '',
          parameters: nodeData.node.parameters || {},
          nodeType: nodeData.nodeType,
          model: nodeData.model,
        })
      } else if (editType === 'edge' && data.edge) {
        setFormData({
          type: data.edge.type || 'animated',
          edgeLabel: typeof data.edge.label === 'string' ? data.edge.label : undefined,
        })
        setEditingNodeData(null)
      }
    }
  }, [open, data, editType])

  const handleSave = () => {
    if (editType === 'node' && editingNodeData) {
      onSave({
        ...formData,
        label: editingNodeData.node.label,
        action_id: editingNodeData.node.action_id,
        parameters: editingNodeData.node.parameters,
        agentArgs: editingNodeData.agentArgs ?? [],
        inputs: editingNodeData.data.inputs,
        instructions: editingNodeData.instructions as string | undefined,
        nodeType: editingNodeData.nodeType,
        workflowParameters: editingNodeData.workflowParameters,
        outputSchema: editingNodeData._schemaProps !== undefined
          ? schemaPropsToJsonSchema(editingNodeData._schemaProps as SchemaProp[])
          : (editingNodeData.outputSchema as Record<string, unknown> | undefined),
        model: formData.model,
        retry: editingNodeData.node.retry,
      })
    } else {
      onSave(formData)
    }
  }

  const getAvailableTabs = (): Array<{ value: string; label: string }> => {
    if (editType === 'node' && editingNodeData?.nodeType) {
      const tabIds = TAB_MANIFEST[editingNodeData.nodeType as NodeTypeId] ?? ['general']
      return tabIds.map((id) => ({ value: id, label: TAB_LABELS[id] }))
    }
    return [{ value: 'general', label: 'General' }]
  }

  const renderNodeIdentity = () => {
    const node = data?.node
    if (!node) return <span className="font-semibold text-sm">Node</span>

    const nodeData = node.data as UnifiedNodeData
    const nodeType = resolveNodeType(nodeData)
    const metadata = getNodeTypeMetadata(nodeType)
    const Icon = metadata.icon

    return (
      <>
        <Icon className="h-5 w-5 text-muted-foreground" />
        <span className="font-semibold text-sm">{metadata.label}</span>
      </>
    )
  }

  const renderTabContent = () => {
    switch (editType) {
      case 'workflow':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-name">Name</Label>
              <Input
                id="workflow-name"
                placeholder="My Workflow"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflow-description">Description</Label>
              <Textarea
                id="workflow-description"
                placeholder="A brief description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
        )

      case 'node': {
        if (!editingNodeData) return null

        const nodeType = editingNodeData.nodeType ?? NodeTypeId.Tool

        const handleNodeChange = (updates: Partial<UnifiedNodeData['node']>) => {
          const updated = { ...editingNodeData, node: { ...editingNodeData.node, ...updates } }
          setEditingNodeData(updated)
          setFormData((prev) => ({ ...prev, label: updated.node.label, action_id: updated.node.action_id }))
        }

        const selectedSchema = schemas.find((s) => s.id === editingNodeData.node.action_id)

        // ── General ─────────────────────────────────────────────────────────────
        if (activeTab === 'general') {
          if (nodeType === NodeTypeId.Tool) {
            const q = toolSearch.toLowerCase()
            const visibleSchemas = schemas
              .filter((s) => !HIDDEN_TOOLS.has(s.id))
              .filter((s) => !q || s.id.includes(q) || s.description?.toLowerCase().includes(q))
            const internalSchemas = visibleSchemas.filter((s) => s.source !== 'mcp')
            const mcpSchemas = visibleSchemas.filter((s) => s.source === 'mcp')
            const grouped = TOOL_GROUP_ORDER.map((groupId) => ({
              groupId,
              label: TOOL_GROUP_LABELS[groupId],
              tools: internalSchemas.filter((s) => getToolGroup(s.id) === groupId),
            })).filter((g) => g.tools.length > 0)
            const mcpServers = Array.from(new Set(mcpSchemas.map((s) => s.mcpServer ?? 'MCP')))

            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tool</Label>
                  <Combobox
                    value={editingNodeData.node.action_id ?? null}
                    onValueChange={(toolId) => {
                      handleNodeChange({ action_id: toolId ?? undefined, label: editingNodeData.node.label || toolId || '', parameters: {} })
                      if (toolId) setActiveTab('input')
                    }}
                    onInputValueChange={(v) => setToolSearch(v)}
                  >
                    <ComboboxInput
                      placeholder={loadingSchemas ? 'Loading tools…' : 'Search tools…'}
                      disabled={loadingSchemas}
                      showClear
                      className="font-mono text-xs"
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>No tools found.</ComboboxEmpty>
                      <ComboboxList>
                        {grouped.map(({ groupId, label, tools }) => (
                          <ComboboxGroup key={groupId}>
                            <ComboboxLabel>{label}</ComboboxLabel>
                            {tools.map((s) => <ToolComboboxItem key={s.id} schema={s} />)}
                          </ComboboxGroup>
                        ))}
                        {mcpServers.map((server) => (
                          <ComboboxGroup key={`mcp:${server}`}>
                            <ComboboxLabel>{server}</ComboboxLabel>
                            {mcpSchemas.filter((s) => (s.mcpServer ?? 'MCP') === server).map((s) => (
                              <ToolComboboxItem key={s.id} schema={s} showMcp />
                            ))}
                          </ComboboxGroup>
                        ))}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  {(selectedSchema?.description ?? BUILTIN_SCHEMAS[editingNodeData.node.action_id ?? '']?.description) && (
                    <p className="text-xs text-muted-foreground">
                      {selectedSchema?.description ?? BUILTIN_SCHEMAS[editingNodeData.node.action_id ?? '']?.description}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="node-label">Label</Label>
                  <Input id="node-label" value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="Node label" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="node-description">Description</Label>
                  <Textarea id="node-description" value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="What does this step do?" rows={2} />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Prompt) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt-label">Label</Label>
                  <Input id="prompt-label" value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="Step label" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prompt-description">Description</Label>
                  <Textarea id="prompt-description" value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="What does this step do?" rows={2} />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Parameters) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="params-label">Label</Label>
                  <Input id="params-label" value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="Parameters" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="params-description">Description</Label>
                  <Textarea id="params-description" value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="What are these parameters for?" rows={2} />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Decide) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const mode = (params.mode as string) ?? 'agent'
            const updateDecideParams = (updates: Record<string, unknown>) => {
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...params, ...updates } } })
            }
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="Decide" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="What decision is this node making?" rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={mode} onValueChange={(v) => updateDecideParams({ mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent — LLM picks the branch</SelectItem>
                      <SelectItem value="deterministic">Deterministic — evaluate a condition</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.SetWorkdir) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="setworkdir-label">Label</Label>
                  <Input id="setworkdir-label" value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="Set Working Directory" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setworkdir-description">Description</Label>
                  <Textarea id="setworkdir-description" value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="Why is the working directory being changed here?" rows={2} />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.ConfigureSession) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="configsession-label">Label</Label>
                  <Input id="configsession-label" value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="Configure Session" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="configsession-description">Description</Label>
                  <Textarea id="configsession-description" value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="Why is the session being reconfigured here?" rows={2} />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.ForEach) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="foreach-label">Label</Label>
                  <Input id="foreach-label" value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="For Each" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="foreach-description">Description</Label>
                  <Textarea id="foreach-description" value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="What is this loop doing?" rows={2} />
                </div>
                {onOpenForEachCanvas && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 justify-center"
                    onClick={() => { handleSave(); onOpenForEachCanvas() }}
                  >
                    <LayoutGrid className="size-3.5" />
                    Open Canvas
                  </Button>
                )}
              </div>
            )
          }

          if (nodeType === NodeTypeId.Variable) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="variable-label">Label</Label>
                  <Input id="variable-label" value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="Variable" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="variable-description">Description</Label>
                  <Textarea id="variable-description" value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="What values does this node define?" rows={2} />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Output) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="output-label">Label</Label>
                  <Input id="output-label" value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="Output" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="output-description">Description</Label>
                  <Textarea id="output-description" value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="Describe what this workflow returns" rows={2} />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.RunWorkflow) {
            const rwParams = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const rwWorkflowId = (rwParams.workflowId as string) ?? ''
            const WORKFLOW_RUN_KEYS = new Set(['workflowId', 'wait', 'output'])
            const updateRwParams = (updates: Record<string, unknown>) =>
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...rwParams, ...updates } } })
            const handleWorkflowSelect = (id: string | null) => {
              // Clear per-param values when the workflow changes
              const cleaned: Record<string, unknown> = {}
              for (const k of WORKFLOW_RUN_KEYS) if (rwParams[k] !== undefined) cleaned[k] = rwParams[k]
              cleaned.workflowId = id ?? ''
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: cleaned } })
            }
            const selectedWorkflow = availableWorkflows.find((w) => w.id === rwWorkflowId)
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Workflow</Label>
                  <div className="flex gap-1.5">
                  <Combobox
                    value={rwWorkflowId || null}
                    onValueChange={handleWorkflowSelect}
                  >
                    <ComboboxInput
                      placeholder={availableWorkflows.length === 0 ? 'Loading workflows…' : 'Search workflows…'}
                      showClear
                      className="font-mono text-xs"
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>No workflows found.</ComboboxEmpty>
                      <ComboboxList>
                        <ComboboxGroup>
                          <ComboboxLabel>Available Workflows</ComboboxLabel>
                          {availableWorkflows.map((wf) => (
                            <ComboboxItem key={wf.id} value={wf.id}>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="font-mono text-xs">{wf.id}</span>
                                {wf.name && wf.name !== wf.id && (
                                  <span className="text-xs text-muted-foreground truncate">{wf.name}</span>
                                )}
                              </div>
                            </ComboboxItem>
                          ))}
                        </ComboboxGroup>
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  {onEditWorkflow && rwWorkflowId && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Open this workflow in the editor"
                      onClick={() => onEditWorkflow(rwWorkflowId)}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  )}
                  </div>
                  {selectedWorkflow?.description && (
                    <p className="text-xs text-muted-foreground">{selectedWorkflow.description}</p>
                  )}
                  {!rwWorkflowId && (
                    <p className="text-xs text-amber-500">Required — select the workflow to call.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rw-label">Label</Label>
                  <Input id="rw-label" value={editingNodeData.node.label || ''} onChange={(e) => handleNodeChange({ label: e.target.value })} placeholder="Run Workflow" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rw-description">Description</Label>
                  <Textarea id="rw-description" value={editingNodeData.node.description || ''} onChange={(e) => handleNodeChange({ description: e.target.value })} placeholder="Why is this sub-workflow being called here?" rows={2} />
                </div>
              </div>
            )
          }

          return null
        }

        // ── Input ────────────────────────────────────────────────────────────────
        if (activeTab === 'input') {
          if (nodeType === NodeTypeId.Tool) {
            const actionId = editingNodeData.node.action_id ?? ''
            const builtin = BUILTIN_SCHEMAS[actionId]
            const properties = selectedSchema?.inputSchema?.properties ?? builtin?.properties ?? {}
            const required = selectedSchema?.inputSchema?.required ?? builtin?.required ?? []
            const description = selectedSchema?.description ?? builtin?.description
            const parameters = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const hasSchema = !!(selectedSchema || builtin)

            return (
              <div className="space-y-4">
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
                {!hasSchema ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Select a tool in the General tab to configure its inputs.</p>
                ) : (
                  <ToolParameterForm
                    properties={properties}
                    required={required}
                    values={parameters}
                    agentArgs={editingNodeData.agentArgs ?? []}
                    availableRefs={availableRefs}
                    onChange={(updated) => setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: updated } })}
                    onAgentArgsChange={(updated) => setEditingNodeData({ ...editingNodeData, agentArgs: updated })}
                  />
                )}
              </div>
            )
          }

          if (nodeType === NodeTypeId.Prompt) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Prompt</Label>
                  <PromptInput
                    value={(editingNodeData.instructions as string) || ''}
                    onChange={(v) => setEditingNodeData({ ...editingNodeData, instructions: v })}
                    suggestions={availableRefs ?? []}
                    placeholder={'Message to send to the agent.\nType $ to insert a reference — e.g. $input.color or $output.decide'}
                    rows={8}
                  />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Structured) {
            return (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <PromptInput
                    value={(editingNodeData.instructions as string) || ''}
                    onChange={(v) => setEditingNodeData({ ...editingNodeData, instructions: v })}
                    suggestions={availableRefs ?? []}
                    placeholder={'Describe what to analyze and structure.\nType $ to insert a reference — e.g. $input.text or $generate_colors.colours'}
                    rows={6}
                  />
                </div>
                <div className="space-y-2">
                  <div>
                    <Label>Output schema</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Define the JSON shape the agent must return. Fields are referenced as <code className="font-mono">${'$'}{(editingNodeData.node as any).key || 'node_key'}.<i>field</i></code>.
                    </p>
                  </div>
                  {(() => {
                    const rawSchema = editingNodeData.outputSchema as Record<string, unknown> | undefined
                    if (rawSchema && rawSchema.type !== 'object' && !(editingNodeData._schemaProps as SchemaProp[] | undefined)) {
                      return (
                        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                          Schema root type is <code className="font-mono">{String(rawSchema.type)}</code> — the builder only supports object roots. Add a field to reset to a compatible schema.
                        </p>
                      )
                    }
                    return null
                  })()}
                  <SchemaBuilder
                    props={
                      (editingNodeData._schemaProps as SchemaProp[] | undefined) ??
                      jsonSchemaToProps((editingNodeData.outputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} })
                    }
                    onChange={(props) => setEditingNodeData({ ...editingNodeData, _schemaProps: props })}
                  />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Parameters) {
            const params = (editingNodeData.workflowParameters ?? []) as WorkflowParameter[]
            const updateWfParams = (updated: WorkflowParameter[]) => setEditingNodeData({ ...editingNodeData, workflowParameters: updated })

            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Workflow parameters</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Visible to triggers and the LLM as <code className="font-mono">$input.*</code></p>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-xs shrink-0"
                      onClick={() => updateWfParams([...params, { name: '', type: 'string', description: '', required: true }])}>
                      <Plus className="h-3 w-3 mr-1" />Add
                    </Button>
                  </div>
                  {params.length === 0 && (
                    <p className="text-xs text-muted-foreground py-3 text-center">No parameters yet. Add one to define what this workflow accepts.</p>
                  )}
                  <div className="space-y-2">
                    {params.map((param, i) => (
                      <div key={i} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Input value={param.name} onChange={(e) => { const u = [...params]; u[i] = { ...u[i], name: e.target.value }; updateWfParams(u) }} placeholder="name" className="font-mono text-xs flex-1" />
                          <Select value={param.type ?? 'string'} onValueChange={(v) => { const u = [...params]; u[i] = { ...u[i], type: v as JsonSchemaType }; updateWfParams(u) }}>
                            <SelectTrigger className="w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{PARAM_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs font-mono">{t}</SelectItem>)}</SelectContent>
                          </Select>
                          <Switch checked={param.required !== false} onCheckedChange={(checked) => { const u = [...params]; u[i] = { ...u[i], required: checked }; updateWfParams(u) }} className="scale-75 origin-right" title="Required" />
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => updateWfParams(params.filter((_, j) => j !== i))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Textarea value={param.description} onChange={(e) => { const u = [...params]; u[i] = { ...u[i], description: e.target.value }; updateWfParams(u) }} placeholder="Description — shown to the LLM when this workflow runs" rows={2} className="text-xs resize-none" />
                        {(['string', 'number', 'integer'] as const).includes((param.type ?? 'string') as 'string' | 'number' | 'integer') && (
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Allowed values <span className="opacity-60">(empty = accept any)</span></span>
                            <EnumTagInput
                              values={param.enum ?? []}
                              onChange={(next) => { const u = [...params]; u[i] = { ...u[i], enum: next.length > 0 ? next : undefined }; updateWfParams(u) }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Decide) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const mode = (params.mode as string) ?? 'agent'
            const inputExpr = (params.input as string) ?? ''
            const updateDecideParams = (updates: Record<string, unknown>) => {
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...params, ...updates } } })
            }

            if (mode === 'agent') {
              return (
                <div className="py-6 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">The agent reads available context and picks a branch.</p>
                  <p className="text-xs text-muted-foreground">Switch to <strong>Deterministic</strong> mode in General if you want to evaluate an expression instead.</p>
                </div>
              )
            }

            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Input expression</Label>
                  <ExpressionInput
                    value={inputExpr}
                    onChange={(v) => updateDecideParams({ input: v || undefined })}
                    suggestions={availableRefs}
                    placeholder="$input.color"
                  />
                  {!inputExpr && (
                    <p className="text-xs text-amber-500">Required — without this the workflow will error at runtime. Type <code className="font-mono">$</code> to pick from upstream outputs.</p>
                  )}
                  {inputExpr && (
                    <p className="text-xs text-muted-foreground">Resolved value is compared against each condition in the Settings tab.</p>
                  )}
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.SetWorkdir) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const pathVal = (params.path as string) ?? ''
            const outputKey = (params.output as string) ?? ''
            const updateParams = (updates: Record<string, unknown>) => {
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...params, ...updates } } })
            }
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Path</Label>
                  <ExpressionInput
                    value={pathVal}
                    onChange={(v) => updateParams({ path: v || undefined })}
                    suggestions={availableRefs}
                    placeholder="$ctx.project_directory"
                  />
                  {!pathVal && (
                    <p className="text-xs text-amber-500">Required — the directory to set. Type <code className="font-mono">$</code> to reference an upstream value.</p>
                  )}
                  {pathVal && (
                    <p className="text-xs text-muted-foreground">Session working directory will be updated to this path. All subsequent nodes inherit it.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Output key <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    value={outputKey}
                    onChange={(e) => updateParams({ output: e.target.value || undefined })}
                    placeholder="e.g. workdir"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">If set, the resolved path is also stored as <code className="font-mono">$ctx.&lt;key&gt;</code> for downstream reference.</p>
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.ConfigureSession) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const model = (params.model as NodeModel | null | undefined) ?? undefined
            const cwdVal = (params.cwd as string) ?? ''
            const titleVal = (params.title as string) ?? ''
            const agentIDVal = (params.agentID as string) ?? ''
            const systemPromptVal = (params.systemPrompt as string) ?? ''
            const pathVal = (params.path as string) ?? ''
            const readPathVal = (params.readPath as string) ?? ''
            const updateParams = (updates: Record<string, unknown>) => {
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...params, ...updates } } })
            }
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Model</Label>
                  <ModelPicker value={model} onChange={(m) => updateParams({ model: m ?? null })} />
                  <p className="text-xs text-muted-foreground">Sets the session&apos;s active model from this node forward. Subsequent nodes inherit it until changed again or reset to &quot;Agent default&quot;.</p>
                </div>
                <div className="space-y-2">
                  <Label>Working directory <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <ExpressionInput value={cwdVal} onChange={(v) => updateParams({ cwd: v || undefined })} suggestions={availableRefs} placeholder="$ctx.project_directory" />
                </div>
                <div className="space-y-2">
                  <Label>Session title <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={titleVal} onChange={(e) => updateParams({ title: e.target.value || undefined })} placeholder="Leave blank to keep current title" />
                </div>
                <div className="space-y-2">
                  <Label>Agent <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Combobox
                    value={agentIDVal || null}
                    onValueChange={(id) => updateParams({ agentID: id ?? undefined })}
                  >
                    <ComboboxInput placeholder="Keep current agent…" showClear />
                    <ComboboxContent>
                      <ComboboxEmpty>No agents found.</ComboboxEmpty>
                      <ComboboxList>
                        {agentList.map((a) => (
                          <ComboboxItem key={a.id ?? a.name} value={a.id ?? a.name}>{a.name}</ComboboxItem>
                        ))}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>
                <div className="space-y-2">
                  <Label>System prompt <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea value={systemPromptVal} onChange={(e) => updateParams({ systemPrompt: e.target.value || undefined })} placeholder="Leave blank to keep current system prompt" rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Write path boundary <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <ExpressionInput value={pathVal} onChange={(v) => updateParams({ path: v || undefined })} suggestions={availableRefs} placeholder="$ctx.write_path" />
                </div>
                <div className="space-y-2">
                  <Label>Read path boundary <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <ExpressionInput value={readPathVal} onChange={(v) => updateParams({ readPath: v || undefined })} suggestions={availableRefs} placeholder="$ctx.read_path" />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.ForEach) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const itemsMode = (params.itemsMode as string) ?? 'reference'
            const itemsVal = (params.items as string) ?? ''
            const inlineItems = (Array.isArray(params.itemsList) ? params.itemsList : []) as string[]
            const itemVar = (params.item_variable as string) ?? 'item'
            const collectVal = (params.collect as string) ?? ''
            const outputKey = (params.output as string) ?? 'results'
            const updateParams = (updates: Record<string, unknown>) => {
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...params, ...updates } } })
            }
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Items source</Label>
                  <Select value={itemsMode} onValueChange={(v) => updateParams({ itemsMode: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reference">From reference</SelectItem>
                      <SelectItem value="inline">Inline list</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {itemsMode === 'inline' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Items</Label>
                      <Button variant="outline" size="sm" className="h-7 text-xs"
                        onClick={() => updateParams({ itemsList: [...inlineItems, ''] })}>
                        <Plus className="h-3 w-3 mr-1" />Add item
                      </Button>
                    </div>
                    {inlineItems.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">No items yet. Add items below — each one can reference upstream outputs using <code className="font-mono">$nodeKey.field</code>.</p>
                    )}
                    <div className="space-y-2">
                      {inlineItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="flex-1">
                            <ExpressionInput
                              value={item}
                              onChange={(v) => {
                                const updated = [...inlineItems]
                                updated[idx] = v ?? ''
                                updateParams({ itemsList: updated })
                              }}
                              suggestions={availableRefs}
                              placeholder={`Item ${idx + 1} — use $nodeKey.field for dynamic values`}
                            />
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => updateParams({ itemsList: inlineItems.filter((_, i) => i !== idx) })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Each item runs one loop iteration. Use <code className="font-mono">$nodeKey.field</code> to embed dynamic values from earlier nodes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Items array</Label>
                    <ExpressionInput
                      value={itemsVal}
                      onChange={(v) => updateParams({ items: v || undefined })}
                      suggestions={availableRefs}
                      placeholder="$ctx.my_array"
                    />
                    <p className="text-xs text-muted-foreground">
                      Reference an upstream array. String elements may contain <code className="font-mono">$ref</code> expressions resolved at runtime.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Item variable name</Label>
                  <Input
                    value={itemVar}
                    onChange={(e) => updateParams({ item_variable: e.target.value || 'item' })}
                    placeholder="item"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Each element is injected as <code className="font-mono">$ctx.{itemVar || 'item'}</code> inside the loop body.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Collect key <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    value={collectVal}
                    onChange={(e) => updateParams({ collect: e.target.value || undefined })}
                    placeholder="e.g. result"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    After each iteration, read <code className="font-mono">$ctx.{collectVal || '<collect>'}</code> and append it to the results array. Leave blank to collect the item itself as a passthrough.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Output key</Label>
                  <Input
                    value={outputKey}
                    onChange={(e) => updateParams({ output: e.target.value || 'results' })}
                    placeholder="results"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    The collected results array is stored as <code className="font-mono">$ctx.{outputKey || 'results'}</code> for downstream nodes.
                  </p>
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Output) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const fields = (params.fields ?? {}) as Record<string, string>
            const fieldEntries = Object.entries(fields)
            const updateFields = (updated: Record<string, string>) =>
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...params, fields: updated } } })

            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Output fields</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Each field becomes a key in the returned <code className="font-mono">result</code> object.</p>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-xs shrink-0"
                      onClick={() => {
                        const key = `field_${fieldEntries.length + 1}`
                        updateFields({ ...fields, [key]: '' })
                      }}>
                      <Plus className="h-3 w-3 mr-1" />Add
                    </Button>
                  </div>
                  {fieldEntries.length === 0 && (
                    <p className="text-xs text-muted-foreground py-3 text-center">No fields yet. Add one to declare the workflow&apos;s return value.</p>
                  )}
                  <div className="space-y-2">
                    {fieldEntries.map(([key, val], i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={key}
                          onChange={(e) => {
                            const newKey = e.target.value
                            const entries = fieldEntries.map(([k, v]) => [k, v] as [string, string])
                            entries[i] = [newKey, val]
                            updateFields(Object.fromEntries(entries))
                          }}
                          placeholder="field name"
                          className="font-mono text-xs w-32 shrink-0"
                        />
                        <ExpressionInput
                          value={val}
                          onChange={(v) => updateFields({ ...fields, [key]: v })}
                          suggestions={availableRefs}
                          placeholder={`$nodeKey.field`}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const updated = { ...fields }
                            delete updated[key]
                            updateFields(updated)
                          }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Variable) {
            type VarEntry = { name: string; type: string; value: string; items: string[]; updateMode: string }
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const variables = (Array.isArray(params.variables) ? params.variables : []) as VarEntry[]

            const setVariables = (updated: VarEntry[]) =>
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...params, variables: updated } } })

            const updateEntry = (i: number, patch: Partial<VarEntry>) => {
              const next = variables.map((v, idx) => idx === i ? { ...v, ...patch } : v)
              setVariables(next)
            }

            const VAR_TYPES = ['string', 'number', 'boolean', 'array'] as const

            return (
              <div className="space-y-3">
                {variables.length === 0 && (
                  <p className="text-xs text-muted-foreground py-3 text-center">No variables yet. Add one below.</p>
                )}

                {variables.map((entry, i) => (
                  <div key={i} className="border rounded-md p-3 space-y-3">
                    {/* Header row: name + type + remove */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={entry.name}
                        onChange={(e) => updateEntry(i, { name: e.target.value })}
                        placeholder="variable name"
                        className="font-mono text-xs flex-1"
                      />
                      <Select
                        value={entry.type ?? 'string'}
                        onValueChange={(v) => updateEntry(i, { type: v })}
                      >
                        <SelectTrigger className="w-28 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VAR_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs font-mono">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setVariables(variables.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Value / items */}
                    {(entry.type ?? 'string') === 'array' ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Items</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => updateEntry(i, { items: [...(entry.items ?? []), ''] })}
                          >
                            <Plus className="h-3 w-3 mr-1" />Add item
                          </Button>
                        </div>
                        {(entry.items ?? []).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-1">No items yet.</p>
                        )}
                        {(entry.items ?? []).map((item, j) => (
                          <div key={j} className="flex items-center gap-1.5">
                            <ExpressionInput
                              value={item}
                              onChange={(v) => {
                                const next = [...(entry.items ?? [])]
                                next[j] = v
                                updateEntry(i, { items: next })
                              }}
                              suggestions={availableRefs}
                              placeholder="value or $nodeKey.field"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => updateEntry(i, { items: (entry.items ?? []).filter((_, k) => k !== j) })}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Value</span>
                        <ExpressionInput
                          value={entry.value ?? ''}
                          onChange={(v) => updateEntry(i, { value: v })}
                          suggestions={availableRefs}
                          placeholder="value or $nodeKey.field"
                        />
                      </div>
                    )}

                    {/* Update mode */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">Update</span>
                      <Select
                        value={entry.updateMode ?? 'replace'}
                        onValueChange={(v) => updateEntry(i, { updateMode: v })}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="replace" className="text-xs">Replace</SelectItem>
                          <SelectItem value="append" className="text-xs">Append (arrays)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setVariables([...variables, { name: '', type: 'string', value: '', items: [], updateMode: 'replace' }])}
                >
                  <Plus className="h-3 w-3 mr-1.5" />Add variable
                </Button>
              </div>
            )
          }

          if (nodeType === NodeTypeId.RunWorkflow) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const workflowId = (params.workflowId as string) ?? ''
            const outputKey = (params.output as string) ?? 'workflow_result'
            const updateParams = (updates: Record<string, unknown>) =>
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...params, ...updates } } })

            if (!workflowId) {
              return (
                <div className="py-6 text-center">
                  <p className="text-xs text-muted-foreground">Select a workflow in the General tab to configure its inputs.</p>
                </div>
              )
            }

            if (loadingWfParams) {
              return (
                <div className="py-6 text-center">
                  <p className="text-xs text-muted-foreground">Loading workflow parameters…</p>
                </div>
              )
            }

            return (
              <div className="space-y-4">
                {wfParams.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    This workflow declares no input parameters.
                  </p>
                ) : (
                  wfParams.map((p) => (
                    <div key={p.name} className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label className="font-mono text-xs">{p.name}</Label>
                        {p.required !== false && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">required</Badge>
                        )}
                        {p.type && p.type !== 'string' && (
                          <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">{p.type}</Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground">{p.description}</p>
                      )}
                      {p.enum && p.enum.length > 0 ? (
                        <Select
                          value={(params[p.name] as string) ?? ''}
                          onValueChange={(v) => updateParams({ [p.name]: v })}
                        >
                          <SelectTrigger className="h-8 text-xs font-mono"><SelectValue placeholder="Select a value…" /></SelectTrigger>
                          <SelectContent>
                            {p.enum.map((v) => (
                              <SelectItem key={v} value={v} className="font-mono text-xs">{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <ExpressionInput
                          value={(params[p.name] as string) ?? ''}
                          onChange={(v) => updateParams({ [p.name]: v })}
                          suggestions={availableRefs}
                          placeholder={`$ctx.${p.name}`}
                        />
                      )}
                    </div>
                  ))
                )}
                <Separator />
                <div className="space-y-1.5">
                  <Label>Output key</Label>
                  <Input
                    value={outputKey}
                    onChange={(e) => updateParams({ output: e.target.value || 'workflow_result' })}
                    placeholder="workflow_result"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Completion summary stored as <code className="font-mono">$ctx.{outputKey || 'workflow_result'}</code>.
                  </p>
                </div>
              </div>
            )
          }

          return null
        }

        // ── Settings ─────────────────────────────────────────────────────────────
        if (activeTab === 'settings') {
          if (nodeType === NodeTypeId.Tool) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="node-exec-mode">Execution Mode</Label>
                  <Select value={editingNodeData.node.execution_mode || 'automatic'} onValueChange={(v) => handleNodeChange({ execution_mode: v as 'automatic' | 'manual' })}>
                    <SelectTrigger id="node-exec-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatic">Automatic</SelectItem>
                      <SelectItem value="manual">Manual (User Approval)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Retry on Failure</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically retry this step if it fails. Set Max Retries to 0 to disable.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="retry-max" className="text-xs">Max retries</Label>
                      <Input
                        id="retry-max"
                        type="number"
                        min={0}
                        max={10}
                        value={editingNodeData.node.retry?.maxAttempts ?? 0}
                        onChange={(e) => handleNodeChange({
                          retry: { maxAttempts: Number(e.target.value), delaySeconds: editingNodeData.node.retry?.delaySeconds ?? 0 }
                        })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="retry-delay" className="text-xs">Delay (seconds)</Label>
                      <Input
                        id="retry-delay"
                        type="number"
                        min={0}
                        value={editingNodeData.node.retry?.delaySeconds ?? 0}
                        onChange={(e) => handleNodeChange({
                          retry: { maxAttempts: editingNodeData.node.retry?.maxAttempts ?? 0, delaySeconds: Number(e.target.value) }
                        })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Prompt || nodeType === NodeTypeId.Structured) {
            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Cpu className="size-3.5" />
                    Model
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Override the agent&apos;s default model for this node only. Leave blank to inherit.
                  </p>
                  <ModelPicker
                    value={formData.model}
                    onChange={(m) => setFormData((prev) => ({ ...prev, model: m }))}
                  />
                </div>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Decide) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const mode = (params.mode as string) ?? 'agent'
            const cases = (params.cases as Array<{ label: string; when?: { op: string; value?: unknown } }>) ?? []
            const hasElse = !!(params.hasElse)
            const updateDecideParams = (updates: Record<string, unknown>) => {
              setEditingNodeData({ ...editingNodeData, node: { ...editingNodeData.node, parameters: { ...params, ...updates } } })
            }

            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Conditions</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">Each condition is a named branch. Connect an edge and assign it.</p>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-xs shrink-0"
                      onClick={() => {
                        const label = 'condition_' + (cases.length + 1)
                        const newCase = mode === 'deterministic' ? { label, when: { op: 'equals', value: label } } : { label }
                        updateDecideParams({ cases: [...cases, newCase] })
                      }}>
                      <Plus className="h-3 w-3 mr-1" />Add condition
                    </Button>
                  </div>

                  {cases.length === 0 && (
                    <div className="border border-dashed rounded-md py-4 text-center">
                      <p className="text-xs text-muted-foreground">No conditions yet — draw an edge from this node or add one above.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {cases.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={c.label}
                          onChange={(e) => {
                            const newLabel = e.target.value
                            const updated = [...cases]
                            const currentOp = updated[i].when?.op ?? 'equals'
                            updated[i] = { ...updated[i], label: newLabel, ...(mode === 'deterministic' && currentOp === 'equals' ? { when: { op: currentOp, value: newLabel } } : {}) }
                            updateDecideParams({ cases: updated })
                          }}
                          placeholder="condition name"
                          className="font-mono text-xs flex-1"
                        />
                        {mode === 'deterministic' && (
                          <>
                            <Select value={c.when?.op ?? 'equals'} onValueChange={(op) => { const u = [...cases]; u[i] = { ...u[i], when: { op, value: u[i].when?.value ?? '' } }; updateDecideParams({ cases: u }) }}>
                              <SelectTrigger className="w-36 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{DECIDE_OPS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Input
                              value={String(c.when?.value ?? '')}
                              onChange={(e) => { const op = c.when?.op ?? 'equals'; const u = [...cases]; u[i] = { ...u[i], when: { op, value: e.target.value } }; updateDecideParams({ cases: u }) }}
                              placeholder="value"
                              className="font-mono text-xs flex-1"
                            />
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => updateDecideParams({ cases: cases.filter((_, j) => j !== i) })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Include else branch</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Fallback when no condition matches</p>
                  </div>
                  <Switch checked={hasElse} onCheckedChange={(checked) => updateDecideParams(checked ? { hasElse: true, default: 'else' } : { hasElse: false, default: undefined })} />
                </div>

                {mode === 'agent' && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Cpu className="size-3.5" />
                        Model
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Override the model for this decision. A smaller, faster model is often sufficient.
                      </p>
                      <ModelPicker
                        value={formData.model}
                        onChange={(m) => setFormData((prev) => ({ ...prev, model: m }))}
                      />
                    </div>
                  </>
                )}
              </div>
            )
          }

          return null
        }

        // ── Output ───────────────────────────────────────────────────────────────
        if (activeTab === 'output') {
          if (nodeType === NodeTypeId.Tool) {
            const outputs = editingNodeData.data.outputs ?? []

            return (
              <div className="space-y-3">
                {outputs.length === 0 ? (
                  <div className="border border-dashed rounded-md py-6 text-center">
                    <p className="text-xs text-muted-foreground">No output schema defined for this tool.</p>
                    <p className="text-xs text-muted-foreground mt-1">Outputs become available as <code className="font-mono">$ctx.*</code> in downstream nodes.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {outputs.map((field, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
                        <span className="font-mono text-xs flex-1 truncate">{field.name}</span>
                        <Badge variant="secondary" className="font-mono text-xs shrink-0">{field.type}</Badge>
                        {field.description && (
                          <span className="text-xs text-muted-foreground truncate max-w-[160px]">{field.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          if (nodeType === NodeTypeId.Decide) {
            const label = editingNodeData.node.label || 'decide'
            const autoKey = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'decide'

            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
                  <span className="font-mono text-xs flex-1 text-foreground">${`output.${autoKey}`}</span>
                  <Badge variant="secondary" className="font-mono text-xs shrink-0">string</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  The chosen label is automatically stored here. Use <code className="font-mono">${`output.${autoKey}`}</code> in any downstream node.
                  Rename the node in General to change the key.
                </p>
              </div>
            )
          }

          if (nodeType === NodeTypeId.ForEach) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const outputKey = (params.output as string) || 'results'
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
                  <span className="font-mono text-xs flex-1 text-foreground">{`$ctx.${outputKey}`}</span>
                  <Badge variant="secondary" className="font-mono text-xs shrink-0">array</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  After all iterations complete, the collected results array is available as <code className="font-mono">{`$ctx.${outputKey}`}</code> for downstream nodes.
                  Change the key in the Input tab.
                </p>
              </div>
            )
          }

          if (nodeType === NodeTypeId.RunWorkflow) {
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const outputKey = (params.output as string) || 'workflow_result'
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
                  <span className="font-mono text-xs flex-1 text-foreground">{`$ctx.${outputKey}`}</span>
                  <Badge variant="secondary" className="font-mono text-xs shrink-0">string</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  The sub-workflow&apos;s completion summary is stored here. Use <code className="font-mono">{`$ctx.${outputKey}`}</code> in downstream nodes.
                  Change the key in the Input tab.
                </p>
              </div>
            )
          }

          if (nodeType === NodeTypeId.Variable) {
            const nodeKey = (editingNodeData.node as any).key as string | undefined
            const params = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
            const variables = (Array.isArray(params.variables) ? params.variables : []) as Array<{ name: string; type: string }>

            if (!nodeKey) {
              return (
                <div className="py-6 text-center">
                  <p className="text-xs text-muted-foreground">Save the node to see its reference key.</p>
                </div>
              )
            }

            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
                  <span className="font-mono text-xs flex-1 text-foreground">${nodeKey}</span>
                  <Badge variant="secondary" className="font-mono text-xs shrink-0">object</Badge>
                </div>
                {variables.filter((v) => v.name).length > 0 && (
                  <div className="space-y-1">
                    {variables.filter((v) => v.name).map((v) => (
                      <div key={v.name} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/20">
                        <span className="font-mono text-xs flex-1 text-foreground">${nodeKey}.{v.name}</span>
                        <Badge variant="outline" className="font-mono text-[10px] px-1 py-0 shrink-0">
                          {v.type ?? 'string'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Reference individual values as <code className="font-mono">${nodeKey}.&lt;name&gt;</code> in downstream nodes.
                  The full object is available as <code className="font-mono">${nodeKey}</code>.
                </p>
              </div>
            )
          }

          return null
        }

        return null
      }

      case 'edge':
        return (
          <div className="space-y-4">
            {formData.edgeLabel !== undefined && sourceDecideCases && (
              <div className="space-y-2">
                <Label>Branch</Label>
                <p className="text-xs text-muted-foreground">
                  Pick a case to route conditionally, or <code className="font-mono">result</code> to always fire and pass the decision value downstream.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sourceDecideCases.map((c) => (
                    <Button
                      key={c.label}
                      variant={formData.edgeLabel === c.label ? 'default' : 'outline'}
                      size="sm"
                      className="font-mono text-xs h-7"
                      onClick={() => setFormData({ ...formData, edgeLabel: c.label })}
                    >
                      {c.label}
                    </Button>
                  ))}
                  <Button
                    variant={formData.edgeLabel === 'else' ? 'default' : 'outline'}
                    size="sm"
                    className="font-mono text-xs h-7"
                    onClick={() => setFormData({ ...formData, edgeLabel: 'else' })}
                  >
                    else
                  </Button>
                  <Button
                    variant={formData.edgeLabel === 'result' ? 'default' : 'outline'}
                    size="sm"
                    className="font-mono text-xs h-7 text-muted-foreground"
                    onClick={() => setFormData({ ...formData, edgeLabel: 'result' })}
                  >
                    result
                  </Button>
                </div>
              </div>
            )}

            {formData.edgeLabel !== undefined && (!sourceDecideCases || sourceDecideCases.length === 0) && (
              <div className="space-y-2">
                <Label>Label</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">{formData.edgeLabel}</Badge>
                  <span className="text-xs text-muted-foreground">double-click to edit</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edge-type">Edge Type</Label>
              <Select
                value={formData.type || 'animated'}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="edge-type">
                  <SelectValue placeholder="Select edge type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="animated">Animated</SelectItem>
                  <SelectItem value="temporary">Dashed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true)
    setDragStartY(e.clientY - dragY)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    const newDragY = e.clientY - dragStartY
    if (newDragY >= 0) setDragY(newDragY)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false)
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    if (dragY > 100) {
      onOpenChange(false)
    } else {
      setDragY(0)
    }
  }

  return (
    <div
      className={cn(
        'absolute z-10 inset-x-0 bottom-0',
        open && cn(
          'bg-background flex h-auto flex-col border-t shadow-lg mt-24 max-h-[80vh] rounded-t-lg',
          !isDragging && 'transition-transform duration-500 ease-[0.32,0.72,0,1]'
        )
      )}
      style={open ? { transform: `translateY(${dragY}px)`, willChange: 'transform' } : undefined}
    >
      {/* Controls — attached above the container, always visible */}
      <div className="absolute -top-16 inset-x-0 flex justify-center z-[100] pointer-events-none">
        <div className="relative pointer-events-auto">
          {/* Zoom indicator bar — absolutely positioned above controls, exact same width */}
          <div className="absolute bottom-full left-0 right-0 mb-1 [&>*]:w-full">
            <WorkflowZoomBar />
          </div>
          <WorkflowControls
            orientation="horizontal"
            showInteractive={true}
            className="!static shadow-lg"
          >
            {setShowMiniMap && (
              <WorkflowControlButton
                onClick={() => setShowMiniMap(!showMiniMap)}
                title="Toggle Minimap"
              >
                <MapIcon className="h-4 w-4" />
              </WorkflowControlButton>
            )}
          </WorkflowControls>
        </div>
      </div>

      {open && (
        <>
          {/* Drag handle */}
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-[100px] flex items-center justify-center cursor-grab active:cursor-grabbing touch-none z-50 group"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div className="h-1.5 w-full rounded-full bg-muted group-hover:bg-muted-foreground/30 transition-colors" />
          </div>

          {/* Header */}
          <div className="sticky top-0 z-10 bg-background border-b">
            <div className="relative flex items-center py-2 px-4">
              <div className="flex items-center gap-2 min-w-0 shrink-0">
                {editType === 'node' && renderNodeIdentity()}
                {editType === 'workflow' && (
                  <>
                    <WorkflowIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold text-sm">Workflow</span>
                  </>
                )}
                {editType === 'edge' && (
                  <>
                    <GitBranch className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold text-sm">Edge</span>
                  </>
                )}
              </div>

              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-[32rem]">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList
                      className="grid h-8 w-full"
                      style={{ gridTemplateColumns: `repeat(${getAvailableTabs().length}, 1fr)` }}
                    >
                      {getAvailableTabs().map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-1 min-w-0 shrink-0">
                {onDelete && (editType === 'node' || editType === 'edge') &&
                  (editType === 'node' || editType === 'edge') && (
                    <Button variant="ghost" size="icon" onClick={onDelete} disabled={isSaving} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                <Button variant="ghost" size="icon" onClick={handleSave} disabled={isSaving} title="Save">
                  <Save className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} disabled={isSaving} title="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Form content */}
          <div className="mx-auto w-full max-w-2xl">
            <div className="p-4 pb-4 max-h-[calc(80vh-8rem)] overflow-y-auto">
              {renderTabContent()}
              {activeTab === 'general' && editType === 'node' && editingNodeData && (() => {
                const nodeKey = (editingNodeData.node as any).key as string | undefined
                if (!nodeKey) return null
                return (
                  <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border">
                    <span className="text-xs text-muted-foreground shrink-0">Referenced as</span>
                    <code
                      className="font-mono text-xs flex-1 cursor-pointer select-all hover:text-foreground transition-colors"
                      title="Click to select"
                      onClick={(e) => {
                        const range = document.createRange()
                        range.selectNodeContents(e.currentTarget)
                        const sel = window.getSelection()
                        sel?.removeAllRanges()
                        sel?.addRange(range)
                      }}
                    >
                      ${nodeKey}
                    </code>
                  </div>
                )
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
