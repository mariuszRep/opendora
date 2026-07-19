"use client"

import { MessageResponse } from "@/components/ai-elements/message"
import { useSessionSystemPrompt } from "@/hooks/use-session-system-prompt"

interface SessionInjectionPanelProps {
  sessionID: string | undefined
  active: boolean
}

export function SessionInjectionPanel({ sessionID, active }: SessionInjectionPanelProps) {
  const data = useSessionSystemPrompt(sessionID, active)

  return (
    <div className="h-full overflow-y-auto p-4">
      {!data.injection ? (
        <p className="text-sm text-muted-foreground">No injection configured for this agent.</p>
      ) : (
        <MessageResponse className="prose dark:prose-invert max-w-none text-sm">
          {data.injection}
        </MessageResponse>
      )}
    </div>
  )
}
