"use client"

import type { Session, ToolPart } from "@/lib/opendora"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowRightIcon, BotIcon, ExternalLinkIcon, GitBranchIcon } from "lucide-react"

import { CodeBlock } from "./code-block"

type DelegateMetadata = {
  sessionId?: string
  agent?: string
  created?: boolean
  replied?: boolean
  messageId?: string
  route?: string
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
  const isSpawn = tool.tool === "spawn_session"
  const input = "input" in tool.state ? tool.state.input : {}
  const metadata = getDelegateMetadata(tool)

  const prompt = input.prompt as string | undefined
  const description = input.description as string | undefined
  const inputAgent = input.agent as string | undefined
  const inputRoute = input.route as string | undefined

  const agent = metadata.agent ?? inputAgent
  const route = metadata.route ?? inputRoute
  const sessionId = metadata.sessionId

  const targetSession = sessionId ? sessions.find((s) => s.id === sessionId) : undefined
  const sessionLabel =
    targetSession?.title ??
    (sessionId ? `Session ${sessionId.slice(0, 8)}…` : undefined)

  const isCompleted = tool.state.status === "completed"
  const isError = tool.state.status === "error"

  return (
    <div className="space-y-4">
      {/* Request */}
      <div className="space-y-2">
        <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Request
        </h4>
        <div className="space-y-2">
          {description && (
            <p className="text-sm text-foreground">{description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {isSpawn && route && (
              <Badge variant="secondary" className="gap-1.5 text-xs">
                <GitBranchIcon className="size-3" />
                {route === "new_child_session" ? "New child session" : "New root session"}
              </Badge>
            )}
            {agent && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BotIcon className="size-3.5" />
                <span>{agent}</span>
              </div>
            )}
          </div>
          {prompt && (
            <div className="max-h-36 overflow-y-auto rounded-md bg-muted/50">
              <CodeBlock code={prompt} language="text" />
            </div>
          )}
        </div>
      </div>

      {/* Session card — shown once session ID is known */}
      {sessionId && (
        <div className="space-y-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {isSpawn ? "Spawned Session" : "Delegated Session"}
          </h4>
          <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <BotIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                {sessionLabel && (
                  <p className="truncate text-sm font-medium">{sessionLabel}</p>
                )}
                {agent && (
                  <p className="truncate text-xs text-muted-foreground">{agent}</p>
                )}
              </div>
            </div>
            <Button
              className="h-7 shrink-0 gap-1.5"
              onClick={() =>
                metadata.messageId && onGoToMessage
                  ? onGoToMessage(sessionId, metadata.messageId)
                  : onSelectSession(sessionId)
              }
              size="sm"
              variant="outline"
            >
              <ExternalLinkIcon className="size-3.5" />
              View
            </Button>
          </div>
        </div>
      )}

      {/* Result */}
      {isCompleted && "output" in tool.state && tool.state.output ? (
        <div className="space-y-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Result
          </h4>
          <div className="max-h-48 overflow-y-auto rounded-md bg-muted/50">
            <CodeBlock
              code={
                typeof tool.state.output === "string"
                  ? tool.state.output
                  : JSON.stringify(tool.state.output, null, 2)
              }
              language="text"
            />
          </div>
        </div>
      ) : null}

      {/* Error */}
      {isError && "error" in tool.state && tool.state.error ? (
        <div className="space-y-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Error
          </h4>
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {String(tool.state.error)}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Derive a readable title for delegate / spawn_session tool headers.
 * Falls back to the raw tool name so callers always get a string.
 */
export function getDelegateToolTitle(tool: ToolPart): string {
  const input = "input" in tool.state ? tool.state.input : {}
  const description = input.description as string | undefined
  const agent = input.agent as string | undefined
  const route = input.route as string | undefined
  const isSpawn = tool.tool === "spawn_session"

  const base = description ?? (isSpawn ? "Spawn session" : "Delegate")
  return agent ? `${base} → ${agent}` : base
}

const DELEGATE_TOOLS = new Set(["delegate", "spawn_session"])

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
