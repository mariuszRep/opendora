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
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { Trash2, Save, X, GitBranch, Workflow as WorkflowIcon, Map as MapIcon, PlusIcon } from 'lucide-react'
import { WorkflowControls, WorkflowControlButton } from '@/components/react-flow'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, UnifiedNodeData, NodeType } from '@/components/react-flow/unified-node'
import { getNodeTypeMetadata } from '@/components/react-flow/node-type-registry'
import { resolveNodeType } from '@/components/react-flow/node-utils'
import { useToolSchemas } from '@/hooks/use-tool-schemas'
import { ToolParameterForm } from './tool-parameter-form'
import { type ToolSchemaProperty } from '@/lib/opendora'

type EditType = 'workflow' | 'node' | 'edge'

type BuiltinSchema = { description: string; properties: Record<string, ToolSchemaProperty>; required: string[] }

const BUILTIN_SCHEMAS: Record<string, BuiltinSchema> = {
  skill_load: {
    description: 'Load a skill into the workflow context so agent nodes can use it.',
    properties: {
      name: { type: 'string', description: 'Name of the skill to load (must exist in .opendora/skill/)' },
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

export type DrawerFormData = {
  name?: string
  description?: string
  label?: string
  action_id?: string
  parameters?: Record<string, unknown>
  inputs?: import('@/components/react-flow/unified-node').ParameterSchema[]
  instructions?: string
  nodeType?: NodeType
  type?: string
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
}: WorkflowEditDrawerProps) {
  const [formData, setFormData] = React.useState<DrawerFormData>({})
  const [editingNodeData, setEditingNodeData] = React.useState<UnifiedNodeData | null>(null)
  const [activeTab, setActiveTab] = React.useState('general')
  const { schemas, loading: loadingSchemas } = useToolSchemas()

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
        })
      } else if (editType === 'edge' && data.edge) {
        setFormData({ type: data.edge.type || 'animated' })
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
        inputs: editingNodeData.data.inputs,
        instructions: editingNodeData.instructions as string | undefined,
        nodeType: editingNodeData.nodeType,
      })
    } else {
      onSave(formData)
    }
  }

  const getAvailableTabs = () => {
    if (editType === 'node') {
      if (editingNodeData?.nodeType === 'start') {
        return [
          { value: 'general', label: 'General' },
          { value: 'inputs', label: 'Inputs' },
        ]
      }
      if (editingNodeData?.nodeType === 'prompt') {
        return [
          { value: 'general', label: 'General' },
          { value: 'settings', label: 'Settings' },
        ]
      }
      return [
        { value: 'general', label: 'General' },
        { value: 'inputs', label: 'Inputs' },
        { value: 'settings', label: 'Settings' },
        { value: 'schema', label: 'Schema' },
      ]
    }
    switch (editType) {
      case 'workflow': return [{ value: 'general', label: 'General' }]
      case 'edge': return [{ value: 'general', label: 'General' }]
      default: return [{ value: 'general', label: 'General' }]
    }
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

        const handleNodeChange = (updates: Partial<UnifiedNodeData['node']>) => {
          const updated = {
            ...editingNodeData,
            node: { ...editingNodeData.node, ...updates },
          }
          setEditingNodeData(updated)
          setFormData((prev) => ({ ...prev, label: updated.node.label, action_id: updated.node.action_id }))
        }

        const isStartNode = editingNodeData.nodeType === 'start'
        const isPromptNode = editingNodeData.nodeType === 'prompt'
        const selectedSchema = schemas.find((s) => s.id === editingNodeData.node.action_id)

        if (isPromptNode && activeTab === 'general') {
          return (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt-label">Label</Label>
                <Input
                  id="prompt-label"
                  value={editingNodeData.node.label || ''}
                  onChange={(e) => handleNodeChange({ label: e.target.value })}
                  placeholder="Step label"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt-text">Prompt</Label>
                <Textarea
                  id="prompt-text"
                  value={(editingNodeData.instructions as string) || ''}
                  onChange={(e) =>
                    setEditingNodeData({ ...editingNodeData, instructions: e.target.value })
                  }
                  placeholder="Message to send to the agent. Use $input.field or $ctx.key for substitution."
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prompt-output">Store response as</Label>
                <Input
                  id="prompt-output"
                  value={String(editingNodeData.node.parameters?.output ?? '')}
                  onChange={(e) =>
                    handleNodeChange({ parameters: { ...editingNodeData.node.parameters, output: e.target.value || undefined } })
                  }
                  placeholder="ctx key (e.g. result)"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">Response stored in <code className="font-mono">$ctx.&lt;key&gt;</code> for use in later steps.</p>
              </div>
            </div>
          )
        }

        if (activeTab === 'general') {
          return (
            <div className="space-y-4">
              {!isStartNode && (
                <div className="space-y-2">
                  <Label>Tool</Label>
                  <Combobox
                    value={editingNodeData.node.action_id ?? null}
                    onValueChange={(toolId) => {
                      handleNodeChange({
                        action_id: toolId ?? undefined,
                        label: editingNodeData.node.label || toolId || '',
                        parameters: {},
                      })
                      if (toolId) setActiveTab('inputs')
                    }}
                    items={schemas.map((s) => s.id)}
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
                        {(toolId) => {
                          const s = schemas.find((x) => x.id === toolId)
                          return (
                            <ComboboxItem key={toolId} value={toolId}>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="font-mono text-xs">{toolId}</span>
                                {s?.description && (
                                  <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                                    {s.description}
                                  </span>
                                )}
                              </div>
                              {s?.source === 'mcp' && (
                                <Badge variant="secondary" className="ml-2 text-xs shrink-0">MCP</Badge>
                              )}
                            </ComboboxItem>
                          )
                        }}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  {(selectedSchema?.description ?? BUILTIN_SCHEMAS[editingNodeData.node.action_id ?? '']?.description) && (
                    <p className="text-xs text-muted-foreground">{selectedSchema?.description ?? BUILTIN_SCHEMAS[editingNodeData.node.action_id ?? '']?.description}</p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="node-label">Label</Label>
                <Input
                  id="node-label"
                  value={editingNodeData.node.label || ''}
                  onChange={(e) => handleNodeChange({ label: e.target.value })}
                  placeholder="Node label"
                />
              </div>

              {!isStartNode && (
                <div className="space-y-2">
                  <Label htmlFor="node-description">Description</Label>
                  <Textarea
                    id="node-description"
                    value={editingNodeData.node.description || ''}
                    onChange={(e) => handleNodeChange({ description: e.target.value })}
                    placeholder="What does this step do?"
                    rows={2}
                  />
                </div>
              )}

              {isStartNode && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  This is the workflow entry point. Define the fields users fill in when running this workflow in the <strong>Inputs</strong> tab.
                </div>
              )}
            </div>
          )
        }

        if (activeTab === 'inputs') {
          if (isStartNode) {
            const fields = editingNodeData.data.inputs
            const setFields = (updated: typeof fields) => {
              setEditingNodeData({ ...editingNodeData, data: { ...editingNodeData.data, inputs: updated } })
            }
            return (
              <div className="space-y-3">
                {fields.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No input fields yet. Add one below.
                  </p>
                )}
                {fields.map((field, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          className="h-7 text-xs font-mono"
                          value={field.name}
                          onChange={(e) => {
                            const next = [...fields]
                            next[i] = { ...next[i], name: e.target.value }
                            setFields(next)
                          }}
                          placeholder="field_name"
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={field.type}
                          onValueChange={(v) => {
                            const next = [...fields]
                            next[i] = { ...next[i], type: v as typeof field.type }
                            setFields(next)
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(['string','number','boolean','object','array'] as const).map((t) => (
                              <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Req.</Label>
                        <div className="h-7 flex items-center">
                          <input
                            type="checkbox"
                            checked={field.required !== false}
                            onChange={(e) => {
                              const next = [...fields]
                              next[i] = { ...next[i], required: e.target.checked }
                              setFields(next)
                            }}
                            className="rounded"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs opacity-0 select-none">Del</Label>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setFields(fields.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        className="h-7 text-xs"
                        value={field.description ?? ''}
                        onChange={(e) => {
                          const next = [...fields]
                          next[i] = { ...next[i], description: e.target.value || undefined }
                          setFields(next)
                        }}
                        placeholder="Optional hint shown to the user"
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => setFields([...fields, { name: '', type: 'string', required: true }])}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add field
                </Button>
              </div>
            )
          }

          const actionId = editingNodeData.node.action_id ?? ''
          const builtin = BUILTIN_SCHEMAS[actionId]
          const properties = selectedSchema?.inputSchema?.properties ?? builtin?.properties ?? {}
          const required = selectedSchema?.inputSchema?.required ?? builtin?.required ?? []
          const description = selectedSchema?.description ?? builtin?.description
          const parameters = (editingNodeData.node.parameters ?? {}) as Record<string, unknown>
          const hasSchema = !!(selectedSchema || builtin)

          return (
            <div className="space-y-4">
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
              {!hasSchema ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Select a tool in the General tab to configure its inputs.
                </p>
              ) : (
                <ToolParameterForm
                  properties={properties}
                  required={required}
                  values={parameters}
                  onChange={(updated) => {
                    const next = { ...editingNodeData, node: { ...editingNodeData.node, parameters: updated } }
                    setEditingNodeData(next)
                  }}
                />
              )}
            </div>
          )
        }

        if (activeTab === 'schema') {
          const actionId = editingNodeData.node.action_id ?? ''
          const builtin = BUILTIN_SCHEMAS[actionId]
          const schemaObj = selectedSchema ?? (builtin ? {
            id: actionId,
            description: builtin.description,
            source: 'internal' as const,
            inputSchema: { type: 'object', properties: builtin.properties, required: builtin.required },
          } : null)

          if (!schemaObj) {
            return (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Select a tool in the General tab to view its JSON schema.
              </p>
            )
          }

          const json = JSON.stringify(
            {
              name: schemaObj.id,
              description: schemaObj.description,
              inputSchema: schemaObj.inputSchema,
            },
            null,
            2
          )

          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">{schemaObj.id}</span>
                {schemaObj.source === 'mcp' && (
                  <Badge variant="secondary" className="text-xs">MCP</Badge>
                )}
              </div>
              <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-auto font-mono leading-relaxed whitespace-pre-wrap border max-h-[50vh]">
                {json}
              </pre>
            </div>
          )
        }

        if (activeTab === 'settings') {
          return (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="node-exec-mode">Execution Mode</Label>
                <Select
                  value={editingNodeData.node.execution_mode || 'automatic'}
                  onValueChange={(value) =>
                    handleNodeChange({ execution_mode: value as 'automatic' | 'manual' })
                  }
                >
                  <SelectTrigger id="node-exec-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatic">Automatic</SelectItem>
                    <SelectItem value="manual">Manual (User Approval)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )
        }
        return null
      }

      case 'edge':
        return (
          <div className="space-y-4">
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

  const [isDragging, setIsDragging] = React.useState(false)
  const [dragY, setDragY] = React.useState(0)
  const [dragStartY, setDragStartY] = React.useState(0)

  React.useEffect(() => {
    if (!open) {
      setDragY(0)
      setIsDragging(false)
    }
  }, [open])

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
        <WorkflowControls
          orientation="horizontal"
          showInteractive={true}
          className="!static shadow-lg pointer-events-auto"
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
                  !(editType === 'node' && data?.node && (data.node.data as WorkflowNodeData).nodeType === 'start') && (
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
            </div>
          </div>
        </>
      )}
    </div>
  )
}
