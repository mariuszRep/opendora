'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Trash2, Save, X, GitBranch, Workflow as WorkflowIcon, Map as MapIcon } from 'lucide-react'
import { WorkflowControls, WorkflowControlButton } from '@/components/react-flow'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowNodeData, UnifiedNodeData, NodeType } from '@/components/react-flow/unified-node'
import { getNodeTypeMetadata } from '@/components/react-flow/node-type-registry'
import { resolveNodeType } from '@/components/react-flow/node-utils'

type EditType = 'workflow' | 'node' | 'edge'

export type DrawerFormData = {
  name?: string
  description?: string
  label?: string
  action_id?: string
  parameters?: Record<string, unknown>
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

  React.useEffect(() => {
    if (open && data) {
      setActiveTab('general')
      if (editType === 'workflow') {
        setFormData({ name: data.name || '', description: data.description || '' })
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
        nodeType: editingNodeData.nodeType,
      })
    } else {
      onSave(formData)
    }
  }

  const getAvailableTabs = () => {
    switch (editType) {
      case 'workflow':
        return [{ value: 'general', label: 'General' }]
      case 'node':
        return [
          { value: 'general', label: 'General' },
          { value: 'settings', label: 'Settings' },
        ]
      case 'edge':
        return [{ value: 'general', label: 'General' }]
      default:
        return [{ value: 'general', label: 'General' }]
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

      case 'node':
        if (!editingNodeData) return null

        const handleNodeChange = (updates: Partial<UnifiedNodeData['node']>) => {
          const updated = {
            ...editingNodeData,
            node: { ...editingNodeData.node, ...updates },
          }
          setEditingNodeData(updated)
          setFormData((prev) => ({ ...prev, label: updated.node.label, action_id: updated.node.action_id }))
        }

        if (activeTab === 'general') {
          return (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="node-label">Label</Label>
                <Input
                  id="node-label"
                  value={editingNodeData.node.label || ''}
                  onChange={(e) => handleNodeChange({ label: e.target.value })}
                  placeholder="Node label"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-description">Description</Label>
                <Textarea
                  id="node-description"
                  value={editingNodeData.node.description || ''}
                  onChange={(e) => handleNodeChange({ description: e.target.value })}
                  placeholder="Brief description"
                  rows={2}
                />
              </div>
              {editingNodeData.nodeType === 'action' && (
                <div className="space-y-2">
                  <Label htmlFor="node-action">Action ID</Label>
                  <Input
                    id="node-action"
                    value={editingNodeData.node.action_id || ''}
                    onChange={(e) => handleNodeChange({ action_id: e.target.value })}
                    placeholder="e.g. read-file"
                  />
                </div>
              )}
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
    <>
      {/* Controls — always visible at the bottom center of the canvas */}
      <div className="absolute bottom-4 inset-x-0 flex justify-center z-20 pointer-events-none">
        <WorkflowControls
          orientation="horizontal"
          showInteractive={true}
          className="!static shadow-lg pointer-events-auto"
          style={{ marginBottom: open ? '0' : undefined }}
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

      {/* Drawer panel — only when open */}
      {open && (
        <div
          className={cn(
            'bg-background absolute z-10 flex h-auto flex-col border-t shadow-lg',
            'inset-x-0 bottom-0 mt-24 max-h-[80vh] rounded-t-lg',
            !isDragging && 'transition-transform duration-500 ease-[0.32,0.72,0,1]'
          )}
          style={{ transform: `translateY(${dragY}px)`, willChange: 'transform' }}
        >
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
        </div>
      )}
    </>
  )
}
