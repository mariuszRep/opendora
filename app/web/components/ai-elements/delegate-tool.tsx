"use client"

import type { Session, ToolPart } from "@/lib/opendora"

import { ArrowRightIcon, BotIcon, ExternalLinkIcon } from "lucide-react"

type DelegateMetadata = {
  sessionId?: string
  agent?: string
  messageId?: string
  kind?: "delegate" | "reply"
  sourceSessionId?: string
}

function getDelegateMetadata(tool: ToolPart): DelegateMetadata {
  if ("metadata" in tool.state && tool.state.metadata) {
    return tool.state.metadata as DelegateMetadata
  }
  return {}
}

export type DelegateToolContentProps = {
  tool: ToolPart
  sessions: Session[]
  onSelectSession: (id: string) => void
  onGoToMessage?: (sessionId: string, messageId: string) => void
}

export const DelegateToolContent = ({
  tool,
  sessions,
  onSelectSession,
  onGoToMessage,
}: DelegateToolContentProps) => {
  const input = "input" in tool.state ? tool.state.input : {}
  const metadata = getDelegateMetadata(tool)
  const isReply = metadata.kind === "reply" || tool.tool === "reply"

  const prompt = input.prompt as string | undefined
  const description = input.description as string | undefined
  const replyMessage = input.message as string | undefined
  const inputAgent = input.agent as string | undefined

  const agent = metadata.agent ?? inputAgent
  const sessionId = metadata.sessionId

  const targetSession = sessionId ? sessions.find((s) => s.id === sessionId) : undefined
  const sessionLabel =
    targetSession?.title ??
    (sessionId ? `Session ${sessionId.slice(0, 8)}…` : undefined)

  const handleNavigate = () => {
    if (!sessionId) return
    if (metadata.messageId && onGoToMessage) {
      onGoToMessage(sessionId, metadata.messageId)
    } else {
      onSelectSession(sessionId)
    }
  }

  return (
    <div className="rounded-md border bg-background">
      {/* Prompt */}
      {(prompt || replyMessage) && (
        <div className="px-3 py-2.5 space-y-0.5">
          <p className="text-xs text-muted-foreground">{isReply ? "Reply" : "Message"}</p>
          <p className="text-sm text-foreground leading-relaxed">{replyMessage ?? prompt}</p>
        </div>
      )}

      {/* Agent + session row */}
      <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
        <div className="flex items-center gap-3 min-w-0">
          {agent && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BotIcon className="size-3.5 shrink-0" />
              <span className="truncate">{agent}</span>
            </div>
          )}
          {sessionLabel && (
            <>
              {agent && <span className="text-muted-foreground/40 text-xs">·</span>}
              <span className="truncate text-xs text-muted-foreground">{sessionLabel}</span>
            </>
          )}
        </div>
        {sessionId && (
          <button
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleNavigate}
            type="button"
          >
            <ExternalLinkIcon className="size-3.5" />
            View
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Derive a readable title for delegate / spawn_session tool headers.
 * Falls back to the raw tool name so callers always get a string.
 */
export function getDelegateToolTitle(tool: ToolPart): string {
  const input = "input" in tool.state ? tool.state.input : {}
  const metadata = getDelegateMetadata(tool)
  if (metadata.kind === "reply" || tool.tool === "reply") {
    const sessionId = metadata.sessionId
    return sessionId ? `Reply → ${sessionId.slice(0, 8)}…` : "Reply"
  }
  const description = input.description as string | undefined
  const agent = input.agent as string | undefined
  const base = description ?? "Delegate"
  return agent ? `${base} → ${agent}` : base
}

const DELEGATE_TOOLS = new Set(["delegate", "reply"])

export function isDelegateTool(toolName: string): boolean {
  return DELEGATE_TOOLS.has(toolName)
}

/** Banner shown inside a spawned/delegated session linking back to its parent. */
export type ParentSessionBannerProps = {
  parentSession: Session
  /** ID of the assistant message in the parent session that contains the delegate tool call */
  parentMessageID?: string
  onSelectSession: (id: string) => void
}

export const ParentSessionBanner = ({
  parentSession,
  parentMessageID,
  onSelectSession,
}: ParentSessionBannerProps) => (
  <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
    <ArrowRightIcon className="size-3.5 shrink-0 rotate-180" />
    <span>Spawned from</span>
    <button
      className="truncate font-medium text-foreground hover:underline"
      onClick={() => onSelectSession(parentSession.id)}
      title={parentMessageID ? `Parent session · tool call msg: ${parentMessageID}` : undefined}
      type="button"
    >
      {parentSession.title ?? `Session ${parentSession.id.slice(0, 8)}…`}
    </button>
    {parentSession.agentID && (
      <span className="text-muted-foreground">· {parentSession.agentID}</span>
    )}
    {parentMessageID && (
      <span className="ml-auto font-mono opacity-50">{parentMessageID.slice(0, 8)}…</span>
    )}
  </div>
)
