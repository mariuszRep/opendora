"use client"

import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import { NotificationBlade } from "@/components/notifications/notification-blade"
import { SessionCreateDialog } from "@/components/sessions/session-create-dialog"
import { SessionTreePanel, type SessionTreePanelHandle } from "@/components/sessions/session-tree-panel"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import type { SessionType } from "@/lib/projectflows"
import { BellIcon, BotIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, FolderTreeIcon, PlusIcon, PlugIcon, Settings2Icon, GalleryHorizontalIcon, GlobeIcon, TerminalIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import type React from "react"
import { useRef, useState, useEffect } from "react"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter()
  const sessionTreeRef = useRef<SessionTreePanelHandle>(null)
  const {
    selectedSession,
    selectSession,
    createSession,
    agents,
    selectedAgent,
    sessions,
    activeSessions,
    fileTreeOpen,
    toggleFileTree,
    terminalPanelOpen,
    toggleTerminalPanel,
    isChatCentered,
    toggleChatLayout,
    webPreviewOpen,
    toggleWebPreview,
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    removeNotification,
    clearAll,
    replyPermission,
    allPermissionRequests,
  } = useOpendoraContext()

  const [notificationBladeOpen, setNotificationBladeOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const visibleAgents = agents.filter((a) => !a.hidden)

  // Session create dialog state
  const [sessionCreateOpen, setSessionCreateOpen] = useState(false)

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarContent>
          {/* Sessions — global tree across all agents */}
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
                  onClick={(e) => {
                    e.stopPropagation()
                    sessionTreeRef.current?.expandAll()
                  }}
                  title="Expand all sessions"
                >
                  <ChevronsUpDownIcon className="size-3" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-5"
                  onClick={(e) => {
                    e.stopPropagation()
                    sessionTreeRef.current?.collapseAll()
                  }}
                  title="Collapse all sessions"
                >
                  <ChevronsDownUpIcon className="size-3" />
                </Button>
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
            <SidebarGroupContent className="group-data-[collapsible=icon]:hidden">
              <SessionTreePanel
                ref={sessionTreeRef}
                sessions={sessions}
                agents={agents}
                selectedSessionId={selectedSession?.id}
                activeSessions={activeSessions}
                onSessionClick={(session) => selectSession(session.id)}
                showHeader={false}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleFileTree}
                tooltip={fileTreeOpen ? "Hide file tree" : "Show file tree"}
                isActive={fileTreeOpen}
              >
                <FolderTreeIcon className="size-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Files</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleChatLayout}
                tooltip={isChatCentered ? "Stretched View" : "Centered View"}
                isActive={isChatCentered}
              >
                <GalleryHorizontalIcon className="size-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Layout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleWebPreview}
                tooltip={webPreviewOpen ? "Close Preview" : "Open Preview"}
                isActive={webPreviewOpen}
              >
                <GlobeIcon className="size-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Preview</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleTerminalPanel}
                tooltip={terminalPanelOpen ? "Hide terminal" : "Show terminal"}
                isActive={terminalPanelOpen}
              >
                <TerminalIcon className="size-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Terminal</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="border-t my-2" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setNotificationBladeOpen(true)}
                tooltip="Notifications"
                isActive={notificationBladeOpen}
              >
                <div className="relative shrink-0">
                  <BellIcon className="size-4" />
                  {mounted && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
                <span className="group-data-[collapsible=icon]:hidden">Notifications</span>
              </SidebarMenuButton>
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

      <NotificationBlade
        open={notificationBladeOpen}
        onOpenChange={setNotificationBladeOpen}
        notifications={notifications}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onRemove={removeNotification}
        onClearAll={clearAll}
        onPermissionReply={replyPermission}
        hasAgentPattern={(requestID) => {
          for (const list of Object.values(allPermissionRequests)) {
            const found = list.find((r) => r.id === requestID)
            if (found) return (found.agent_patterns?.length ?? 0) > 0
          }
          return false
        }}
      />
      <SessionCreateDialog
        open={sessionCreateOpen}
        onOpenChange={setSessionCreateOpen}
        agents={visibleAgents}
        selectedAgentId={selectedAgent}
        onCreateSession={async (sessionType: SessionType, agentID: string | undefined) => {
          await createSession(sessionType, agentID)
        }}
      />
    </>
  )
}
