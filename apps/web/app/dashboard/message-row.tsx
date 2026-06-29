"use client"

import React from "react"

import {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
} from "@/components/ai-elements/attachments"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { QuestionTool } from "@/components/questions/question-tool"
import { PermissionTool } from "@/components/permissions/permission-tool"
import { ModelSwitchCard } from "@/components/ai-elements/model-switch-card"
import type {
  AssistantMessage,
  UserMessage,
  Part,
  Session,
  Agent,
  Schedule,
  QuestionRequest,
  QuestionAnswer,
  PermissionRequest,
  PermissionReply,
  EntryEdge,
} from "@/lib/opendora"
import { DelegateToolContent, isDelegateTool, getDelegateToolTitle } from "@/components/ai-elements/delegate-tool"
import { TodoToolContent, isTodoTool, getTodoToolTitle } from "@/components/ai-elements/todo-tool"
import { SessionTreeToolContent, isSessionTreeTool, getSessionTreeToolTitle } from "@/components/ai-elements/session-tree-tool"
import { WebFetchToolContent, isWebFetchTool, getWebFetchToolTitle, getWebFetchUrl } from "@/components/ai-elements/webfetch-tool"
import { isSkillLoadTool, getSkillLoadToolTitle, getSkillLoadDefinition } from "@/components/ai-elements/skill-load-tool"
import { MemoryWriteToolContent, isMemoryWriteTool, getMemoryWriteToolTitle } from "@/components/ai-elements/memory-write-tool"
import { FormatSwitcher } from "@/components/ai-elements/format-switcher"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getAgentColor } from "@/lib/agent-colors"
import { BellIcon, CopyIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, Link2Icon, PanelRightIcon, Volume2Icon, VolumeXIcon, WorkflowIcon } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { ModelEntry } from "@/hooks/use-model-list"
import {
  getMessageText,
  getReasoningPart,
  getToolParts,
  getFileParts,
  getHiddenParts,
  getTimelineSteps,
  toToolState,
  formatToolPayload,
} from "./chatbot"

export type MessageRowProps = {
  info: AssistantMessage | UserMessage
  parts: Part[]
  msgIndex: number
  messagesLength: number
  status: "ready" | "submitted" | "streaming" | "error"
  sessions: Session[]
  sessionsById: Map<string, Session>
  agentsById: Map<string, Agent & { _id: string }>
  agentsByName: Map<string, Agent & { _id: string }>
  schedulesById: Map<string, Schedule>
  schedulesBySessionId: Map<string, Schedule>
  selectedSession: Session | null
  userDotColor: string
  agentDotColor: string
  playingId: string | null
  isTtsLoading: boolean
  isTtsEnabled: boolean
  handleCopy: (content: string) => void
  handleSpeak: (text: string, messageId: string) => void
  setOpenScheduleId: (id: string | null) => void
  handleGoToMessage: (sessionId: string, messageId: string) => void
  userName: string | null | undefined
  expandedContractParts: Record<string, boolean>
  setExpandedContractParts: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  questionViewModes: Record<string, "code" | "view">
  setQuestionViewModes: React.Dispatch<React.SetStateAction<Record<string, "code" | "view">>>
  delegateViewModes: Record<string, "code" | "view">
  setDelegateViewModes: React.Dispatch<React.SetStateAction<Record<string, "code" | "view">>>
  todoViewModes: Record<string, "code" | "view">
  setTodoViewModes: React.Dispatch<React.SetStateAction<Record<string, "code" | "view">>>
  sessionTreeViewModes: Record<string, "code" | "view">
  setSessionTreeViewModes: React.Dispatch<React.SetStateAction<Record<string, "code" | "view">>>
  webfetchViewModes: Record<string, "code" | "view">
  setWebfetchViewModes: React.Dispatch<React.SetStateAction<Record<string, "code" | "view">>>
  questionRequests: QuestionRequest[]
  replyQuestion: (requestID: string, answers: QuestionAnswer[]) => Promise<void>
  rejectQuestion: (requestID: string) => Promise<void>
  permissionRequests: PermissionRequest[]
  replyPermission: (requestID: string, reply: PermissionReply) => Promise<void>
  selectedAgent: string
  selectedModel: ModelEntry | undefined
  selectedGroupId: string | null
  modelGroups: { id: string; name: string; models: { providerID: string; modelID: string }[] }[]
  modelList: ModelEntry[]
  sessionRetryStatus: Record<string, { attempt: number; message: string; next: number }>
  webPreviewOpen: boolean
  toggleWebPreview: () => void
  setWebPreviewUrl: (url: string) => void
  openFilePreview: (path: string, label: string) => void
  selectSession: (id: string, agentIdHint?: string) => void
  incomingEdge?: EntryEdge
  outgoingEdge?: EntryEdge
}

