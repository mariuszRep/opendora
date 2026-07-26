"use client"

import type { ReactNode } from "react"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./tool"
import { QuestionTool } from "@/components/questions/question-tool"
import { PermissionTool } from "@/components/permissions/permission-tool"
import { DelegateToolContent, isDelegateTool, getDelegateToolTitle } from "./delegate-tool"
import { TodoToolContent, isTodoTool, getTodoToolTitle } from "./todo-tool"
import { SessionTreeToolContent, isSessionTreeTool, getSessionTreeToolTitle } from "./session-tree-tool"
import { WebFetchToolContent, isWebFetchTool, getWebFetchToolTitle, getWebFetchUrl } from "./webfetch-tool"
import { isSkillLoadTool, getSkillLoadToolTitle, getSkillLoadDefinition } from "./skill-load-tool"
import { MemoryWriteToolContent, isMemoryWriteTool, getMemoryWriteToolTitle } from "./memory-write-tool"
import { ToolCardSections, buildToolCardSections } from "./format-switcher"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ExternalLinkIcon, PanelRightIcon, WorkflowIcon } from "lucide-react"
import { formatToolPayload, toToolState } from "@/app/dashboard/chatbot"
import type {
  ToolPart,
  Session,
  QuestionRequest,
  QuestionAnswer,
  PermissionRequest,
  PermissionReply,
} from "@/lib/projectflows"

type ViewMode = "code" | "view"

export type ToolCallCardProps = {
  tool: ToolPart
  isWorkflowMessage: boolean

  // question
  questionRequests: QuestionRequest[]
  replyQuestion: (requestID: string, answers: QuestionAnswer[]) => Promise<void>
  rejectQuestion: (requestID: string) => Promise<void>
  questionViewModes: Record<string, ViewMode>
  setQuestionViewModes: (updater: (prev: Record<string, ViewMode>) => Record<string, ViewMode>) => void

  // permission
  permissionRequests: PermissionRequest[]
  replyPermission: (requestID: string, reply: PermissionReply) => Promise<void>

  // delegate
  sessions: Session[]
  selectSession: (id: string, agentIdHint?: string) => void
  handleGoToMessage: (sessionId: string, messageId: string) => void
  delegateViewModes: Record<string, ViewMode>
  setDelegateViewModes: (updater: (prev: Record<string, ViewMode>) => Record<string, ViewMode>) => void
  activeSessions?: Set<string>

  // todo
  todoViewModes: Record<string, ViewMode>
  setTodoViewModes: (updater: (prev: Record<string, ViewMode>) => Record<string, ViewMode>) => void

  // session-tree
  sessionTreeViewModes: Record<string, ViewMode>
  setSessionTreeViewModes: (updater: (prev: Record<string, ViewMode>) => Record<string, ViewMode>) => void

  // webfetch
  webfetchViewModes: Record<string, ViewMode>
  setWebfetchViewModes: (updater: (prev: Record<string, ViewMode>) => Record<string, ViewMode>) => void
  webPreviewOpen: boolean
  toggleWebPreview: () => void
  setWebPreviewUrl: (url: string) => void

  // skill-load
  openFilePreview: (path: string, label: string) => void
}

/**
 * Renders a single tool call as a card: specialized interactive/custom views
 * (question, permission, delegate, todo, session-tree, webfetch, memory-write)
 * take priority; everything else falls through to the generic
 * Instructions/Parameters/Result sections (ToolCardSections). This is the one
 * shared implementation for both places a tool call gets rendered (a `step`-based
 * timeline entry and a flat `tools` array) — previously two ~165-line
 * near-duplicate blocks in message-row.tsx that had already silently drifted
 * from each other (see message-row.tsx history: one had a question-waiting state
 * tweak and the workflow icon the other lacked; one correctly excluded permission
 * tools from the generic Result section, the other didn't). This component
 * reconciles those into the more complete/correct behavior in both cases.
 */
