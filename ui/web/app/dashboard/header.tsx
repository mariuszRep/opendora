"use client"

import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { MessageResponse } from "@/components/ai-elements/message"
import { CalendarIcon, ChevronDownIcon, ScrollTextIcon, Settings2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { SessionEditSheet } from "@/components/sessions/session-edit-sheet"
import { opendora } from "@/lib/opendora"
import { cn } from "@/lib/utils"

function formatSessionTitle(session: { title?: string; time: { created: number } }): string {
  if (session.title && !session.title.startsWith("New session")) return session.title
  return new Date(session.time.created).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function Header() {
  const { selectedAgent, selectAgent, selectedSession, agentSessions, selectSession, agents } =
    useOpendoraContext()

  const [sessionOpen, setSessionOpen] = useState(false)
  const [agentOpen, setAgentOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<"general" | "schedules">("general")
  const [promptOpen, setPromptOpen] = useState(false)
  const [systemPromptSections, setSystemPromptSections] = useState<{ label: string; content: string }[]>([])
  const [hasSchedules, setHasSchedules] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!selectedSession) { setSystemPromptSections([]); return }
    opendora.session.systemPrompt(selectedSession.id)
      .then((res) => setSystemPromptSections(res.sections))
      .catch(() => setSystemPromptSections([]))
  }, [selectedSession?.id])

  useEffect(() => {
    if (!selectedSession) { setHasSchedules(false); return }
    opendora.schedule.list()
      .then((all) => setHasSchedules(all.some((s) => s.session_id === selectedSession.id)))
      .catch(() => setHasSchedules(false))
  }, [selectedSession?.id])

  const visibleAgents = agents.filter((a) => !a.hidden)
  const selectedAgentObj = agents.find((a) => (a as any)._id === selectedAgent)
  const selectedAgentName = selectedAgentObj?.name || selectedAgent

  return (
    <>
      <header className="border-b bg-background sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex flex-1 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />

          <Breadcrumb>
            <BreadcrumbList>
              {/* Agent — click to switch agent */}
              <BreadcrumbItem>
                {mounted ? (
                  <DropdownMenu open={agentOpen} onOpenChange={setAgentOpen}>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground transition-colors">
                        <span className="capitalize">{selectedAgentName}</span>
                        <ChevronDownIcon className="size-3 opacity-50" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48 p-0">
                      <Command>
                        <CommandInput placeholder="Switch agent…" />
                        <CommandList>
                          <CommandEmpty>No agents found.</CommandEmpty>
                          <CommandGroup>
                            {visibleAgents.map((agent) => (
                              <CommandItem
                                key={(agent as any)._id}
                                value={agent.name}
                                onSelect={() => {
                                  selectAgent((agent as any)._id)
                                  setAgentOpen(false)
                                }}
                              >
                                <span className="capitalize">{agent.name}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="text-sm font-medium capitalize">{selectedAgentName}</span>
                )}
              </BreadcrumbItem>

              <BreadcrumbSeparator />

              {/* Session — list scoped to the current agent */}
              <BreadcrumbItem>
                {mounted ? (
                  <DropdownMenu open={sessionOpen} onOpenChange={setSessionOpen}>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <span>
                          {selectedSession ? formatSessionTitle(selectedSession) : "Select session"}
                        </span>
                        <ChevronDownIcon className="size-3 opacity-50" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72 p-0">
                      <Command>
                        <CommandInput placeholder="Search sessions…" />
                        <CommandList>
                          <CommandEmpty>No sessions for this agent.</CommandEmpty>
                          <CommandGroup>
                            {agentSessions.map((session) => (
                              <CommandItem
                                key={session.id}
                                value={formatSessionTitle(session)}
                                onSelect={() => {
                                  selectSession(session.id)
                                  setSessionOpen(false)
                                }}
                              >
                                <span className="flex-1">{formatSessionTitle(session)}</span>
                                {session.sessionType === "role" && (
                                  <span className="ml-2 rounded px-1 py-px text-[9px] font-medium bg-primary/10 text-primary">
                                    main
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="text-sm text-muted-foreground">Select session</span>
                )}
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Far-right actions */}
        {selectedSession && mounted && (
          <div className="flex items-center gap-1 px-4">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="System prompt"
              onClick={() => setPromptOpen(true)}
            >
              <ScrollTextIcon className="size-4" />
              <span className="sr-only">System prompt</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("size-8", !hasSchedules && "text-muted-foreground")}
              title="Schedules"
              onClick={() => { setSettingsTab("schedules"); setSettingsOpen(true) }}
            >
              <CalendarIcon className="size-4" />
              <span className="sr-only">Schedules</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="Session settings"
              onClick={() => { setSettingsTab("general"); setSettingsOpen(true) }}
            >
              <Settings2Icon className="size-4" />
              <span className="sr-only">Session settings</span>
            </Button>
          </div>
        )}
      </header>

      <SessionEditSheet
        session={selectedSession ?? null}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab={settingsTab}
      />

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="sm:max-w-[210mm] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>System Prompt</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-6 pr-1">
            {systemPromptSections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No system prompt configured.</p>
            ) : (
              systemPromptSections.map((section, i) => (
                <div key={i} className="flex flex-col gap-2">
                  {systemPromptSections.length > 1 && (
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{section.label}</p>
                  )}
                  <MessageResponse className="prose dark:prose-invert max-w-none text-sm">
                    {section.content}
                  </MessageResponse>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
