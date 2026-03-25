"use client"

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input"

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
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
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector"
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { SpeechInput } from "@/components/ai-elements/speech-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"

import { QuestionTool } from "@/components/questions/question-tool"
import type { AssistantMessage, UserMessage, Part, ReasoningPart, TextPart, ToolPart } from "@/lib/opendora"
import { useVoiceSettings, formatHotkey } from "@/hooks/use-voice-settings"
import { useTextToSpeech } from "@/hooks/use-text-to-speech"
import { useVoiceRecorder } from "@/hooks/use-voice-recorder"
import { usePushToTalk } from "@/hooks/use-push-to-talk"
import { DelegateToolContent, isDelegateTool, getDelegateToolTitle } from "@/components/ai-elements/delegate-tool"
import { getAgentColor } from "@/lib/agent-colors"
import { CheckIcon, CopyIcon, Link2Icon, Volume2Icon, VolumeXIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

const suggestions = [
  "What files are in this project?",
  "Explain the project structure",
  "What does this codebase do?",
  "How do I get started?",
]

function getTextParts(parts: Part[]): TextPart[] {
  return parts.filter((p): p is TextPart => p.type === "text")
}

function getReasoningPart(parts: Part[]): ReasoningPart | undefined {
  return parts.find((p): p is ReasoningPart => p.type === "reasoning")
}

function getToolParts(parts: Part[]): ToolPart[] {
  return parts.filter((p): p is ToolPart => p.type === "tool")
}

function getMessageText(parts: Part[]): string {
  return getTextParts(parts).map((p) => p.text).join("")
}

function formatToolPayload(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toToolState(status: ToolPart["state"]["status"]) {
  switch (status) {
    case "pending":
      return "input-streaming"
    case "running":
      return "input-available"
    case "completed":
      return "output-available"
    case "error":
      return "output-error"
  }
}

type TimelineStep =
  | { key: string; kind: "reasoning"; content: ReasoningPart }
  | { key: string; kind: "tool"; content: ToolPart }
  | { key: string; kind: "reply"; content?: string; error?: AssistantMessage["error"] }

function getTimelineSteps(parts: Part[], error?: AssistantMessage["error"]): TimelineStep[] {
  const reasoning = getReasoningPart(parts)
  const tools = getToolParts(parts)
  const reply = getMessageText(parts)
  const steps: TimelineStep[] = []

  if (reasoning) {
    steps.push({ key: reasoning.id, kind: "reasoning", content: reasoning })
  }

  for (const tool of tools) {
    steps.push({ key: tool.id, kind: "tool", content: tool })
  }

  if (error || reply) {
    steps.push({ key: error ? "reply-error" : "reply-text", kind: "reply", content: reply, error })
  }

  return steps
}

type AssistantContributionBadgeProps = {
  agentName: string
}

const AssistantContributionBadge = ({ agentName }: AssistantContributionBadgeProps) => (
  <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground">
    {agentName}
  </span>
)

const AttachmentsDisplay = () => {
  const attachments = usePromptInputAttachments()
  if (attachments.files.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {attachments.files.map((f) => (
        <div key={f.id} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
          {(f as { name?: string }).name ?? "file"}
          <button onClick={() => attachments.remove(f.id)} className="ml-1 opacity-60 hover:opacity-100">×</button>
        </div>
      ))}
    </div>
  )
}

export const Chatbot = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    selectedSession,
    messages,
    questionRequests,
    replyQuestion,
    rejectQuestion,
    status,
    sendMessage,
    abort,
    error,
    agents,
    selectedAgent,
    providers,
    connectedProviders,
    defaultModels,
    refreshProviders,
    fallbackActiveSlots,
    modelFilters,
    createSession,
    updateAgent,
    isChatCentered,
    selectSession,
    sessions,
  } = useOpendoraContext()

  const { settings } = useVoiceSettings()
  const { speak, playingId, isLoading: isTtsLoading, isEnabled: isTtsEnabled, error: ttsError } = useTextToSpeech()

  useEffect(() => {
    if (ttsError) toast.error(`TTS: ${ttsError}`)
  }, [ttsError])
  const { isRecording, isTranscribing, startRecording, stopRecording } = useVoiceRecorder()
  const [autoVoiceNextMessage, setAutoVoiceNextMessage] = useState(false)
  const autoVoiceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const expectedAssistantMessageIdRef = useRef<string | null>(null)

  const [text, setText] = useState("")
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)
  const [selectedModelID, setSelectedModelID] = useState<string | null>(null)
  const [questionViewModes, setQuestionViewModes] = useState<Record<string, "code" | "view">>({})
  const [delegateViewModes, setDelegateViewModes] = useState<Record<string, "code" | "view">>({})

  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const agent = agents.find((a) => (a as any)._id === selectedAgent)
    if (agent?.model) {
      setSelectedProviderID(agent.model.providerID)
      setSelectedModelID(agent.model.modelID)
    } else {
      setSelectedProviderID(null)
      setSelectedModelID(null)
    }
  }, [selectedAgent, agents])

  // Focus input when a session is selected
  useEffect(() => {
    if (selectedSession && inputRef.current) {
      inputRef.current.focus()
    }
  }, [selectedSession])

  // Update agent's preferred model when user changes it in chat interface
  const updateAgentModel = useCallback(async (providerID: string, modelID: string) => {
    const agent = agents.find((a) => (a as any)._id === selectedAgent)
    if (!agent || !selectedAgent) return

    // Don't update if it's the same as the current agent model
    if (agent.model?.providerID === providerID && agent.model?.modelID === modelID) return

    try {
      await updateAgent(selectedAgent, {
        model: { providerID, modelID }
      })
    } catch (err) {
      console.error("Failed to update agent model:", err)
    }
  }, [selectedAgent, agents, updateAgent])

  const modelList = useMemo(() => {
    const isFreeModel = (m: { id: string; [k: string]: unknown }) => {
      const cost = (m as any).cost as { input: number; output: number } | undefined
      if (cost && cost.input === 0 && cost.output === 0) return true
      return m.id.endsWith(":free") || m.id.endsWith("-free")
    }
    const real = providers
      .filter((p) => connectedProviders.includes(p.id) && p.id !== "fallback")
      .flatMap((p) => {
        const filter = modelFilters[p.id] ?? "all"
        if (filter === "none") return []
        const models = Object.values(p.models)
        const filtered = filter === "free" ? models.filter(isFreeModel) : models
        return filtered.map((m) => ({
          providerID: p.id,
          providerName: p.name,
          modelID: m.id,
          modelName: (m as { name?: string }).name ?? m.id,
          isFallback: false,
        }))
      })
    const fallbackProvider = providers.find((p) => p.id === "fallback")
    const fallback = fallbackProvider
      ? Object.values(fallbackProvider.models).map((m) => ({
          providerID: "fallback",
          providerName: "Free Fallback Groups",
          modelID: m.id,
          modelName: (m as { name?: string }).name ?? m.id,
          isFallback: true,
        }))
      : []
    return [...real, ...fallback]
  }, [providers, connectedProviders, modelFilters])

  const selectedModel = useMemo(() => {
    if (selectedProviderID && selectedModelID)
      return modelList.find((m) => m.providerID === selectedProviderID && m.modelID === selectedModelID)
    const firstConnected = connectedProviders[0]
    if (!firstConnected) return undefined
    const defaultModel = defaultModels[firstConnected]
    return modelList.find((m) => m.providerID === firstConnected && m.modelID === defaultModel) ?? modelList[0]
  }, [selectedProviderID, selectedModelID, modelList, connectedProviders, defaultModels])

  const modelsByProvider = useMemo(() => {
    const groups = new Map<string, typeof modelList>()
    for (const m of modelList) {
      if (!groups.has(m.providerName)) groups.set(m.providerName, [])
      groups.get(m.providerName)!.push(m)
    }
    return groups
  }, [modelList])

  const agentDotColor = useMemo(() => {
    const agent = agents.find((a) => (a as any)._id === selectedAgent)
    return getAgentColor((agent as any)?.color).hex
  }, [agents, selectedAgent])

  const scrollToMessageIdRef = useRef<string | null>(null)

  const buildDashboardUrl = useCallback((sessionId: string, messageId?: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("session", sessionId)
    if (messageId) params.set("message", messageId)
    else params.delete("message")
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }, [pathname, searchParams])

  const handleGoToMessage = useCallback((sessionId: string, messageId: string) => {
    router.push(buildDashboardUrl(sessionId, messageId), { scroll: false })
    selectSession(sessionId)
    scrollToMessageIdRef.current = messageId
  }, [router, buildDashboardUrl, selectSession])

  useEffect(() => {
    const messageId = searchParams.get("message")
    if (!messageId) return
    scrollToMessageIdRef.current = messageId
  }, [searchParams])

  useEffect(() => {
    const targetId = scrollToMessageIdRef.current
    if (!targetId || !messages.length) return
    const el = document.getElementById(`msg-${targetId}`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      if (selectedSession?.id) {
        router.replace(buildDashboardUrl(selectedSession.id, null), { scroll: false })
      }
      scrollToMessageIdRef.current = null
    }
  }, [messages, router, buildDashboardUrl, selectedSession?.id])

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text?.trim()) return
      if (message.files?.length) {
        toast.info(`${message.files.length} file(s) attached`)
      }
      const model = selectedModel
        ? { providerID: selectedModel.providerID, modelID: selectedModel.modelID }
        : undefined
      const content = message.text
      setText("")
      const doSend = () => sendMessage(content, { model, agent: selectedAgent })
      if (!selectedSession) {
        createSession().then(doSend)
      } else {
        doSend()
      }
    },
    [sendMessage, selectedModel, selectedAgent, selectedSession, createSession],
  )

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      if (!selectedSession) {
        createSession().then(() => {
          const model = selectedModel
            ? { providerID: selectedModel.providerID, modelID: selectedModel.modelID }
            : undefined
          sendMessage(suggestion, { model, agent: selectedAgent })
        })
        return
      }
      const model = selectedModel
        ? { providerID: selectedModel.providerID, modelID: selectedModel.modelID }
        : undefined
      sendMessage(suggestion, { model, agent: selectedAgent })
    },
    [sendMessage, selectedModel, selectedAgent, selectedSession, createSession],
  )

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {})
  }, [])

  const handleSpeak = useCallback(
    (text: string, messageId: string) => {
      speak(text, messageId)
    },
    [speak]
  )

  // Handle push-to-talk stop with auto-voice
  const handlePushToTalkStop = useCallback(async () => {
    const transcription = await stopRecording()
    if (transcription) {
      // Enable auto-voice for the next assistant response
      setAutoVoiceNextMessage(true)
      
      // Clear any existing timeout
      if (autoVoiceTimeoutRef.current) {
        clearTimeout(autoVoiceTimeoutRef.current)
      }
      
      // Set a timeout to disable auto-voice after 3 minutes (covers long tool-call chains)
      autoVoiceTimeoutRef.current = setTimeout(() => {
        setAutoVoiceNextMessage(false)
        expectedAssistantMessageIdRef.current = null
      }, 3 * 60 * 1000)
      
      // Get the current message count to find the next assistant message
      const currentMessageCount = messages.length
      
      // Submit the transcribed message
      const model = selectedModel
        ? { providerID: selectedModel.providerID, modelID: selectedModel.modelID }
        : undefined
      
      // We'll identify the next assistant message by its position
      const doSend = () => {
        sendMessage(transcription, { model, agent: selectedAgent })
        // The next assistant message will be at position currentMessageCount + 1
        // We'll track this in the useEffect below
      }
      
      if (!selectedSession) {
        createSession().then(() => doSend())
      } else {
        doSend()
      }
    }
  }, [stopRecording, sendMessage, selectedModel, selectedAgent, selectedSession, createSession, messages.length])

  // Set up push-to-talk
  usePushToTalk({
    hotkey: settings.pushToTalk.hotkey,
    enabled: settings.pushToTalk.enabled && !isTranscribing && status !== "streaming",
    onStart: startRecording,
    onStop: handlePushToTalkStop,
    isActive: isRecording,
  })

  // Auto-voice assistant responses when enabled
  useEffect(() => {
    // Only trigger when auto-voice is enabled and we're not streaming
    if (!autoVoiceNextMessage || !isTtsEnabled || status === "streaming") return
    
    // Small delay to ensure the message is fully rendered
    const timer = setTimeout(() => {
      // Find the last assistant message
      const assistantMessages = messages.filter(m => m.info.role === "assistant")
      if (assistantMessages.length === 0) return
      
      const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]
      const content = getMessageText(lastAssistantMessage.parts)
      
      // Only speak if we have content and it's not already playing
      if (content && playingId !== lastAssistantMessage.info.id) {
        speak(content, lastAssistantMessage.info.id)
        setAutoVoiceNextMessage(false)
        expectedAssistantMessageIdRef.current = null
        if (autoVoiceTimeoutRef.current) {
          clearTimeout(autoVoiceTimeoutRef.current)
        }
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [status, messages, autoVoiceNextMessage, isTtsEnabled, playingId, speak])

  // Handler for STT with OpenAI Whisper
  const handleAudioRecorded = useCallback(async (audioBlob: Blob) => {
    try {
      const { opendora } = await import("@/lib/opendora")
      const result = await opendora.voice.stt(audioBlob)
      return result.text || ""
    } catch (error) {
      console.error("STT error:", error)
      const errorMessage = error instanceof Error ? error.message : "Transcription error"
      if (errorMessage.includes("not configured")) {
        toast.error("OpenAI not configured. Please connect OpenAI in Settings → Providers.")
      } else {
        toast.error("Transcription failed")
      }
      return ""
    }
  }, [])

  return (
    <div className="relative flex size-full flex-col divide-y overflow-hidden">
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-2 text-sm shrink-0">
          {error}
        </div>
      )}

      {!selectedSession ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Select a session from the sidebar or create a new one to start chatting.
          </p>
          <Suggestions>
            {suggestions.map((s) => (
              <Suggestion key={s} onClick={() => handleSuggestionClick(s)} suggestion={s} />
            ))}
          </Suggestions>
        </div>
      ) : (
        <Conversation>
          <ConversationContent className={cn(isChatCentered && "max-w-3xl mx-auto w-full")}>
            {messages.map(({ info, parts }, msgIndex) => {
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
              const parentSession = msgParentSessionID ? sessions.find((s) => s.id === msgParentSessionID) : undefined
              const parentAgentId = parentSession?.agentID
              const parentAgent = parentAgentId
                ? agents.find((a) => (a as any)._id === parentAgentId || a.name === parentAgentId)
                : undefined
              const hasLinkedParentMessage = msgParentSessionID !== undefined
              const msgDotColor = hasLinkedParentMessage
                ? (parentAgent ? getAgentColor((parentAgent as any).color).hex : undefined)
                : undefined
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
                ? agents.find((a) => (a as any)._id === assistantAgentId || a.name === assistantAgentId)
                : undefined
              const assistantAuthor = assistantAuthorId
                ? agents.find((a) => (a as any)._id === assistantAuthorId || a.name === assistantAuthorId)
                : assistantAgent
              const isAssistantContribution =
                info.role === "assistant" &&
                !!assistantAuthorId &&
                !!sessionAgentId &&
                assistantAuthorId !== sessionAgentId
              const assistantContributionColor = assistantAuthor
                ? getAgentColor((assistantAuthor as any).color).hex
                : undefined
              const assistantMessageColor = assistantContributionColor ?? agentDotColor
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
                      onMouseEnter={(e) => {
                        const messageActions = e.currentTarget.querySelector('[data-message-actions]') as HTMLElement
                        if (messageActions) {
                          messageActions.style.opacity = '1'
                          messageActions.style.visibility = 'visible'
                          messageActions.style.pointerEvents = 'auto'
                        }
                      }}
                      onMouseLeave={(e) => {
                        const messageActions = e.currentTarget.querySelector('[data-message-actions]') as HTMLElement
                        if (messageActions) {
                          messageActions.style.opacity = '0'
                          messageActions.style.visibility = 'hidden'
                          messageActions.style.pointerEvents = 'none'
                        }
                      }}
                    >
                      {info.role === "user" ? (
                        <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3">
                          <div className="relative self-stretch">
                            <div
                              className={cn("absolute left-1/2 top-[14px] size-2 -translate-x-1/2 rounded-full", !msgDotColor && "bg-muted-foreground/50")}
                              style={msgDotColor ? { backgroundColor: msgDotColor } : undefined}
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <MessageContent className="!ml-0">
                              {content ? <MessageResponse>{content}</MessageResponse> : null}
                            </MessageContent>
                            <MessageActions className="mt-1 justify-start" data-message-actions>
                              {msgParentSessionID && (
                                <MessageAction
                                  label="Source"
                                  onClick={() => handleGoToMessage(
                                    msgParentSessionID,
                                    msgParentMessageID ?? ""
                                  )}
                                  tooltip="Back to delegation tool"
                                  variant="outline"
                                >
                                  <Link2Icon className="size-4" />
                                </MessageAction>
                              )}
                            </MessageActions>
                          </div>
                        </div>
                      ) : (
                      <div>
                        {hasTimeline ? (
                          <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3">
                            {timelineSteps.map((step, stepIndex) => {
                              // Line only connects steps within this same reply — never crosses message boundaries
                              const stepConnectsToNext = stepIndex < timelineSteps.length - 1
                              const isActiveDot =
                                status === "streaming" &&
                                msgIndex === messages.length - 1 &&
                                stepIndex === timelineSteps.length - 1

                              return (
                                <div key={step.key} className="contents">
                                  <div className={cn("relative self-stretch", stepConnectsToNext && "pb-3")}>
                                    {stepConnectsToNext ? (
                                      <div
                                        className="absolute left-1/2 top-[22px] bottom-0 w-px -translate-x-1/2 bg-border"
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
                                  <div className={cn("min-w-0", stepConnectsToNext && "pb-3")}>
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
                                    {step.kind === "tool" ? (() => {
                                      const tool = step.content
                                      const input = "input" in tool.state ? tool.state.input : undefined
                                      const output = "output" in tool.state ? formatToolPayload(tool.state.output) : undefined
                                      const error = "error" in tool.state ? formatToolPayload(tool.state.error) : undefined
                                      const state = toToolState(tool.state.status)
                                      const answered =
                                        "metadata" in tool.state && Array.isArray(tool.state.metadata?.answers)
                                          ? (tool.state.metadata.answers as string[][])
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

                                      return (
                                        <Tool defaultOpen={isDelegateToolCall}>
                                          <ToolHeader
                                            state={state}
                                            title={questionRequest ? (questionRequest.questions[0]?.header ?? tool.tool) : isDelegateToolCall ? getDelegateToolTitle(tool) : tool.tool}
                                            centerTitle={!!questionRequest}
                                            toolName={tool.tool}
                                            type="dynamic-tool"
                                            viewMode={questionRequest ? currentViewMode : isDelegateToolCall ? currentDelegateViewMode : undefined}
                                            onViewChange={questionRequest ? handleViewModeChange : isDelegateToolCall ? handleDelegateViewModeChange : undefined}
                                            hasView={!!questionRequest || isDelegateToolCall}
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
                                            ) : isDelegateToolCall ? (
                                              currentDelegateViewMode === "code" ? toolInput : (
                                                <DelegateToolContent
                                                  tool={tool}
                                                  sessions={sessions}
                                                  onSelectSession={selectSession}
                                                  onGoToMessage={handleGoToMessage}
                                                />
                                              )
                                            ) : (
                                              toolInput
                                            )}
                                            {!isDelegateToolCall && !questionRequest && (output || error) ? (
                                              <ToolOutput errorText={error} output={output} />
                                            ) : null}
                                          </ToolContent>
                                        </Tool>
                                      )
                                    })() : null}
                                    {step.kind === "reply" ? (
                                      <MessageContent className={shouldUseFullWidth ? "w-full" : undefined}>
                                        {step.error ? (
                                          <p className="text-destructive text-sm">
                                            {String((step.error.data as { message?: string })?.message ?? step.error.name)}
                                          </p>
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
                                <p className="text-destructive text-sm">
                                  {String((msgError.data as { message?: string })?.message ?? msgError.name)}
                                </p>
                              </MessageContent>
                            ) : (
                              <MessageContent className={shouldUseFullWidth ? "w-full" : undefined}>
                                {tools.map((tool) => {
                                  const input = "input" in tool.state ? tool.state.input : undefined
                                  const output = "output" in tool.state ? formatToolPayload(tool.state.output) : undefined
                                  const error = "error" in tool.state ? formatToolPayload(tool.state.error) : undefined
                                  const state = toToolState(tool.state.status)
                                  const answered =
                                    "metadata" in tool.state && Array.isArray(tool.state.metadata?.answers)
                                      ? (tool.state.metadata.answers as string[][])
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
                                  return (
                                    <Tool
                                      defaultOpen={isDelegateToolCall}
                                      key={tool.id}
                                    >
                                      <ToolHeader
                                        state={state}
                                        title={questionRequest ? (questionRequest.questions[0]?.header ?? tool.tool) : isDelegateToolCall ? getDelegateToolTitle(tool) : tool.tool}
                                        centerTitle={!!questionRequest}
                                        toolName={tool.tool}
                                        type="dynamic-tool"
                                        viewMode={questionRequest ? currentViewMode : isDelegateToolCall ? currentDelegateViewMode : undefined}
                                        onViewChange={questionRequest ? handleViewModeChange : isDelegateToolCall ? handleDelegateViewModeChange : undefined}
                                        hasView={!!questionRequest || isDelegateToolCall}
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
                                        ) : isDelegateToolCall ? (
                                          currentDelegateViewMode === "code" ? toolInput : (
                                            <DelegateToolContent
                                              tool={tool}
                                              sessions={sessions}
                                              onSelectSession={selectSession}
                                              onGoToMessage={handleGoToMessage}
                                            />
                                          )
                                        ) : (
                                          toolInput
                                        )}
                                        {!isDelegateToolCall && !questionRequest && (output || error) ? (
                                          <ToolOutput errorText={error} output={output} />
                                        ) : null}
                                      </ToolContent>
                                    </Tool>
                                  )
                                })}
                                {content ? <MessageResponse>{content}</MessageResponse> : null}
                              </MessageContent>
                            )}
                          </>
                        )}
                        {(info.role === "assistant" && content) || hasLinkedParentMessage ? (
                          <MessageActions
                            className={cn("relative mt-1 justify-start transition-opacity", hasLinkedParentMessage ? "" : "pointer-events-none invisible opacity-0")}
                            style={hasLinkedParentMessage ? undefined : { opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
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
                            {isAssistantContribution && (assistantAuthor?.name ?? assistantAuthorId ?? assistantAgentId) ? (
                              <AssistantContributionBadge
                                agentName={assistantAuthor?.name ?? assistantAuthorId ?? assistantAgentId ?? ""}
                              />
                            ) : null}
                            {info.role === "assistant" && selectedSession?.id && (
                              <MessageAction
                                label="Link"
                                onClick={() => router.push(buildDashboardUrl(selectedSession.id, info.id), { scroll: false })}
                                tooltip="Open link to this reply"
                                variant="outline"
                              >
                                <Link2Icon className="size-4" />
                              </MessageAction>
                            )}
                            {info.role === "assistant" && hasLinkedParentMessage && msgParentSessionID && (
                              <MessageAction
                                label="Source"
                                onClick={() => handleGoToMessage(
                                  msgParentSessionID,
                                  msgParentMessageID ?? ""
                                )}
                                tooltip="Open originating tool call"
                                variant="outline"
                              >
                                <Link2Icon className="size-4" />
                              </MessageAction>
                            )}
                            {info.role === "user" && hasLinkedParentMessage && msgParentSessionID && (
                              <MessageAction
                                label="Source"
                                onClick={() => handleGoToMessage(
                                  msgParentSessionID,
                                  msgParentMessageID ?? ""
                                )}
                                tooltip="Back to delegation tool"
                                variant="outline"
                              >
                                <Link2Icon className="size-4" />
                              </MessageAction>
                            )}
                          </MessageActions>
                        ) : null}
                      </div>
                      )}
                    </Message>
                  </MessageBranchContent>
                </MessageBranch>
                </div>
              )
          })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <div className="grid shrink-0 gap-4 pt-4">
        <div className={cn("w-full px-4 pb-4 transition-all duration-300", isChatCentered && "max-w-3xl mx-auto")}>
          <PromptInput globalDrop multiple onSubmit={handleSubmit}>
            <PromptInputHeader>
              <AttachmentsDisplay />
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea
                ref={inputRef}
                onChange={(e) => setText(e.target.value)}
                value={text}
                placeholder={selectedSession ? (isRecording ? "Listening..." : isTranscribing ? "Transcribing..." : "Type a message…") : "Create or select a session to chat"}
                disabled={questionRequests.length > 0 || isRecording}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <SpeechInput
                  className="shrink-0"
                  onTranscriptionChange={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))}
                  onAudioRecorded={handleAudioRecorded}
                  forceMode={
                    settings.stt.provider === "disabled"
                      ? "none"
                      : settings.stt.provider === "openai-whisper"
                        ? "media-recorder"
                        : undefined
                  }
                  size="icon-sm"
                  variant="ghost"
                />

                {/* Model selector */}
                {modelList.length > 0 && (
                  <ModelSelector
                    onOpenChange={(open) => {
                      setModelSelectorOpen(open)
                      if (open) {
                        refreshProviders().catch(() => {})
                      }
                    }}
                    open={modelSelectorOpen}
                  >
                    <ModelSelectorTrigger asChild>
                      <PromptInputButton>
                        {selectedModel?.isFallback
                          ? (() => {
                              const activeSlot = fallbackActiveSlots[selectedModel.modelID]
                              const iconProvider = activeSlot?.providerID ?? "opencode"
                              return <ModelSelectorLogo provider={iconProvider} />
                            })()
                          : selectedModel?.providerID && <ModelSelectorLogo provider={selectedModel.providerID} />
                        }
                        {selectedModel?.modelName && <ModelSelectorName>{selectedModel.modelName}</ModelSelectorName>}
                      </PromptInputButton>
                    </ModelSelectorTrigger>
                    <ModelSelectorContent>
                      <ModelSelectorInput placeholder="Search models…" />
                      <ModelSelectorList>
                        <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                        {[...modelsByProvider.entries()].map(([providerName, models]) => (
                          <ModelSelectorGroup heading={providerName} key={providerName}>
                            {models.map((m) => {
                              const active =
                                selectedModel?.providerID === m.providerID &&
                                selectedModel?.modelID === m.modelID
                              return (
                                <ModelSelectorItem
                                  key={`${m.providerID}:${m.modelID}`}
                                  onSelect={() => {
                                    setSelectedProviderID(m.providerID)
                                    setSelectedModelID(m.modelID)
                                    setModelSelectorOpen(false)
                                    // Sync model change back to agent's preferred model
                                    updateAgentModel(m.providerID, m.modelID)
                                  }}
                                  value={`${m.providerID}:${m.modelID}`}
                                >
                                  <ModelSelectorLogo
                                    provider={
                                      (m as { isFallback?: boolean }).isFallback
                                        ? (fallbackActiveSlots[m.modelID]?.providerID ?? "opencode")
                                        : m.providerID
                                    }
                                  />
                                  <ModelSelectorName>{m.modelName}</ModelSelectorName>
                                  {active ? <CheckIcon className="ml-auto size-4" /> : <div className="ml-auto size-4" />}
                                </ModelSelectorItem>
                              )
                            })}
                          </ModelSelectorGroup>
                        ))}
                      </ModelSelectorList>
                    </ModelSelectorContent>
                  </ModelSelector>
                )}

              </PromptInputTools>
              <PromptInputSubmit status={status} onStop={abort} disabled={questionRequests.length > 0} />
            </PromptInputFooter>
          </PromptInput>
          
          {/* Hotkey hint */}
          {settings.pushToTalk.enabled && settings.pushToTalk.hotkey && (
            <p className="text-center text-xs text-muted-foreground px-4 pb-2">
              Hold <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">{formatHotkey(settings.pushToTalk.hotkey)}</kbd> to record and send with voice reply
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
