"use client"

import type { Session, ToolPart } from "@/lib/projectflows"

import { ArrowRightIcon, BotIcon, ExternalLinkIcon, Loader2Icon, WorkflowIcon } from "lucide-react"

type DelegateAction = "create_session" | "message_session" | "reply_session" | "message" | "reply"

type DelegateMetadata = {
  sessionId?: string
  agent?: string
  messageId?: string
  /** @deprecated legacy delegate/reply tools — kept for old transcripts. Use `action` for agent__<id> calls. */
  kind?: "delegate" | "reply" | DelegateAction | string
  action?: DelegateAction
  mode?: "sync" | "async"
  created?: boolean
  sourceSessionId?: string
  /** workflow__<id> calls — see packages/tools/workflow-delegation/workflow-target.ts */
  workflowId?: string
  workflowName?: string
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
  /** Sessions whose agent loop is currently running — see use-projectflows.ts's activeSessions. */
  activeSessions?: Set<string>
}

export const DelegateToolContent = ({
  tool,
  sessions,
  onSelectSession,
  onGoToMessage,
  activeSessions,
}: DelegateToolContentProps) => {
  const input = "input" in tool.state ? tool.state.input : {}
  const metadata = getDelegateMetadata(tool)
  const isWorkflow = tool.tool.startsWith("workflow__")
  const action = metadata.action ?? (metadata.kind === "reply" ? "reply_session" : undefined)
  const isReply = action === "reply_session" || action === "reply"

  const prompt = input.prompt as string | undefined
  const description = input.description as string | undefined
  const replyMessage = input.message as string | undefined
  const inputAgent = input.agent as string | undefined
  // workflow__<id> calls carry structured `input` (parameter values), not a free-text prompt.
  const workflowInput =
    isWorkflow && input.input && typeof input.input === "object" && Object.keys(input.input).length > 0
      ? JSON.stringify(input.input)
      : undefined

  const agent = metadata.agent ?? inputAgent
  const workflowLabel =
    metadata.workflowName ?? metadata.workflowId ?? (isWorkflow ? tool.tool.slice("workflow__".length) : undefined)
  const sessionId = metadata.sessionId

  const targetSession = sessionId ? sessions.find((s) => s.id === sessionId) : undefined
  const sessionLabel =
    targetSession?.title ??
    (sessionId ? `Session ${sessionId.slice(0, 8)}…` : undefined)

  // Only meaningful for async calls — sync ones have already returned with a
  // final result by the time this renders, so the target session can't still
  // be running *this* turn even if it happens to be busy with something else.
  const isRunning = metadata.mode === "async" && !!sessionId && !!activeSessions?.has(sessionId)

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
      {/* Prompt / structured input */}
      {(prompt || replyMessage || workflowInput) && (
        <div className="px-3 py-2.5 space-y-0.5">
          <p className="text-xs text-muted-foreground">{isReply ? "Reply" : isWorkflow ? "Input" : "Message"}</p>
          <p className={isWorkflow ? "font-mono text-xs text-foreground leading-relaxed" : "text-sm text-foreground leading-relaxed"}>
            {replyMessage ?? prompt ?? workflowInput}
          </p>
        </div>
      )}

      {/* Agent/workflow + session row */}
      <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
        <div className="flex items-center gap-3 min-w-0">
          {isWorkflow ? (
            workflowLabel && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <WorkflowIcon className="size-3.5 shrink-0" />
                <span className="truncate">{workflowLabel}</span>
              </div>
            )
          ) : (
            agent && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BotIcon className="size-3.5 shrink-0" />
                <span className="truncate">{agent}</span>
              </div>
            )
          )}
          {sessionLabel && (
            <>
              {(isWorkflow ? workflowLabel : agent) && <span className="text-muted-foreground/40 text-xs">·</span>}
              <span className="truncate text-xs text-muted-foreground">{sessionLabel}</span>
            </>
          )}
          {isRunning && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Running…
            </span>
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
 * Derive a readable title for agent__<id> / workflow__<id> (and legacy delegate/reply)
 * tool headers. Falls back to the raw tool name so callers always get a string.
 */
export function getDelegateToolTitle(tool: ToolPart): string {
  const input = "input" in tool.state ? tool.state.input : {}
  const metadata = getDelegateMetadata(tool)

  if (tool.tool.startsWith("workflow__")) {
    const workflowLabel = metadata.workflowName ?? metadata.workflowId ?? tool.tool.slice("workflow__".length)
    return `Run → ${workflowLabel}`
  }

  const agentFromToolName = tool.tool.startsWith("agent__") ? tool.tool.slice("agent__".length) : undefined
  const agent = metadata.agent ?? (input.agent as string | undefined) ?? agentFromToolName

  const action = metadata.action ?? (metadata.kind === "reply" ? "reply_session" : undefined)
  if (action === "reply_session" || action === "reply" || tool.tool === "reply") {
    const sessionId = metadata.sessionId
    return sessionId ? `Reply → ${sessionId.slice(0, 8)}…` : "Reply"
  }

  // session_message has no baked-in target agent name — title by session id instead.
  if (tool.tool === "session_message") {
    const sessionId = metadata.sessionId
    return sessionId ? `Message → ${sessionId.slice(0, 8)}…` : "Message"
  }

  const description = input.description as string | undefined
  const base = description ?? (action === "message_session" ? "Message" : "Delegate")
  return agent ? `${base} → ${agent}` : base
}

const LEGACY_DELEGATE_TOOLS = new Set(["delegate", "reply"])
/** Static session-inspection tools that already set metadata.sessionId for their own,
 *  unrelated reason (the session they're inspecting, not one they spawned) — excluded
 *  from the metadata-driven fallback below so they keep their own (or generic) rendering. */
const SESSION_INSPECTION_TOOLS = new Set([
  "session_get",
  "session_tree",
  "session_status",
  "session_search",
  "session_analyze",
  "session_update",
])

export function isDelegateTool(toolName: string): boolean {
  return (
    toolName.startsWith("agent__") ||
    toolName.startsWith("workflow__") ||
    toolName === "session_message" ||
    LEGACY_DELEGATE_TOOLS.has(toolName)
  )
}

/**
 * Broader than isDelegateTool: also catches any tool call whose metadata carries a
 * sessionId, even if we don't recognize the tool name — so a future spawn-shaped tool
 * gets the standard "session link, visible immediately" treatment without needing this
 * file updated again, the way workflow__ and session_message both did. Excludes the
 * fixed set of session-inspection tools, which set sessionId for an unrelated reason and
 * already have (or should keep) their own rendering.
 */
export function hasSessionLink(tool: ToolPart): boolean {
  if (isDelegateTool(tool.tool)) return true
  if (SESSION_INSPECTION_TOOLS.has(tool.tool)) return false
  const metadata = getDelegateMetadata(tool)
  return typeof metadata.sessionId === "string" && metadata.sessionId.length > 0
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
  <div className="flex shrink-0 items-center gap-2 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
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