function edgeLineClass(edge: EntryEdge | undefined): string {
  if (!edge) return "bg-border"
  // delegation: reply_to edge with metadata.delegation = true
  if (edge.type === "reply_to" && edge.metadata?.delegation) return "bg-orange-400/70"
  switch (edge.type) {
    case "contains": return "bg-purple-400/70"
    case "used": return "bg-orange-400/70"
    default: return "bg-border"
  }
}

export const MessageRow = React.memo(function MessageRow({
  info,
  parts,
  msgIndex,
  messagesLength,
  status,
  sessions,
  sessionsById,
  agentsById,
  agentsByName,
  schedulesById,
  schedulesBySessionId,
  selectedSession,
  userDotColor,
  agentDotColor,
  playingId,
  isTtsLoading,
  isTtsEnabled,
  handleCopy,
  handleSpeak,
  setOpenScheduleId,
  handleGoToMessage,
  userName,
  expandedContractParts,
  setExpandedContractParts,
  questionViewModes,
  setQuestionViewModes,
  delegateViewModes,
  setDelegateViewModes,
  todoViewModes,
  setTodoViewModes,
  sessionTreeViewModes,
  setSessionTreeViewModes,
  webfetchViewModes,
  setWebfetchViewModes,
  questionRequests,
  replyQuestion,
  rejectQuestion,
  permissionRequests,
  replyPermission,
  selectedModel,
  selectedGroupId,
  modelGroups,
  modelList,
  sessionRetryStatus,
  webPreviewOpen,
  toggleWebPreview,
  setWebPreviewUrl,
  openFilePreview,
  selectSession,
  incomingEdge,
  outgoingEdge,
}: MessageRowProps) {
  const rawContent = getMessageText(parts)
  // Strip the "user: NAME\n\n" attribution prefix added before sending so it doesn't leak into the bubble
  const content = info.role === "user"
    ? rawContent.replace(/^user: [^\n]+\n\n/, "")
    : rawContent
  const reasoning = getReasoningPart(parts)
  const tools = getToolParts(parts)
  const hasTools = tools.length > 0
  const hasCodeBlock = content.includes("```")
  const shouldUseFullWidth = hasTools || hasCodeBlock
  const msgError = info.role === "assistant" ? (info as AssistantMessage).error : undefined
  const hasTimeline = info.role === "assistant"
  const timelineSteps = hasTimeline ? getTimelineSteps(parts, msgError) : []
  const msgParentSessionID = info.role === "user"
    ? (info as UserMessage).parentSessionID
    : info.role === "assistant"
      ? (info as AssistantMessage).parentSessionID
      : undefined
  const msgParentMessageID = info.role === "user"
    ? (info as UserMessage).parentMessageID
    : info.role === "assistant"
      ? (info as AssistantMessage).parentMessageID
      : undefined
  const parentSession = msgParentSessionID ? sessionsById.get(msgParentSessionID) : undefined
  const parentAgentId = parentSession?.agentID
  const parentAgent = parentAgentId
    ? agentsById.get(parentAgentId) ?? agentsByName.get(parentAgentId)
    : undefined
  const hasLinkedParentMessage = msgParentSessionID !== undefined
  const msgDotColor = hasLinkedParentMessage
    ? (parentAgent ? getAgentColor((parentAgent as any).color).hex : undefined)
    : undefined
  const msgScheduleId = info.role === "user"
    ? (info as UserMessage).schedule_id
    : info.role === "assistant"
      ? (info as AssistantMessage).schedule_id
      : undefined
  const isSchedulerAssistant = info.role === "assistant" && (info as AssistantMessage).from?.kind === "scheduler"
  const isWorkflowMessage = info.role === "assistant" && (info as AssistantMessage).from?.kind === "service"
  const msgSchedule = msgScheduleId
    ? schedulesById.get(msgScheduleId)
    : isSchedulerAssistant && selectedSession?.id
      ? schedulesBySessionId.get(selectedSession.id)
      : undefined
  const userRingColor = msgSchedule
    ? getAgentColor(msgSchedule.color).hex
    : msgDotColor ?? userDotColor
  const sessionAgentId = selectedSession?.agentID
  const assistantAuthorId = info.role === "assistant"
    ? (info as AssistantMessage).from?.kind === "agent"
      ? (info as AssistantMessage).from?.id
      : (info as AssistantMessage).agent
    : undefined
  const assistantAgentId = info.role === "assistant"
    ? (info as AssistantMessage).agent ?? assistantAuthorId
    : undefined
  const assistantAgent = assistantAgentId
    ? agentsById.get(assistantAgentId) ?? agentsByName.get(assistantAgentId)
    : undefined
  const assistantAuthor = assistantAuthorId
    ? agentsById.get(assistantAuthorId) ?? agentsByName.get(assistantAuthorId)
    : assistantAgent
  const isAssistantContribution =
    info.role === "assistant" &&
    !!assistantAuthorId &&
    !!sessionAgentId &&
    assistantAuthorId !== sessionAgentId
  const assistantContributionColor = assistantAuthor
    ? getAgentColor((assistantAuthor as any).color).hex
    : undefined
  const schedulerColor = (isSchedulerAssistant && msgSchedule)
    ? getAgentColor(msgSchedule.color).hex
    : undefined
  const assistantMessageColor = schedulerColor ?? assistantContributionColor ?? agentDotColor
  return (
    <div key={info.id} id={`msg-${info.id}`} className={cn(hasTimeline && "w-full")}>
    <MessageBranch defaultBranch={0}>
      <MessageBranchContent>
        <Message
          className={cn(
            "group/message",
            shouldUseFullWidth && info.role === "assistant" && "max-w-full"
          )}
          style={info.role === "user" ? { marginLeft: 0 } : undefined}
          from={info.role === "user" ? "user" : "assistant"}
          key={info.id}
        >
          {info.role === "user" ? (
            <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3">
              <div className="relative self-stretch">
                {incomingEdge && (
                  <div
                    className={cn("absolute left-1/2 -translate-x-1/2 top-0 h-[10px] w-px", edgeLineClass(incomingEdge))}
                    aria-hidden="true"
                  />
                )}
                <button
                  className="absolute left-1/2 top-[10px] size-4 -translate-x-1/2 rounded-full"
                  style={{ outline: "none" }}
                  title={msgSchedule ? `Scheduled: ${msgSchedule.cron_expression}` : undefined}
                  onClick={msgSchedule ? () => setOpenScheduleId(msgSchedule.id) : undefined}
                >
                  <div
                    className="absolute inset-0 rounded-full border-2"
                    style={{ borderColor: userRingColor }}
                  />
                  <div
                    className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: userRingColor }}
                  />
                </button>
                {outgoingEdge && (
                  <div
                    className={cn("absolute left-1/2 -translate-x-1/2 top-[26px] bottom-0 w-px", edgeLineClass(outgoingEdge))}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <MessageContent className="!ml-0">
                  {(() => {
                    const fileParts = getFileParts(parts)
                    const imageParts = fileParts.filter(fp => fp.mime?.startsWith("image/"))
                    const nonImageParts = fileParts.filter(fp => !fp.mime?.startsWith("image/"))

                    return (
                      <>
                        {imageParts.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {imageParts.map((fp) => (
                              <img
                                key={fp.id}
                                src={fp.url}
                                alt={fp.filename ?? "image"}
                                className="max-h-32 max-w-full rounded-lg object-contain"
                              />
                            ))}
                          </div>
                        )}
                        {content ? <MessageResponse>{content}</MessageResponse> : null}
                        {nonImageParts.length > 0 && (
                          <div className="mt-2">
                            <Attachments variant="inline">
                              {nonImageParts.map((fp) => (
                                <Attachment
                                  key={fp.id}
                                  data={{
                                    type: "file",
                                    id: fp.id,
                                    url: fp.url,
                                    filename: fp.filename,
                                    mediaType: fp.mime,
                                  } as any}
                                >
                                  <AttachmentPreview />
                                  <AttachmentInfo />
                                </Attachment>
                              ))}
                            </Attachments>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </MessageContent>
                <MessageActions
                  className="relative mt-1 w-full invisible opacity-0 group-hover/message:visible group-hover/message:opacity-100 transition-all"
                  data-message-actions
                >
                  {content && (
                    <MessageAction
                      label="Copy"
                      onClick={() => handleCopy(content)}
                      tooltip="Copy to clipboard"
                      variant="outline"
                    >
                      <CopyIcon className="size-4" />
                    </MessageAction>
                  )}
                  {content && isTtsEnabled && (
                    <MessageAction
                      label={playingId === info.id ? "Stop" : "Listen"}
                      onClick={() => handleSpeak(content, info.id)}
                      tooltip={playingId === info.id ? "Stop speaking" : "Read aloud"}
                      variant="outline"
                      disabled={isTtsLoading && playingId === info.id}
                    >
                      {isTtsLoading && playingId === info.id ? (
                        <Spinner className="size-4" />
                      ) : playingId === info.id ? (
                        <VolumeXIcon className="size-4" />
                      ) : (
                        <Volume2Icon className="size-4" />
                      )}
                    </MessageAction>
                  )}
                  {msgParentSessionID && (
                    <MessageAction
                      label="Source"
                      onClick={() => handleGoToMessage(msgParentSessionID, msgParentMessageID ?? "")}
                      tooltip="Back to source"
                      variant="outline"
                    >
                      <Link2Icon className="size-4" />
                    </MessageAction>
                  )}
                  {msgSchedule && (
                    <MessageAction
                      label="Schedule"
                      onClick={() => setOpenScheduleId(msgSchedule.id)}
                      tooltip="View schedule settings"
                      variant="outline"
                    >
                      <BellIcon className="size-4" />
                    </MessageAction>
                  )}
                  {getHiddenParts(parts).length > 0 && (
                    <MessageAction
                      label="Contract"
                      onClick={() => setExpandedContractParts(prev => ({ ...prev, [info.id]: !prev[info.id] }))}
                      tooltip={expandedContractParts[info.id] ? "Hide delegation contract" : "Show delegation contract"}
                      variant="outline"
                    >
                      {expandedContractParts[info.id]
                        ? <EyeOffIcon className="size-4" />
                        : <EyeIcon className="size-4" />
                      }
                    </MessageAction>
                  )}
                  <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs text-muted-foreground whitespace-nowrap">
                    {msgSchedule ? "scheduler" : "user"}{userName ? `: ${userName}` : ""}
                  </span>
                </MessageActions>
                {expandedContractParts[info.id] && getHiddenParts(parts).length > 0 && (
                  <div className="rounded border border-dashed bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                    {getHiddenParts(parts).map(p => p.text).join("\n")}
                  </div>
                )}
              </div>
            </div>
          ) : (
          <div>
            {hasTimeline ? (
              <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3">
                {timelineSteps.map((step, stepIndex) => {
                  // Line only connects steps within this same reply — never crosses message boundaries
                  const stepConnectsToNext = stepIndex < timelineSteps.length - 1
                  const isFirstStep = stepIndex === 0
                  const isLastStep = stepIndex === timelineSteps.length - 1
                  const isActiveDot =
                    status === "streaming" &&
                    msgIndex === messagesLength - 1 &&
                    isLastStep

                  return (
                    <div key={step.key} className="contents">
                      <div className={cn("relative self-stretch", (stepConnectsToNext || (isLastStep && outgoingEdge)) && "pb-3")}>
                        {isFirstStep && incomingEdge && (
                          <div
                            className={cn("absolute left-1/2 -translate-x-1/2 top-0 h-[6px] w-px", edgeLineClass(incomingEdge))}
                            aria-hidden="true"
                          />
                        )}
                        {stepConnectsToNext ? (
                          <div
                            className="absolute left-1/2 top-[22px] bottom-0 w-px -translate-x-1/2 bg-border"
                            aria-hidden="true"
                          />
                        ) : (isLastStep && outgoingEdge) ? (
                          <div
                            className={cn("absolute left-1/2 -translate-x-1/2 top-[22px] bottom-0 w-px", edgeLineClass(outgoingEdge))}
                            aria-hidden="true"
                          />
                        ) : null}
                        <div className="absolute left-1/2 top-[6px] size-4 -translate-x-1/2">
                          {isActiveDot && (
                            <div
                              className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                              style={{ borderTopColor: assistantMessageColor }}
                              aria-hidden="true"
                            />
                          )}
                          <div
                            className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                            style={{ backgroundColor: assistantMessageColor }}
                          />
                        </div>
                      </div>
                      <div className={cn("min-w-0", (stepConnectsToNext || (isLastStep && outgoingEdge)) && "pb-3")}>
                        {step.kind === "reasoning" ? (
                          <Reasoning
                            duration={
                              step.content.time?.end && step.content.time?.start
                                ? step.content.time.end - step.content.time.start
                                : undefined
                            }
                          >
                            <ReasoningTrigger />
                            <ReasoningContent>{step.content.text}</ReasoningContent>
                          </Reasoning>
                        ) : null}
                        {step.kind === "fallback-switch" ? (() => {
                          const groupDef = modelGroups.find(g => g.id === step.content.groupID)
                          return (
                            <ModelSwitchCard
                              fallbackGroup={groupDef ? {
                                id: groupDef.id,
                                name: groupDef.name,
                                slots: groupDef.models.map(m => ({ providerID: m.providerID, modelID: m.modelID, modelName: modelList.find(ml => ml.providerID === m.providerID && ml.modelID === m.modelID)?.modelName })),
                              } : undefined}
                              currentSlot={step.content.newSlot}
                              failedSlots={step.allFailedSlots}
                              retryAttempt={sessionRetryStatus[selectedSession?.id ?? ""]?.attempt}
                              retryDelay={sessionRetryStatus[selectedSession?.id ?? ""]?.next ? sessionRetryStatus[selectedSession?.id ?? ""]!.next - Date.now() : undefined}
                            />
                          )
                        })() : null}
                        {step.kind === "tool" ? (() => {
                          const tool = step.content
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
                          const handleViewModeChange = (mode: "code" | "view") => {
                            setQuestionViewModes(prev => ({ ...prev, [tool.id]: mode }))
                          }
                          const isDelegateToolCall = isDelegateTool(tool.tool)
                          const currentDelegateViewMode = delegateViewModes[tool.id] ?? "view"
                          const handleDelegateViewModeChange = (mode: "code" | "view") => {
                            setDelegateViewModes(prev => ({ ...prev, [tool.id]: mode }))
                          }
                          const isTodoToolCall = isTodoTool(tool.tool)
                          const currentTodoViewMode = todoViewModes[tool.id] ?? "view"
                          const handleTodoViewModeChange = (mode: "code" | "view") => {
                            setTodoViewModes(prev => ({ ...prev, [tool.id]: mode }))
                          }
                          const isSessionTreeToolCall = isSessionTreeTool(tool.tool)
                          const currentSessionTreeViewMode = sessionTreeViewModes[tool.id] ?? "view"
                          const handleSessionTreeViewModeChange = (mode: "code" | "view") => {
                            setSessionTreeViewModes(prev => ({ ...prev, [tool.id]: mode }))
                          }
                          const isWebFetchToolCall = isWebFetchTool(tool.tool)
                          const currentWebFetchViewMode = webfetchViewModes[tool.id] ?? "code"
                          const handleWebFetchViewModeChange = (mode: "code" | "view") => {
                            setWebfetchViewModes(prev => ({ ...prev, [tool.id]: mode }))
                          }
                          const webFetchToolUrl = isWebFetchToolCall ? getWebFetchUrl(tool) : undefined
                          const isSkillLoadToolCall = isSkillLoadTool(tool.tool)
                          const skillLoadDefinitionPath = isSkillLoadToolCall ? getSkillLoadDefinition(tool) : undefined
                          const isMemoryWriteToolCall = isMemoryWriteTool(tool.tool)
                          const webFetchActions = isWebFetchToolCall ? (
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
                          ) : isSkillLoadToolCall && skillLoadDefinitionPath ? (
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

                          return (
                            <Tool defaultOpen={isMemoryWriteToolCall}>
                              <ToolHeader
                                state={state}
                                title={isDelegateToolCall ? getDelegateToolTitle(tool) : isTodoToolCall ? getTodoToolTitle(tool) : isSessionTreeToolCall ? getSessionTreeToolTitle(tool) : isWebFetchToolCall ? getWebFetchToolTitle(tool) : isSkillLoadToolCall ? getSkillLoadToolTitle(tool) : isMemoryWriteToolCall ? getMemoryWriteToolTitle(tool) : tool.tool}
                                toolName={tool.tool}
                                type="dynamic-tool"
                                viewMode={questionRequest ? currentViewMode : isDelegateToolCall ? currentDelegateViewMode : isTodoToolCall ? currentTodoViewMode : isSessionTreeToolCall ? currentSessionTreeViewMode : isWebFetchToolCall ? currentWebFetchViewMode : undefined}
                                onViewChange={questionRequest ? handleViewModeChange : isDelegateToolCall ? handleDelegateViewModeChange : isTodoToolCall ? handleTodoViewModeChange : isSessionTreeToolCall ? handleSessionTreeViewModeChange : isWebFetchToolCall ? handleWebFetchViewModeChange : undefined}
                                hasView={!!questionRequest || isDelegateToolCall || isTodoToolCall || isSessionTreeToolCall || isWebFetchToolCall}
                                actions={retryBadge || webFetchActions ? <>{retryBadge}{webFetchActions}</> : undefined}
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
                                ) : isDelegateToolCall ? (
                                  currentDelegateViewMode === "code" ? toolInput : (
                                    <DelegateToolContent
                                      tool={tool}
                                      sessions={sessions}
                                      onSelectSession={selectSession}
                                      onGoToMessage={handleGoToMessage}
                                    />
                                  )
                                ) : isTodoToolCall ? (
                                  currentTodoViewMode === "code" ? toolInput : (
                                    <TodoToolContent tool={tool} />
                                  )
                                ) : isSessionTreeToolCall ? (
                                  currentSessionTreeViewMode === "code" ? toolInput : (
                                    <SessionTreeToolContent tool={tool} />
                                  )
                                ) : isWebFetchToolCall ? (
                                  currentWebFetchViewMode === "code" ? toolInput : (
                                    <WebFetchToolContent tool={tool} />
                                  )
                                ) : isMemoryWriteToolCall ? (
                                  <MemoryWriteToolContent tool={tool} />
                                ) : (
                                  toolInput
                                )}
                                {!isDelegateToolCall && !isTodoToolCall && !isSessionTreeToolCall && !isWebFetchToolCall && !isMemoryWriteToolCall && !questionRequest && (
                                  hasOutputObject
                                    ? <FormatSwitcher data={outputObject} displayProps={displayProps} renderLayout={renderLayout} />
                                    : (output || error) ? <ToolOutput errorText={error} output={output} /> : null
                                )}
                              </ToolContent>
                            </Tool>
                          )
                        })() : null}
                        {step.kind === "reply" ? (
                          <MessageContent className={shouldUseFullWidth ? "w-full" : undefined}>
                            {step.error ? (
                              <>
                                {((step.error.data as { message?: string })?.message?.toLowerCase().includes("provider") || (step.error.data as { message?: string })?.message?.toLowerCase().includes("rate limit")) ? (
                                  <ModelSwitchCard
                                    fallbackGroup={selectedGroupId && modelGroups.find(g => g.id === selectedGroupId) ? {
                                      id: selectedGroupId,
                                      name: modelGroups.find(g => g.id === selectedGroupId)!.name,
                                      slots: modelGroups.find(g => g.id === selectedGroupId)!.models.map(m => ({ providerID: m.providerID, modelID: m.modelID, modelName: modelList.find(ml => ml.providerID === m.providerID && ml.modelID === m.modelID)?.modelName })),
                                    } : undefined}
                                    currentSlot={selectedModel ? { providerID: selectedModel.providerID, modelID: selectedModel.modelID, modelName: selectedModel.modelName } : undefined}
                                    failedSlots={selectedModel ? [{
                                      providerID: selectedModel.providerID,
                                      modelID: selectedModel.modelID,
                                    }] : []}
                                    errorMessage={(step.error.data as { message?: string })?.message ?? step.error.name}
                                    retryAttempt={sessionRetryStatus[selectedSession?.id ?? ""]?.attempt}
                                    retryDelay={sessionRetryStatus[selectedSession?.id ?? ""]?.next ? sessionRetryStatus[selectedSession?.id ?? ""]!.next - Date.now() : undefined}
                                  />
                                ) : (
                                  <p className="text-destructive text-sm">
                                    {String((step.error.data as { message?: string })?.message ?? step.error.name)}
                                  </p>
                                )}
                              </>
                            ) : null}
                            {step.content ? <MessageResponse>{step.content}</MessageResponse> : null}
                          </MessageContent>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <>
                {reasoning && (
                  <Reasoning
                    duration={
                      reasoning.time?.end && reasoning.time?.start
                        ? reasoning.time.end - reasoning.time.start
                        : undefined
                    }
                  >
                    <ReasoningTrigger />
                    <ReasoningContent>{reasoning.text}</ReasoningContent>
                  </Reasoning>
                )}
                {msgError ? (
                  <MessageContent className={shouldUseFullWidth ? "w-full" : undefined}>
                    <ModelSwitchCard
                      fallbackGroup={selectedGroupId && modelGroups.find(g => g.id === selectedGroupId) ? {
                        id: selectedGroupId,
                        name: modelGroups.find(g => g.id === selectedGroupId)!.name,
                        slots: modelGroups.find(g => g.id === selectedGroupId)!.models.map(m => ({ providerID: m.providerID, modelID: m.modelID, modelName: modelList.find(ml => ml.providerID === m.providerID && ml.modelID === m.modelID)?.modelName })),
                      } : undefined}
                      currentSlot={selectedModel ? { providerID: selectedModel.providerID, modelID: selectedModel.modelID, modelName: selectedModel.modelName } : undefined}
                      failedSlots={selectedModel ? [{
                        providerID: selectedModel.providerID,
                        modelID: selectedModel.modelID,
                      }] : []}
                      errorMessage={(msgError?.data as { message?: string })?.message ?? msgError?.name}
                      retryAttempt={sessionRetryStatus[selectedSession?.id ?? ""]?.attempt}
                      retryDelay={sessionRetryStatus[selectedSession?.id ?? ""]?.next ? sessionRetryStatus[selectedSession?.id ?? ""]!.next - Date.now() : undefined}
                    />
                  </MessageContent>
                ) : (
                  <MessageContent className={shouldUseFullWidth ? "w-full" : undefined}>
                    {tools.map((tool) => {
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
                      const state = toToolState(toolState.status, hasPermissionRequest)
                      const retryAttemptNum = toolState.status === "running" && "metadata" in toolState ? (toolState.metadata as any)?.attempt as number | undefined : undefined
                      const retryBadge = retryAttemptNum !== undefined && retryAttemptNum > 1
                        ? <span className="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">↻{retryAttemptNum}</span>
                        : undefined
                      const toolInput = <ToolInput input={input ?? {}} />
                      const currentViewMode = questionViewModes[tool.id] ?? "view"
                      const handleViewModeChange = (mode: "code" | "view") => {
                        setQuestionViewModes(prev => ({ ...prev, [tool.id]: mode }))
                      }
                      const isDelegateToolCall = isDelegateTool(tool.tool)
                      const currentDelegateViewMode = delegateViewModes[tool.id] ?? "view"
                      const handleDelegateViewModeChange = (mode: "code" | "view") => {
                        setDelegateViewModes(prev => ({ ...prev, [tool.id]: mode }))
                      }
                      const isTodoToolCall = isTodoTool(tool.tool)
                      const currentTodoViewMode = todoViewModes[tool.id] ?? "view"
                      const handleTodoViewModeChange = (mode: "code" | "view") => {
                        setTodoViewModes(prev => ({ ...prev, [tool.id]: mode }))
                      }
                      const isSessionTreeToolCall = isSessionTreeTool(tool.tool)
                      const currentSessionTreeViewMode = sessionTreeViewModes[tool.id] ?? "view"
                      const handleSessionTreeViewModeChange = (mode: "code" | "view") => {
                        setSessionTreeViewModes(prev => ({ ...prev, [tool.id]: mode }))
                      }
                      const isWebFetchToolCall = isWebFetchTool(tool.tool)
                      const currentWebFetchViewMode = webfetchViewModes[tool.id] ?? "code"
                      const handleWebFetchViewModeChange = (mode: "code" | "view") => {
                        setWebfetchViewModes(prev => ({ ...prev, [tool.id]: mode }))
                      }
                      const webFetchToolUrl = isWebFetchToolCall ? getWebFetchUrl(tool) : undefined
                      const isSkillLoadToolCall = isSkillLoadTool(tool.tool)
                      const skillLoadDefinitionPath = isSkillLoadToolCall ? getSkillLoadDefinition(tool) : undefined
                      const isMemoryWriteToolCall = isMemoryWriteTool(tool.tool)
                      const webFetchActions = isWebFetchToolCall ? (
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
                      ) : isSkillLoadToolCall && skillLoadDefinitionPath ? (
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
                      return (
                        <Tool
                          defaultOpen={isMemoryWriteToolCall}
                          key={tool.id}
                        >
                          <ToolHeader
                            state={state}
                            title={isDelegateToolCall ? getDelegateToolTitle(tool) : isTodoToolCall ? getTodoToolTitle(tool) : isSessionTreeToolCall ? getSessionTreeToolTitle(tool) : isWebFetchToolCall ? getWebFetchToolTitle(tool) : isSkillLoadToolCall ? getSkillLoadToolTitle(tool) : isMemoryWriteToolCall ? getMemoryWriteToolTitle(tool) : tool.tool}
                            toolName={tool.tool}
                            type="dynamic-tool"
                            viewMode={questionRequest ? currentViewMode : isDelegateToolCall ? currentDelegateViewMode : isTodoToolCall ? currentTodoViewMode : isSessionTreeToolCall ? currentSessionTreeViewMode : isWebFetchToolCall ? currentWebFetchViewMode : undefined}
                            onViewChange={questionRequest ? handleViewModeChange : isDelegateToolCall ? handleDelegateViewModeChange : isTodoToolCall ? handleTodoViewModeChange : isSessionTreeToolCall ? handleSessionTreeViewModeChange : isWebFetchToolCall ? handleWebFetchViewModeChange : undefined}
                            hasView={!!questionRequest || isDelegateToolCall || isTodoToolCall || isSessionTreeToolCall || isWebFetchToolCall}
                            actions={retryBadge || webFetchActions ? <>{retryBadge}{webFetchActions}</> : undefined}
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
                            ) : isDelegateToolCall ? (
                              currentDelegateViewMode === "code" ? toolInput : (
                                <DelegateToolContent
                                  tool={tool}
                                  sessions={sessions}
                                  onSelectSession={selectSession}
                                  onGoToMessage={handleGoToMessage}
                                />
                              )
                            ) : isTodoToolCall ? (
                              currentTodoViewMode === "code" ? toolInput : (
                                <TodoToolContent tool={tool} />
                              )
                            ) : isSessionTreeToolCall ? (
                              currentSessionTreeViewMode === "code" ? toolInput : (
                                <SessionTreeToolContent tool={tool} />
                              )
                            ) : isWebFetchToolCall ? (
                              currentWebFetchViewMode === "code" ? toolInput : (
                                <WebFetchToolContent tool={tool} />
                              )
                            ) : isMemoryWriteToolCall ? (
                              <MemoryWriteToolContent tool={tool} />
                            ) : (
                              toolInput
                            )}
                            {!isDelegateToolCall && !isTodoToolCall && !isSessionTreeToolCall && !isWebFetchToolCall && !isMemoryWriteToolCall && !questionRequest && !isPermissionTool && (
                              hasOutputObject
                                ? <FormatSwitcher data={outputObject} displayProps={displayProps} renderLayout={renderLayout} />
                                : (output || error) ? <ToolOutput errorText={error} output={output} /> : null
                            )}
                          </ToolContent>
                        </Tool>
                      )
                    })}
                    {content ? <MessageResponse>{content}</MessageResponse> : null}
                  </MessageContent>
                )}
              </>
            )}
            {info.role === "assistant" ? (
              <MessageActions
                className="relative mt-1 w-full invisible opacity-0 group-hover/message:visible group-hover/message:opacity-100 transition-all"
                data-message-actions
              >
                {content && (
                  <MessageAction
                    label="Copy"
                    onClick={() => handleCopy(content)}
                    tooltip="Copy to clipboard"
                    variant="outline"
                  >
                    <CopyIcon className="size-4" />
                  </MessageAction>
                )}
                {content && isTtsEnabled && (
                  <MessageAction
                    label={playingId === info.id ? "Stop" : "Listen"}
                    onClick={() => handleSpeak(content, info.id)}
                    tooltip={playingId === info.id ? "Stop speaking" : "Read aloud"}
                    variant="outline"
                    disabled={isTtsLoading && playingId === info.id}
                  >
                    {isTtsLoading && playingId === info.id ? (
                      <Spinner className="size-4" />
                    ) : playingId === info.id ? (
                      <VolumeXIcon className="size-4" />
                    ) : (
                      <Volume2Icon className="size-4" />
                    )}
                  </MessageAction>
                )}
                {msgParentSessionID && (
                  <MessageAction
                    label="Source"
                    onClick={() => handleGoToMessage(msgParentSessionID, msgParentMessageID ?? "")}
                    tooltip="Back to source"
                    variant="outline"
                  >
                    <Link2Icon className="size-4" />
                  </MessageAction>
                )}
                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs text-muted-foreground max-w-[80%] truncate">
                  {isSchedulerAssistant
                    ? `scheduler${userName ? `: ${userName}` : ""}`
                    : (() => {
                        const displayName = assistantAuthor?.name ?? assistantAgent?.name ?? assistantAuthorId ?? assistantAgentId
                        return `agent${displayName ? `: ${displayName}` : ""}`
                      })()
                  }
                </span>
              </MessageActions>
            ) : null}
          </div>
          )}
        </Message>
      </MessageBranchContent>
    </MessageBranch>
    </div>
  )
})
