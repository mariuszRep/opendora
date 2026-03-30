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
import { useUserProfile } from "@/hooks/use-user-profile"
import { BotIcon, CheckIcon, MessageSquareIcon, PencilIcon, PlusIcon, PlugIcon, Settings2Icon, StarIcon, SquareIcon, UserIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import type React from "react"
import { useRef, useState } from "react"

function formatSessionTitle(session: { title?: string; time: { created: number } }): string {
  if (session.title && !session.title.startsWith("New session")) return session.title
  return new Date(session.time.created).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function actionRight(slot: number): string {
  return `${0.25 + slot * 1.75}rem`
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
    abortSession,
    setAgentMainSession,
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

  // User profile
  const { userName, setUserName } = useUserProfile()
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)

  const startEditName = () => {
    setNameInput(userName)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  const commitName = () => {
    setUserName(nameInput.trim())
    setEditingName(false)
  }

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
                  const isWorking = workingAgents.has(agent._id)
                  return (
                    <SidebarMenuItem
                      key={agent._id}
                      onMouseEnter={(e) => {
                        e.currentTarget.querySelectorAll('[data-hover-reveal="true"]').forEach((el) => {
                          const element = el as HTMLElement
                          element.style.opacity = '1'
                          element.style.backgroundColor = 'hsl(var(--sidebar-accent))'
                        })
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.querySelectorAll('[data-hover-reveal="true"]').forEach((el) => {
                          const element = el as HTMLElement
                          element.style.opacity = '0'
                          element.style.backgroundColor = 'transparent'
                        })
                      }}
                    >
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => selectAgent(agent._id)}
                        tooltip={agent.description ?? agent.name}
                        className={cn(
                          "pr-2 group-has-data-[sidebar=menu-action]/menu-item:pr-2",
                          isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                      >
                        <div className="relative size-4 shrink-0 flex items-center justify-center">
                          {isWorking && (
                            <div
                              className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                              style={{ borderTopColor: getAgentColor(agent.color).hex }}
                              aria-hidden="true"
                            />
                          )}
                          <div
                            className="size-2 rounded-full"
                            style={{ backgroundColor: getAgentColor(agent.color).hex }}
                          />
                        </div>
                        <div className="relative min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                          <span className="block capitalize truncate">
                            {agent.name}
                          </span>
                          <div className={cn(
                            "pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-sidebar-accent via-sidebar-accent/80 to-transparent transition-opacity",
                            (isWorking || isDefault) ? "opacity-100" : "opacity-0 group-hover/menu-item:opacity-100",
                          )} />
                        </div>
                      </SidebarMenuButton>

                      {/* Stop — slot 0, only shown when agent is working */}
                      <SidebarMenuAction
                        className="group-data-[collapsible=icon]:hidden transition-opacity"
                        style={{ opacity: isWorking ? 1 : 0, right: actionRight(0), pointerEvents: isWorking ? 'auto' : 'none' }}
                        title="Stop agent"
                        onClick={(e) => {
                          e.stopPropagation()
                          sessions
                            .filter((s) => s.agentID === agent._id && activeSessions.has(s.id))
                            .forEach((s) => abortSession(s.id))
                        }}
                      >
                        <SquareIcon className="size-3.5 fill-current" />
                        <span className="sr-only">Stop {agent.name}</span>
                      </SidebarMenuAction>

                      {/* Star — slot 1, always visible if default; revealed on hover if not */}
                      <SidebarMenuAction
                        data-hover-reveal={!isDefault ? "true" : undefined}
                        className="group-data-[collapsible=icon]:hidden transition-all"
                        style={{ 
                          opacity: isDefault ? 1 : 0, 
                          right: actionRight(1),
                          backgroundColor: isDefault ? 'hsl(var(--sidebar-accent))' : 'transparent'
                        }}
                        title={isDefault ? "Default agent" : "Set as default"}
                        onClick={isDefault ? undefined : () => setDefaultAgent(agent._id)}
                      >
                        <StarIcon className={cn("size-3.5", isDefault && "fill-current text-white")} />
                        <span className="sr-only">{isDefault ? "Default agent" : "Set as default"}</span>
                      </SidebarMenuAction>

                      {/* Settings — slot 2, revealed on hover */}
                      <SidebarMenuAction
                        data-hover-reveal="true"
                        className="group-data-[collapsible=icon]:hidden transition-all"
                        style={{ opacity: 0, right: actionRight(2) }}
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
                  // Only role sessions can be main, and only one should show star
                  const isMain = session.sessionType === "role"
                  const isWorking = activeSessions.has(session.id)
                  return (
                    <SidebarMenuItem
                      key={session.id}
                      onMouseEnter={(e) => {
                        e.currentTarget.querySelectorAll('[data-hover-reveal="true"]').forEach((el) => {
                          const element = el as HTMLElement
                          element.style.opacity = '1'
                          element.style.backgroundColor = 'hsl(var(--sidebar-accent))'
                        })
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.querySelectorAll('[data-hover-reveal="true"]').forEach((el) => {
                          const element = el as HTMLElement
                          element.style.opacity = '0'
                          element.style.backgroundColor = 'transparent'
                        })
                      }}
                    >
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => selectSession(session.id)}
                        tooltip={`${formatSessionTitle(session)}${isMain ? " (main)" : ""}${isWorking ? " - active" : ""}`}
                        className={cn(
                          "pr-2 group-has-data-[sidebar=menu-action]/menu-item:pr-2",
                          isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                      >
                        <div className="relative size-4 shrink-0 flex items-center justify-center">
                          {(() => {
                            const sessionType = session.sessionType || "scope"
                            const Icon = SESSION_TYPE_CONFIG[sessionType]?.icon || MessageSquareIcon
                            return <Icon className="size-4 shrink-0" />
                          })()}
                        </div>
                        <div className="relative min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                          <span className="block truncate text-xs leading-5">
                            {formatSessionTitle(session)}
                          </span>
                          <div className={cn(
                            "pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-sidebar-accent via-sidebar-accent/80 to-transparent transition-opacity",
                            (isWorking || isMain) ? "opacity-100" : "opacity-0 group-hover/menu-item:opacity-100",
                          )} />
                        </div>
                      </SidebarMenuButton>

                      {/* Stop — slot 0, only shown when session is working */}
                      <SidebarMenuAction
                        className="group-data-[collapsible=icon]:hidden transition-opacity"
                        style={{ opacity: isWorking ? 1 : 0, right: actionRight(0), pointerEvents: isWorking ? 'auto' : 'none' }}
                        title="Stop session"
                        onClick={(e) => {
                          e.stopPropagation()
                          abortSession(session.id)
                        }}
                      >
                        <SquareIcon className="size-3.5 fill-current" />
                        <span className="sr-only">Stop {formatSessionTitle(session)}</span>
                      </SidebarMenuAction>

                      {/* Star - clickable to make this session the main session */}
                      <SidebarMenuAction
                        data-hover-reveal={!isMain ? "true" : undefined}
                        className="group-data-[collapsible=icon]:hidden transition-all"
                        style={{ 
                          opacity: isMain ? 1 : 0, 
                          right: actionRight(1),
                          backgroundColor: isMain ? 'hsl(var(--sidebar-accent))' : 'transparent'
                        }}
                        title={isMain ? "Main session" : "Make main session"}
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (session.agentID && !isMain) {
                            await setAgentMainSession(session.agentID, session.id)
                          }
                        }}
                      >
                        <StarIcon className={cn("size-3.5", isMain && "fill-current text-white")} />
                        <span className="sr-only">{isMain ? "Main session" : "Make main session"}</span>
                      </SidebarMenuAction>

                      {/* Settings — slot 2, revealed on hover */}
                      <SidebarMenuAction
                        data-hover-reveal="true"
                        className="group-data-[collapsible=icon]:hidden transition-all"
                        style={{ opacity: 0, right: actionRight(2) }}
                        title="Session settings"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingSession(session)
                          setSessionEditOpen(true)
                        }}
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
              {editingName ? (
                <div className="flex items-center gap-1 px-2 py-1 group-data-[collapsible=icon]:hidden">
                  <UserIcon className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    ref={nameInputRef}
                    className="flex-1 min-w-0 bg-transparent text-sm outline-none border-b border-border"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitName()
                      if (e.key === "Escape") setEditingName(false)
                    }}
                    onBlur={commitName}
                    placeholder="Your name"
                  />
                  <button onClick={commitName} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <CheckIcon className="size-3" />
                  </button>
                </div>
              ) : (
                <SidebarMenuButton onClick={startEditName} tooltip={userName ? `User: ${userName}` : "Set your name"}>
                  <UserIcon className="size-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden truncate">
                    {userName ? (
                      <span>user: <span className="font-medium">{userName}</span></span>
                    ) : (
                      <span className="text-muted-foreground">Set your name…</span>
                    )}
                  </span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
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
          // Navigate to conversation - the session should already be selected
          router.push("/dashboard")
        }}
      />
    </>
  )
}
