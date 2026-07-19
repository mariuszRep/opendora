"use client"

import { MessageResponse } from "@/components/ai-elements/message"
import { useSessionSystemPrompt } from "@/hooks/use-session-system-prompt"

interface SessionSystemPromptPanelProps {
  sessionID: string | undefined
  active: boolean
}

export function SessionSystemPromptPanel({ sessionID, active }: SessionSystemPromptPanelProps) {
  const data = useSessionSystemPrompt(sessionID, active)

  return (
    <div className="h-full overflow-y-auto p-4">
      {data.sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No system prompt configured.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {data.sections.map((section, i) => (
            <div key={i} className="flex flex-col gap-2">
              {data.sections.length > 1 && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{section.label}</p>
              )}
              <MessageResponse className="prose dark:prose-invert max-w-none text-sm">
                {section.content}
              </MessageResponse>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
