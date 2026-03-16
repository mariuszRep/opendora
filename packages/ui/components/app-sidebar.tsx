"use client"

import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { SessionEditSheet } from "@/components/sessions/session-edit-sheet"
import { SessionCreateDialog, SESSION_TYPE_CONFIG } from "@/components/sessions/session-create-dialog"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { Session, SessionType } from "@/lib/opendora"
import { getAgentColor } from "@/lib/agent-colors"
import { BotIcon, MessageSquareIcon, PencilIcon, PlusIcon, PlugIcon, Settings2Icon, StarIcon } from "lucide-react"
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
    agentSessions,
    selectedSession,
    selectSession,
    createSession,
    agents,
    selectedAgent,
    selectAgent,
    defaultAgent,
    setDefaultAgent,
    status,
    sessions,
    activeSessions,
  } = useOpendoraContext()

  const visibleAgents = agents.filter((a) => !a.hidden)
  
  // Track which agents are currently working based on active sessions
  const workingAgents = new Set<string>()
  sessions.forEach((session) => {
    if (session.agentID && activeSessions.has(session.id)) {
      workingAgents.add(session.agentID)
    }
  })

  // Session edit sheet state
  const [sessionEditOpen, setSessionEditOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  
  // Session create dialog state
  const [sessionCreateOpen, setSessionCreateOpen] = useState(false)

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarContent>
          {/* Agent section */}
          <SidebarGroup>
            <SidebarGroupLabel 
              className="group/agents group-data-[collapsible=icon]:hidden flex items-center justify-between pr-1"
              onMouseEnter={(e) => {
                const settingsButton = e.currentTarget.querySelector('button[title="Agents settings"]') as HTMLButtonElement
                if (settingsButton) {
                  settingsButton.style.opacity = '1'
                }
              }}
              onMouseLeave={(e) => {
                const settingsButton = e.currentTarget.querySelector('button[title="Agents settings"]') as HTMLButtonElement
                if (settingsButton) {
                  settingsButton.style.opacity = '0'
                }
              }}
            >
              <span>Agents</span>
              <div className="flex items-center">
                <Button
                  ref={(el) => {
                    if (el) el.style.opacity = '0'
                  }}
                  size="icon-sm"
                  variant="ghost"
                  className="size-5 text-muted-foreground hover:text-foreground transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push("/dashboard/settings/agents")
                  }}
                  title="Agents settings"
                >
                  <Settings2Icon className="size-3" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-5"
                  onClick={() => router.push("/dashboard/agents/new")}
                  title="New agent"
                >
                  <PlusIcon className="size-3" />
                </Button>
              </div>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAgents.map((agent) => {
                  const isActive = agent._id === selectedAgent
                  const isDefault = agent._id === defaultAgent
                  return (
                    <SidebarMenuItem
                      key={agent._id}
                      onMouseEnter={(e) => {
                        e.currentTarget.querySelectorAll('[data-sidebar="menu-action"]').forEach((el) => {
                          (el as HTMLElement).style.opacity = '1'
                        })
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.querySelectorAll('[data-sidebar="menu-action"]').forEach((el) => {
                          (el as HTMLElement).style.opacity = '0'
                        })
                      }}
                    >
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => { selectAgent(agent._id); router.push("/dashboard") }}
                        tooltip={agent.description ?? agent.name}
                        className={cn(isActive && "bg-sidebar-accent text-sidebar-accent-foreground")}
                      >
                        <div className="relative size-4 shrink-0 flex items-center justify-center">
                          {workingAgents.has(agent._id) && (
                            <div
                              className="absolute inset-0 rounded-full border-2 border-transparent border-t-current animate-spin"
                              style={{ borderTopColor: getAgentColor(agent.color).hex }}
                            />
                          )}
                          <div
                            className="size-2 rounded-full"
                            style={{ backgroundColor: getAgentColor(agent.color).hex }}
                          />
                        </div>
                        <span className="capitalize group-data-[collapsible=icon]:hidden flex-1 truncate">
                          {agent.name}
                        </span>
                        {isDefault && (
                          <StarIcon className="size-3 shrink-0 fill-current text-amber-400 group-data-[collapsible=icon]:hidden" />
                        )}
                      </SidebarMenuButton>

                      {/* Set as default — only shown on hover for non-default agents */}
                      {!isDefault && (
                        <SidebarMenuAction
                          className="group-data-[collapsible=icon]:hidden transition-opacity"
                          style={{ opacity: 0, right: "1.75rem" }}
                          title="Set as default"
                          onClick={() => setDefaultAgent(agent._id)}
                        >
                          <StarIcon className="size-3.5" />
                          <span className="sr-only">Set as default</span>
                        </SidebarMenuAction>
                      )}

                      {/* Edit — navigates to settings page */}
                      <SidebarMenuAction
                        className="group-data-[collapsible=icon]:hidden transition-opacity"
                        style={{ opacity: 0 }}
                        title="Agent settings"
                        onClick={() => router.push(`/dashboard/agents/${agent._id}`)}
                      >
                        <Settings2Icon className="size-3.5" />
                        <span className="sr-only">Settings for {agent.name}</span>
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Sessions — scoped to the selected agent */}
          <SidebarGroup>
            <SidebarGroupLabel 
              className="group/sessions group-data-[collapsible=icon]:hidden flex items-center justify-between pr-1"
              onMouseEnter={(e) => {
                const settingsButton = e.currentTarget.querySelector('button[title="Sessions settings"]') as HTMLButtonElement
                if (settingsButton) {
                  settingsButton.style.opacity = '1'
                }
              }}
              onMouseLeave={(e) => {
                const settingsButton = e.currentTarget.querySelector('button[title="Sessions settings"]') as HTMLButtonElement
                if (settingsButton) {
                  settingsButton.style.opacity = '0'
                }
              }}
            >
              <span>Sessions</span>
              <div className="flex items-center">
                {selectedAgent && (
                  <Button
                    ref={(el) => {
                      if (el) el.style.opacity = '0'
                    }}
                    size="icon-sm"
                    variant="ghost"
                    className="size-5 text-muted-foreground hover:text-foreground transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push("/dashboard/settings/sessions")
                    }}
                    title="Sessions settings"
                  >
                    <Settings2Icon className="size-3" />
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-5"
                  onClick={() => setSessionCreateOpen(true)}
                  title="New session for this agent"
                >
                  <PlusIcon className="size-3" />
                </Button>
              </div>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {agentSessions.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    No sessions yet
                  </p>
                )}
                {agentSessions.map((session) => {
                  const isActive = session.id === selectedSession?.id
                  const isMain = session.sessionType === "role"
                  return (
                    <SidebarMenuItem 
                      key={session.id}
                      onMouseEnter={(e) => {
                        const settingsButton = e.currentTarget.querySelector('[data-sidebar="menu-action"]') as HTMLElement
                        if (settingsButton) {
                          settingsButton.style.opacity = '1'
                        }
                      }}
                      onMouseLeave={(e) => {
                        const settingsButton = e.currentTarget.querySelector('[data-sidebar="menu-action"]') as HTMLElement
                        if (settingsButton) {
                          settingsButton.style.opacity = '0'
                        }
                      }}
                    >
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => { selectSession(session.id); router.push("/dashboard") }}
                        tooltip={`${formatSessionTitle(session)}${isMain ? " (main)" : ""}`}
                        className={cn(isActive && "bg-sidebar-accent text-sidebar-accent-foreground")}
                      >
                        {(() => {
                          const sessionType = session.sessionType || "scope"
                          const Icon = SESSION_TYPE_CONFIG[sessionType]?.icon || MessageSquareIcon
                          return <Icon className="size-4 shrink-0" />
                        })()}
                        <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-xs">{formatSessionTitle(session)}</span>
                            {isMain && (
                              <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium bg-primary/10 text-primary">main</span>
                            )}
                          </div>
                        </div>
                      </SidebarMenuButton>

                      <SidebarMenuAction
                        className="group-data-[collapsible=icon]:hidden transition-opacity"
                        style={{ opacity: 0 }}
                        title="Session settings"
                        onClick={() => { setEditingSession(session); setSessionEditOpen(true) }}
                      >
                        <Settings2Icon className="size-3.5" />
                        <span className="sr-only">Settings for {formatSessionTitle(session)}</span>
                      </SidebarMenuAction>
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
                onClick={() => router.push("/dashboard/settings")}
                tooltip="Settings"
              >
                <Settings2Icon className="size-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SessionEditSheet
        session={editingSession}
        open={sessionEditOpen}
        onOpenChange={setSessionEditOpen}
      />
      
      <SessionCreateDialog
        open={sessionCreateOpen}
        onOpenChange={setSessionCreateOpen}
        onCreateSession={async (sessionType: SessionType, openSettings: boolean) => {
          await createSession(sessionType)
          if (openSettings) {
            setTimeout(() => {
              const newSession = agentSessions[0]
              if (newSession) {
                setEditingSession(newSession)
                setSessionEditOpen(true)
              }
            }, 100)
          }
        }}
      />
    </>
  )
}