export function ToolCallCard({
  tool,
  isWorkflowMessage,
  questionRequests,
  replyQuestion,
  rejectQuestion,
  questionViewModes,
  setQuestionViewModes,
  permissionRequests,
  replyPermission,
  sessions,
  selectSession,
  handleGoToMessage,
  delegateViewModes,
  setDelegateViewModes,
  activeSessions,
  todoViewModes,
  setTodoViewModes,
  sessionTreeViewModes,
  setSessionTreeViewModes,
  webfetchViewModes,
  setWebfetchViewModes,
  webPreviewOpen,
  toggleWebPreview,
  setWebPreviewUrl,
  openFilePreview,
}: ToolCallCardProps) {
  // Guard: legacy sessions stored state as a string ("result"/"call"); normalize to object
  const toolState = typeof tool.state === "object" && tool.state !== null ? tool.state : {} as typeof tool.state
  const input = "input" in toolState ? toolState.input : undefined
  const output = "output" in toolState ? formatToolPayload((toolState as any).output) : undefined
  const error = "error" in toolState ? formatToolPayload((toolState as any).error) : undefined
  const outputObject = "metadata" in toolState ? (toolState as any).metadata?.outputObject : undefined
  const hasOutputObject = outputObject !== undefined && outputObject !== null
  const renderLayout = "metadata" in toolState ? (toolState as any).metadata?.renderLayout : undefined
  const displayProps = "metadata" in toolState ? (toolState as any).metadata?.displayProps : undefined
  const answered =
    "metadata" in toolState && Array.isArray((toolState as any).metadata?.answers)
      ? ((toolState as any).metadata.answers as string[][])
      : undefined

  const questionRequest = tool.tool === "question"
    ? questionRequests.find((request) => request.tool?.callID === tool.callID) ?? (
        Array.isArray(input?.questions)
          ? {
              id: tool.callID,
              sessionID: tool.sessionID,
              questions: input.questions,
              tool: {
                messageID: tool.messageID,
                callID: tool.callID,
              },
            }
          : undefined
      )
    : undefined

  const permissionRequest = permissionRequests.find((request) => request.tool?.call_id === tool.callID)
  const hasPermissionRequest = !!permissionRequest
  const isPermissionTool = hasPermissionRequest
  const permissionResponded = toolState.status === "completed" || toolState.status === "error"
  // Question tools waiting for user input should show "Awaiting Approval" not "Running"
  const isQuestionWaiting = !!questionRequest && toolState.status === "running"
  const state = toToolState(toolState.status, hasPermissionRequest || isQuestionWaiting)
  const retryAttemptNum = toolState.status === "running" && "metadata" in toolState ? (toolState.metadata as any)?.attempt as number | undefined : undefined
  const retryBadge = retryAttemptNum !== undefined && retryAttemptNum > 1
    ? <span className="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">↻{retryAttemptNum}</span>
    : undefined
  const toolInput = <ToolInput input={input ?? {}} />

  const currentViewMode = questionViewModes[tool.id] ?? "view"
  const handleViewModeChange = (mode: ViewMode) => {
    setQuestionViewModes(prev => ({ ...prev, [tool.id]: mode }))
  }

  const webFetchToolUrl = isWebFetchTool(tool.tool) ? getWebFetchUrl(tool) : undefined
  const isSkillLoadToolCall = isSkillLoadTool(tool.tool)
  const skillLoadDefinitionPath = isSkillLoadToolCall ? getSkillLoadDefinition(tool) : undefined
  const isMemoryWriteToolCall = isMemoryWriteTool(tool.tool)

  // Tool types that toggle between a "view" (bespoke content) and "code" (raw
  // parameters) mode. Question/permission are excluded — they're request/response
  // flows, not a view-mode toggle over already-completed data. Skill-load and
  // memory-write are excluded too: skill-load has no toggle (falls through to the
  // generic section below, alongside its title/action), memory-write always shows
  // one fixed view.
  const viewToggleConfigs: {
    kind: string
    predicate: (toolName: string) => boolean
    currentMode: ViewMode
    setMode: (mode: ViewMode) => void
    getTitle: (t: ToolPart) => string
    renderContent: (t: ToolPart) => ReactNode
    renderActions?: () => ReactNode
  }[] = [
    {
      kind: "delegate",
      predicate: isDelegateTool,
      currentMode: delegateViewModes[tool.id] ?? "view",
      setMode: (mode) => setDelegateViewModes(prev => ({ ...prev, [tool.id]: mode })),
      getTitle: getDelegateToolTitle,
      renderContent: (t) => (
        <DelegateToolContent
          tool={t}
          sessions={sessions}
          onSelectSession={selectSession}
          onGoToMessage={handleGoToMessage}
          activeSessions={activeSessions}
        />
      ),
    },
    {
      kind: "todo",
      predicate: isTodoTool,
      currentMode: todoViewModes[tool.id] ?? "view",
      setMode: (mode) => setTodoViewModes(prev => ({ ...prev, [tool.id]: mode })),
      getTitle: getTodoToolTitle,
      renderContent: (t) => <TodoToolContent tool={t} />,
    },
    {
      kind: "session-tree",
      predicate: isSessionTreeTool,
      currentMode: sessionTreeViewModes[tool.id] ?? "view",
      setMode: (mode) => setSessionTreeViewModes(prev => ({ ...prev, [tool.id]: mode })),
      getTitle: getSessionTreeToolTitle,
      renderContent: (t) => <SessionTreeToolContent tool={t} />,
    },
    {
      kind: "webfetch",
      predicate: isWebFetchTool,
      currentMode: webfetchViewModes[tool.id] ?? "code",
      setMode: (mode) => setWebfetchViewModes(prev => ({ ...prev, [tool.id]: mode })),
      getTitle: getWebFetchToolTitle,
      renderContent: (t) => <WebFetchToolContent tool={t} />,
      renderActions: () => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div role="button" tabIndex={0} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded hover:bg-background/60" onClick={(e) => { e.stopPropagation(); if (webFetchToolUrl) { if (!webPreviewOpen) setWebPreviewUrl(webFetchToolUrl); toggleWebPreview() } }}>
                <PanelRightIcon className="size-4 text-muted-foreground" />
              </div>
            </TooltipTrigger>
            <TooltipContent>Open in Panel</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div role="button" tabIndex={0} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded hover:bg-background/60" onClick={(e) => { e.stopPropagation(); if (webFetchToolUrl) window.open(webFetchToolUrl, "_blank") }}>
                <ExternalLinkIcon className="size-4 text-muted-foreground" />
              </div>
            </TooltipTrigger>
            <TooltipContent>Open</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
    },
  ]

  const matchedToggle = viewToggleConfigs.find((c) => c.predicate(tool.tool))

  const skillLoadActions = isSkillLoadToolCall && skillLoadDefinitionPath ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div role="button" tabIndex={0} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded hover:bg-background/60" onClick={(e) => { e.stopPropagation(); openFilePreview(skillLoadDefinitionPath, skillLoadDefinitionPath) }}>
            <PanelRightIcon className="size-4 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent>Open in Panel</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : undefined

  const title = matchedToggle ? matchedToggle.getTitle(tool)
    : isSkillLoadToolCall ? getSkillLoadToolTitle(tool)
    : isMemoryWriteToolCall ? getMemoryWriteToolTitle(tool)
    : tool.tool

  const actionsContent = matchedToggle?.renderActions?.() ?? skillLoadActions
  const hasGenericContent = !matchedToggle && !isMemoryWriteToolCall && !questionRequest && !(isPermissionTool && permissionRequest)

  return (
    <Tool defaultOpen={isMemoryWriteToolCall}>
      <ToolHeader
        state={state}
        title={title}
        toolName={tool.tool}
        type="dynamic-tool"
        viewMode={questionRequest ? currentViewMode : matchedToggle?.currentMode}
        onViewChange={questionRequest ? handleViewModeChange : matchedToggle?.setMode}
        hasView={!!questionRequest || !!matchedToggle}
        actions={retryBadge || actionsContent ? <>{retryBadge}{actionsContent}</> : undefined}
        icon={isWorkflowMessage ? WorkflowIcon : undefined}
      />
      <ToolContent>
        {questionRequest ? (
          <QuestionTool
            answered={answered}
            json={toolInput}
            onReject={rejectQuestion}
            onReply={replyQuestion}
            request={questionRequest}
            viewMode={currentViewMode}
            onViewModeChange={handleViewModeChange}
          />
        ) : isPermissionTool && permissionRequest ? (
          <PermissionTool
            request={permissionRequest}
            onReply={replyPermission}
            responded={permissionResponded}
          />
        ) : matchedToggle ? (
          matchedToggle.currentMode === "code" ? toolInput : matchedToggle.renderContent(tool)
        ) : isMemoryWriteToolCall ? (
          <MemoryWriteToolContent tool={tool} />
        ) : null}
        {hasGenericContent && (
          <>
            <ToolCardSections
              sections={buildToolCardSections(input, hasOutputObject ? outputObject : output)}
              displayProps={displayProps}
              renderLayout={renderLayout}
            />
            {error && <ToolOutput errorText={error} output={undefined} />}
          </>
        )}
      </ToolContent>
    </Tool>
  )
}
