"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import { useSessionMessages } from "@/hooks/use-session-messages"
import { opendora, SessionBusyError, type Part } from "@/lib/projectflows"
import type { ViewItem } from "@/hooks/use-workspace-layout"

// Covers text/reasoning/tool-call rendering; more exotic part types (execution-graph,
// delegate-tool, artifacts, ...) fall back to a compact generic line rather than
// blocking this pane on re-verifying every specialized renderer in chatbot.tsx.
function PartView({ part }: { part: Part }) {
  if (part.type === "text") {
    const text = (part as { text: string }).text
    if (!text) return null
    return <MessageResponse>{text}</MessageResponse>
  }
  if (part.type === "reasoning") {
    const text = (part as { text?: string }).text
    if (!text) return null
    return <p className="text-xs italic text-muted-foreground">{text}</p>
  }
  if (part.type === "tool") {
    const p = part as { tool: string; state: { status: string } }
    return (
      <p className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
        {p.tool} — {p.state.status}
      </p>
    )
  }
  return <p className="text-xs text-muted-foreground">[{part.type}]</p>
}

export function SessionPane({ item }: { item: ViewItem }) {
  const sessionId = item.refId
  const { sessions } = useOpendoraContext()
  const session = sessions.find((s) => s.id === sessionId)
  const messages = useSessionMessages(sessionId)
  const [sending, setSending] = useState(false)

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim()
    if (!text) return
    setSending(true)
    try {
      let model: { providerID: string; modelID: string } | undefined
      if (session?.model) {
        const [providerID, modelID] = session.model.split(":")
        if (providerID && modelID) model = { providerID, modelID }
      }
      await opendora.session.prompt(sessionId, {
        parts: [{ type: "text", text }],
        agent: session?.agentID,
        model,
      })
    } catch (err) {
      toast.error(err instanceof SessionBusyError ? err.message : "Failed to send message")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState />
          ) : (
            messages.map((m) => (
              <Message key={m.info.id} from={m.info.role}>
                <MessageContent>
                  {m.parts.map((part) => (
                    <PartView key={part.id} part={part} />
                  ))}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <PromptInput onSubmit={handleSubmit} className="m-2">
        <PromptInputBody>
          <PromptInputTextarea placeholder={`Message ${session?.title || sessionId}…`} />
        </PromptInputBody>
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit status={sending ? "submitted" : undefined} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
