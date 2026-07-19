"use client"

import { ChevronRightIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { MessageResponse } from "@/components/ai-elements/message"
import { useSessionSystemPrompt } from "@/hooks/use-session-system-prompt"

interface SessionSkillsPanelProps {
  sessionID: string | undefined
  active: boolean
}

export function SessionSkillsPanel({ sessionID, active }: SessionSkillsPanelProps) {
  const data = useSessionSystemPrompt(sessionID, active)

  return (
    <div className="h-full overflow-y-auto p-4">
      {data.skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No skills declared for this agent.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.skills.map((skill) => {
            const isLoaded = data.loadedSkillNames.includes(skill.name)
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
    </div>
  )
}
