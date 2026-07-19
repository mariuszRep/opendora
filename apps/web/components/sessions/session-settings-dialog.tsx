"use client"

import { useEffect, useState } from "react"
import { ClockPlusIcon, ScrollTextIcon, Settings2Icon, ShieldIcon, SparklesIcon, WrenchIcon } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import type { Session } from "@/lib/projectflows"
import { SessionGeneralPanel } from "./session-general-panel"
import { SessionSystemPromptPanel } from "./session-system-prompt-panel"
import { SessionSkillsPanel } from "./session-skills-panel"
import { SessionToolsPanel } from "./session-tools-panel"
import { SessionPermissionsPanel } from "./session-permissions-panel"
import { SessionSchedulesPanel } from "./session-schedules-panel"

type SectionId = "general" | "prompt" | "skills" | "tools" | "permissions" | "schedules"

const NAV_ITEMS: { id: SectionId; label: string; icon: typeof Settings2Icon }[] = [
  { id: "general", label: "General", icon: Settings2Icon },
  { id: "prompt", label: "System Prompt", icon: ScrollTextIcon },
  { id: "skills", label: "Skills", icon: SparklesIcon },
  { id: "tools", label: "Tools", icon: WrenchIcon },
  { id: "permissions", label: "Permissions", icon: ShieldIcon },
  { id: "schedules", label: "Schedules", icon: ClockPlusIcon },
]

interface SessionSettingsDialogProps {
  session: Session | null
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSection?: SectionId
}

export function SessionSettingsDialog({
  session,
  open,
  onOpenChange,
  defaultSection = "general",
}: SessionSettingsDialogProps) {
  const [section, setSection] = useState<SectionId>(defaultSection)

  useEffect(() => {
    if (open) setSection(defaultSection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const activeItem = NAV_ITEMS.find((item) => item.id === section) ?? NAV_ITEMS[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[85dvh] gap-0 overflow-hidden p-0 sm:max-w-[calc(100%-2rem)] md:h-[600px] md:max-w-[760px]">
        <DialogTitle className="sr-only">Session settings</DialogTitle>
        <DialogDescription className="sr-only">Manage settings for this session</DialogDescription>
        <SidebarProvider className="h-full items-start">
          <Sidebar collapsible="none" className="hidden w-48 shrink-0 border-r md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {NAV_ITEMS.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={item.id === section}
                          onClick={() => setSection(item.id)}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          <div className="flex h-full flex-1 flex-col overflow-hidden">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <Select value={section} onValueChange={(v) => setSection(v as SectionId)}>
                <SelectTrigger className="w-full md:hidden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NAV_ITEMS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Breadcrumb className="hidden md:flex">
                <BreadcrumbList>
                  <BreadcrumbItem>Settings</BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{activeItem.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="min-h-0 flex-1">
              {section === "general" && (
                <SessionGeneralPanel session={session} onOpenChange={onOpenChange} />
              )}
              {section === "prompt" && (
                <SessionSystemPromptPanel sessionID={session?.id} active={open && section === "prompt"} />
              )}
              {section === "skills" && (
                <SessionSkillsPanel sessionID={session?.id} active={open && section === "skills"} />
              )}
              {section === "tools" && (
                <SessionToolsPanel sessionID={session?.id} active={open && section === "tools"} />
              )}
              {section === "permissions" && <SessionPermissionsPanel session={session} />}
              {section === "schedules" && <SessionSchedulesPanel session={session} />}
            </div>
          </div>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
