"use client"

import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, Settings2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { SessionSettingsDialog } from "@/components/sessions/session-settings-dialog"

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
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  const visibleAgents = agents.filter((a) => !a.hidden)
  const selectedAgentObj = agents.find((a) => a._id === selectedAgent)
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
                                key={agent._id}
                                value={agent.name}
                                onSelect={() => {
                                  selectAgent(agent._id)
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
          <div className="flex items-center px-4">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="Session settings"
              onClick={() => setSettingsDialogOpen(true)}
            >
              <Settings2Icon className="size-4" />
              <span className="sr-only">Session settings</span>
            </Button>
          </div>
        )}
      </header>

      <SessionSettingsDialog
        session={selectedSession ?? null}
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />
    </>
  )
}
