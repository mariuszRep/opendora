"use client"

import { ServerIcon, WrenchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useSessionSystemPrompt } from "@/hooks/use-session-system-prompt"

interface SessionToolsPanelProps {
  sessionID: string | undefined
  active: boolean
}

export function SessionToolsPanel({ sessionID, active }: SessionToolsPanelProps) {
  const data = useSessionSystemPrompt(sessionID, active)

  return (
    <div className="h-full overflow-y-auto p-4">
      {data.tools.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tools available for this agent.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.tools.map((tool) => (
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
    </div>
  )
}
