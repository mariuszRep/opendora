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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { MessageResponse } from "@/components/ai-elements/message"
import { ChevronDownIcon, ChevronRightIcon, ClockPlusIcon, MoreHorizontalIcon, ScrollTextIcon, ServerIcon, Settings2Icon, ShieldIcon, WrenchIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { SessionSettingsSheet } from "@/components/sessions/session-settings-sheet"
import { SessionSchedulesSheet } from "@/components/sessions/session-schedules-sheet"
import { SessionPermissionsSheet } from "@/components/sessions/session-permissions-sheet"
import { opendora } from "@/lib/projectflows"
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
  const [schedulesOpen, setSchedulesOpen] = useState(false)
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [systemPromptData, setSystemPromptData] = useState<{
    sections: { label: string; content: string }[]
    injection: string
    skills: { name: string; description: string; content: string; tools?: string[] }[]
    tools: { id: string; description: string; source: "internal" | "mcp"; mcpServer?: string; agentManaged: boolean; skillUnlocked: boolean }[]
    loadedSkillNames: string[]
  }>({ sections: [], injection: "", skills: [], tools: [], loadedSkillNames: [] })
  const [hasSchedules, setHasSchedules] = useState(false)
  const promptOpenRef = useRef(false)
  const selectedSessionId = selectedSession?.id

  useEffect(() => {
    const timeout = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  function fetchPromptData(sessionID: string) {
    opendora.session.systemPrompt(sessionID)
      .then((res) => setSystemPromptData({
        ...res,
        loadedSkillNames: res.loadedSkillNames ?? [],
        tools: (res.tools ?? []).map((t) => ({ ...t, agentManaged: t.agentManaged ?? true, skillUnlocked: t.skillUnlocked ?? false })),
      }))
      .catch(() => setSystemPromptData({ sections: [], injection: "", skills: [], tools: [], loadedSkillNames: [] }))
  }

  useEffect(() => {
    promptOpenRef.current = promptOpen
    if (promptOpen && selectedSessionId) fetchPromptData(selectedSessionId)
  }, [promptOpen, selectedSessionId])

  // Re-fetch whenever the session goes idle (tool calls finished) and the panel is open
  useEffect(() => {
    return opendora.events.subscribe((event) => {
      if (event.type !== "session.idle") return
      const ev = event as { type: string; properties: { sessionID: string } }
      if (!promptOpenRef.current || ev.properties.sessionID !== selectedSessionId) return
      fetchPromptData(ev.properties.sessionID)
    })
  }, [selectedSessionId, selectedSession])

  useEffect(() => {
    if (!selectedSessionId) {
      const timeout = window.setTimeout(() => setHasSchedules(false), 0)
      return () => window.clearTimeout(timeout)
    }
    opendora.schedule.list()
      .then((all) => setHasSchedules(all.some((s) => s.session_id === selectedSessionId)))
      .catch(() => setHasSchedules(false))
  }, [selectedSessionId])

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
          <>
            <div className="hidden items-center gap-1 px-4 md:flex">
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
                onClick={() => setSchedulesOpen(true)}
              >
                <ClockPlusIcon className="size-4" />
                <span className="sr-only">Schedules</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                title="Permissions"
                onClick={() => setPermissionsOpen(true)}
              >
                <ShieldIcon className="size-4" />
                <span className="sr-only">Permissions</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                title="Session settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2Icon className="size-4" />
                <span className="sr-only">Session settings</span>
              </Button>
            </div>

            <div className="flex items-center px-4 md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" title="Session actions">
                    <MoreHorizontalIcon className="size-4" />
                    <span className="sr-only">Session actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => setPromptOpen(true)}>
                      <ScrollTextIcon className="size-4" />
                      <span>System prompt</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(!hasSchedules && "text-muted-foreground")}
                      onSelect={() => setSchedulesOpen(true)}
                    >
                      <ClockPlusIcon className="size-4" />
                      <span>Schedules</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPermissionsOpen(true)}>
                      <ShieldIcon className="size-4" />
                      <span>Permissions</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                      <Settings2Icon className="size-4" />
                      <span>Session settings</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </header>

      <SessionSettingsSheet
        session={selectedSession ?? null}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <SessionSchedulesSheet
        session={selectedSession ?? null}
        open={schedulesOpen}
        onOpenChange={setSchedulesOpen}
      />
      <SessionPermissionsSheet
        session={selectedSession ?? null}
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
      />

      <Sheet open={promptOpen} onOpenChange={setPromptOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[700px] flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <SheetTitle>Agent Context</SheetTitle>
          </SheetHeader>
          <Tabs defaultValue="prompt" className="flex flex-col flex-1 min-h-0">
            <TabsList variant="line" className="px-6 shrink-0 border-b rounded-none w-full justify-start h-10 gap-4">
              <TabsTrigger value="prompt">System Prompt</TabsTrigger>
              <TabsTrigger value="injection">
                Injection
                {!systemPromptData.injection && <span className="ml-1 text-muted-foreground/50">·</span>}
              </TabsTrigger>
              <TabsTrigger value="skills">
                Skills
                {systemPromptData.skills.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{systemPromptData.skills.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tools">
                Tools
                {systemPromptData.tools.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{systemPromptData.tools.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* System Prompt tab */}
            <TabsContent value="prompt" className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
              {systemPromptData.sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No system prompt configured.</p>
              ) : (
                <div className="flex flex-col gap-6">
                  {systemPromptData.sections.map((section, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      {systemPromptData.sections.length > 1 && (
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{section.label}</p>
                      )}
                      <MessageResponse className="prose dark:prose-invert max-w-none text-sm">
                        {section.content}
                      </MessageResponse>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Injection tab */}
            <TabsContent value="injection" className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
              {!systemPromptData.injection ? (
                <p className="text-sm text-muted-foreground">No injection configured for this agent.</p>
              ) : (
                <MessageResponse className="prose dark:prose-invert max-w-none text-sm">
                  {systemPromptData.injection}
                </MessageResponse>
              )}
            </TabsContent>

            {/* Skills tab */}
            <TabsContent value="skills" className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
              {systemPromptData.skills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No skills declared for this agent.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {systemPromptData.skills.map((skill) => {
                    const isLoaded = systemPromptData.loadedSkillNames.includes(skill.name)
                    return (
                    <Collapsible key={skill.name}>
                      <div className="rounded-lg border bg-card">
                        <CollapsibleTrigger className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg [&[data-state=open]>svg]:rotate-90">
                          <ChevronRightIcon className="size-4 shrink-0 mt-0.5 text-muted-foreground transition-transform" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-medium">{skill.name}</span>
                              {isLoaded && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">loaded</Badge>
                              )}
                              {skill.tools && skill.tools.length > 0 && (
                                <div className="flex gap-1 flex-wrap">
                                  {skill.tools.map((t) => (
                                    <Badge key={t} variant="outline" className="text-[10px] h-4 px-1">{t}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            {skill.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
                            )}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-t px-4 py-3">
                            <MessageResponse className="prose dark:prose-invert max-w-none text-sm">
                              {skill.content}
                            </MessageResponse>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  )})}
                </div>
              )}
            </TabsContent>

            {/* Tools tab */}
            <TabsContent value="tools" className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
              {systemPromptData.tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tools available for this agent.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {systemPromptData.tools.map((tool) => (
                    <div key={tool.id} className="flex items-start gap-3 rounded-md border px-3 py-2.5">
                      <div className="mt-0.5 shrink-0 text-muted-foreground">
                        {tool.source === "mcp" ? (
                          <ServerIcon className="size-3.5" />
                        ) : (
                          <WrenchIcon className="size-3.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-medium">{tool.id}</span>
                          {tool.source === "mcp" ? (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                              {tool.mcpServer ?? "mcp"}
                            </Badge>
                          ) : (
                            <>
                              {tool.agentManaged && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">agent</Badge>
                              )}
                              {tool.skillUnlocked && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5">skill</Badge>
                              )}
                            </>
                          )}
                        </div>
                        {tool.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  )
}
