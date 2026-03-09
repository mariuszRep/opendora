"use client"

import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { AgentDeleteDialog } from "@/components/agents/agent-delete-dialog"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { Agent } from "@/lib/opendora"
import { BotIcon, MessageSquareIcon, PencilIcon, PlusIcon, PlugIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import type React from "react"
import { useState } from "react"

function formatSessionTitle(session: { title?: string; time: { created: number } }): string {
  if (session.title && !session.title.startsWith("New session")) return session.title
  return new Date(session.time.created).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter()
  const {
    sessions,
    selectedSession,
    selectSession,
    createSession,
    agents,
    selectedAgent,
    selectAgent,
  } = useOpendoraContext()

  const visibleAgents = agents.filter((a) => !a.hidden)

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingAgent, setDeletingAgent] = useState<{ id: string; name: string } | null>(null)

  function openDelete(agent: Agent) {
    setDeletingAgent({ id: agent.name, name: agent.name })
    setDeleteOpen(true)
  }

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader className="p-2">
          <Button
            className="w-full justify-start gap-2"
            onClick={createSession}
            size="sm"
            variant="outline"
          >
            <PlusIcon className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">New Session</span>
          </Button>
        </SidebarHeader>

        <SidebarContent>
          {/* Agent section */}
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden flex items-center justify-between pr-1">
              <span>Agents</span>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-5"
                onClick={() => router.push("/dashboard/agents/new")}
                title="New agent"
              >
                <PlusIcon className="size-3" />
              </Button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAgents.map((agent) => {
                  const isActive = agent.name === selectedAgent
                  return (
                    <SidebarMenuItem key={agent.name}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => { selectAgent(agent.name); router.push("/dashboard") }}
                        tooltip={agent.description ?? agent.name}
                        className={cn(isActive && "bg-sidebar-accent text-sidebar-accent-foreground")}
                      >
                        <BotIcon className="size-4 shrink-0" />
                        <span className="capitalize group-data-[collapsible=icon]:hidden">
                          {agent.name}
                        </span>
                      </SidebarMenuButton>

                      {/* Edit — navigates to settings page */}
                      <SidebarMenuAction
                        className="group-data-[collapsible=icon]:hidden"
                        title="Agent settings"
                        onClick={() => router.push(`/dashboard/agents/${agent.name}`)}
                        showOnHover
                      >
                        <PencilIcon className="size-3.5" />
                        <span className="sr-only">Settings for {agent.name}</span>
                      </SidebarMenuAction>

                      {/* Delete — only non-native agents */}
                      {!agent.native && (
                        <SidebarMenuAction
                          className="group-data-[collapsible=icon]:hidden right-7"
                          title="Delete agent"
                          onClick={() => openDelete(agent)}
                          showOnHover
                        >
                          <Trash2Icon className="size-3.5 text-destructive" />
                          <span className="sr-only">Delete {agent.name}</span>
                        </SidebarMenuAction>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

          {/* Sessions */}
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              Sessions
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sessions.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    No sessions yet
                  </p>
                )}
                {sessions.map((session) => {
                  const isActive = session.id === selectedSession?.id
                  return (
                    <SidebarMenuItem key={session.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => { selectSession(session.id); router.push("/dashboard") }}
                        tooltip={formatSessionTitle(session)}
                        className={cn(isActive && "bg-sidebar-accent text-sidebar-accent-foreground")}
                      >
                        <MessageSquareIcon className="size-4 shrink-0" />
                        <span className="truncate group-data-[collapsible=icon]:hidden">
                          {formatSessionTitle(session)}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => router.push("/dashboard/providers")}
                tooltip="Providers"
              >
                <PlugIcon className="size-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Providers</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      {deletingAgent && (
        <AgentDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          agentId={deletingAgent.id}
          agentName={deletingAgent.name}
          onDeleted={() => setDeletingAgent(null)}
        />
      )}
    </>
  )
}
