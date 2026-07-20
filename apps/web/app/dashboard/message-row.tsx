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
} from "@/lib/projectflows"
import { ToolCallCard } from "@/components/ai-elements/tool-call-card"
import { getAgentColor } from "@/lib/agent-colors"
import { BellIcon, CopyIcon, EyeIcon, EyeOffIcon, Link2Icon, Volume2Icon, VolumeXIcon } from "lucide-react"
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
  const content = getMessageText(parts)
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
                {msgIndex > 0 && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-0 h-[10px] w-[2px]"
                    style={{ backgroundColor: userRingColor, opacity: 0.55 }}
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
                    className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: userRingColor }}
                  />
                </button>
                {msgIndex < messagesLength - 1 && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-[26px] w-[2px]"
                    style={{ backgroundColor: userRingColor, opacity: 0.55, bottom: '-2rem' }}
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
                      <div className={cn("relative self-stretch", (stepConnectsToNext || (isLastStep && msgIndex < messagesLength - 1)) && "pb-3")}>
                        {isFirstStep && msgIndex > 0 && (
                          <div
                            className="absolute left-1/2 -translate-x-1/2 top-0 h-[6px] w-[2px]"
                            style={{ backgroundColor: assistantMessageColor, opacity: 0.55 }}
                            aria-hidden="true"
                          />
                        )}
                        {stepConnectsToNext ? (
                          <div
                            className="absolute left-1/2 top-[22px] bottom-0 w-[2px] -translate-x-1/2"
                            style={{ backgroundColor: assistantMessageColor, opacity: 0.55 }}
                            aria-hidden="true"
                          />
                        ) : (isLastStep && msgIndex < messagesLength - 1) ? (
                          <div
                            className="absolute left-1/2 -translate-x-1/2 top-[22px] w-[2px]"
                            style={{ backgroundColor: assistantMessageColor, opacity: 0.55, bottom: '-2rem' }}
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
                            className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                            style={{ backgroundColor: assistantMessageColor }}
                          />
                        </div>
                      </div>
                      <div className={cn("min-w-0", (stepConnectsToNext || (isLastStep && msgIndex < messagesLength - 1)) && "pb-3")}>
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
                        {step.kind === "tool" ? (
                          <ToolCallCard
                            tool={step.content}
                            isWorkflowMessage={isWorkflowMessage}
                            questionRequests={questionRequests}
                            replyQuestion={replyQuestion}
                            rejectQuestion={rejectQuestion}
                            questionViewModes={questionViewModes}
                            setQuestionViewModes={setQuestionViewModes}
                            permissionRequests={permissionRequests}
                            replyPermission={replyPermission}
                            sessions={sessions}
                            selectSession={selectSession}
                            handleGoToMessage={handleGoToMessage}
                            delegateViewModes={delegateViewModes}
                            setDelegateViewModes={setDelegateViewModes}
                            todoViewModes={todoViewModes}
                            setTodoViewModes={setTodoViewModes}
                            sessionTreeViewModes={sessionTreeViewModes}
                            setSessionTreeViewModes={setSessionTreeViewModes}
                            webfetchViewModes={webfetchViewModes}
                            setWebfetchViewModes={setWebfetchViewModes}
                            webPreviewOpen={webPreviewOpen}
                            toggleWebPreview={toggleWebPreview}
                            setWebPreviewUrl={setWebPreviewUrl}
                            openFilePreview={openFilePreview}
                          />
                        ) : null}
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
                    {tools.map((tool) => (
                      <ToolCallCard
                        key={tool.id}
                        tool={tool}
                        isWorkflowMessage={isWorkflowMessage}
                        questionRequests={questionRequests}
                        replyQuestion={replyQuestion}
                        rejectQuestion={rejectQuestion}
                        questionViewModes={questionViewModes}
                        setQuestionViewModes={setQuestionViewModes}
                        permissionRequests={permissionRequests}
                        replyPermission={replyPermission}
                        sessions={sessions}
                        selectSession={selectSession}
                        handleGoToMessage={handleGoToMessage}
                        delegateViewModes={delegateViewModes}
                        setDelegateViewModes={setDelegateViewModes}
                        todoViewModes={todoViewModes}
                        setTodoViewModes={setTodoViewModes}
                        sessionTreeViewModes={sessionTreeViewModes}
                        setSessionTreeViewModes={setSessionTreeViewModes}
                        webfetchViewModes={webfetchViewModes}
                        setWebfetchViewModes={setWebfetchViewModes}
                        webPreviewOpen={webPreviewOpen}
                        toggleWebPreview={toggleWebPreview}
                        setWebPreviewUrl={setWebPreviewUrl}
                        openFilePreview={openFilePreview}
                      />
                    ))}
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
