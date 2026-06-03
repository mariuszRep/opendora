'use client'

import * as React from 'react'
import { GripVertical, Workflow } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { getAllNodeTypes } from './node-type-registry'

const nodeTypes = getAllNodeTypes()

interface WorkflowNodePaletteProps {
  onNodeDoubleClick?: (type: string) => void
}

export function WorkflowNodePalette({
  onNodeDoubleClick,
}: WorkflowNodePaletteProps = {}) {
  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <Sidebar collapsible="icon" className="!absolute !inset-y-0 !h-full">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="md:h-8 md:p-0 bg-transparent hover:bg-transparent cursor-default"
            >
              <div className="flex items-center gap-2">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Workflow className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Workflow Editor</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Nodes</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nodeTypes.map((node) => {
                const Icon = node.icon
                return (
                  <SidebarMenuItem key={node.type}>
                    <SidebarMenuButton
                      isActive={true}
                      tooltip={{
                        children: (
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{node.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {node.description}
                            </span>
                          </div>
                        ),
                      }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, node.type)}
                      onDoubleClick={() => onNodeDoubleClick?.(node.type)}
                      className="cursor-grab active:cursor-grabbing group"
                    >
                      <Icon />
                      <span>{node.label}</span>
                      <GripVertical className="size-4 text-muted-foreground/50 group-data-[collapsible=icon]:hidden ml-auto" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
