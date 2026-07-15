"use client"

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input"

import { ConversationCanvas } from "@/components/execution-graph/conversation-canvas"
import { messagesToExecutionState } from "@/lib/execution-graph/messages-to-state"
import { createInitialState } from "@/lib/execution-graph/engine"
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
  PromptInputActionAddScreenshot,
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
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
} from "@/components/ai-elements/attachments"
import { SpeechInput } from "@/components/ai-elements/speech-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextQuotaUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import { MessageRow } from "./message-row"
import { QuestionStep } from "@/components/questions/question-tool"
import type { AssistantMessage, UserMessage, Part, ReasoningPart, TextPart, ToolPart, FallbackSwitchPart, Edge } from "@/lib/projectflows"
import { opendora } from "@/lib/projectflows"
import { useUserProfile } from "@/hooks/use-user-profile"
import { ScheduleDialog } from "@/components/sessions/schedule-dialog"
import { useVoiceSettings, formatHotkey } from "@/hooks/use-voice-settings"
import { useTextToSpeech } from "@/hooks/use-text-to-speech"
import { useVoiceRecorder } from "@/hooks/use-voice-recorder"
import { usePushToTalk } from "@/hooks/use-push-to-talk"
import { ParentSessionBanner } from "@/components/ai-elements/delegate-tool"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getAgentColor } from "@/lib/agent-colors"
import { BellIcon, CheckIcon, ClockAlertIcon, ComponentIcon, FileIcon, KeyIcon, SquareSlash } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { playNotificationSound } from "@/lib/notification-sound"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useModelList } from "@/hooks/use-model-list"

const suggestions = [
  "What files are in this project?",
  "Explain the project structure",
  "What does this codebase do?",
  "How do I get started?",
]

function getTextParts(parts: Part[]): TextPart[] {
  return parts.filter((p): p is TextPart => p.type === "text" && !p.synthetic && !p.hidden)
}


export function getHiddenParts(parts: Part[]): TextPart[] {
  return parts.filter((p): p is TextPart => p.type === "text" && !!p.hidden)
}

export function getReasoningPart(parts: Part[]): ReasoningPart | undefined {
  return parts.find((p): p is ReasoningPart => p.type === "reasoning")
}

export function getToolParts(parts: Part[]): ToolPart[] {
  return parts.filter((p): p is ToolPart => p.type === "tool")
}

function getFallbackSwitchParts(parts: Part[]): FallbackSwitchPart[] {
  return parts.filter((p): p is FallbackSwitchPart => p.type === "fallback-switch")
}

function formatResetAt(resetAt: number): string {
  const diffMs = resetAt - Date.now()
  if (diffMs <= 0) return "soon"
  const h = Math.floor(diffMs / 3_600_000)
  const m = Math.floor((diffMs % 3_600_000) / 60_000)
  if (h > 0) return `in ${h}h ${m}m`
  return `in ${m}m`
}

export type FilePart = { type: "file"; id: string; sessionID: string; messageID: string; url: string; mime?: string; filename?: string }
export function getFileParts(parts: Part[]): FilePart[] {
  return parts.filter((p): p is FilePart => p.type === "file")
}

export function getMessageText(parts: Part[]): string {
  return getTextParts(parts).map((p) => p.text).join("")
}

export function formatToolPayload(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function toToolState(status: ToolPart["state"]["status"], hasPermissionRequest?: boolean) {
  switch (status) {
    case "pending":
      return "input-streaming"
    case "running":
      return hasPermissionRequest ? "approval-requested" : "input-available"
    case "completed":
      return "output-available"
    case "error":
      return "output-error"
    default:
      return "output-available"
  }
}

export type FailedSlotInfo = { providerID: string; modelID: string; statusCode?: number; resetAt?: number }

export type TimelineStep =
  | { key: string; kind: "reasoning"; content: ReasoningPart }
  | { key: string; kind: "tool"; content: ToolPart }
  | { key: string; kind: "fallback-switch"; content: FallbackSwitchPart; allFailedSlots: FailedSlotInfo[] }
  | { key: string; kind: "reply"; content?: string; error?: AssistantMessage["error"] }

export function getTimelineSteps(parts: Part[], error?: AssistantMessage["error"]): TimelineStep[] {
  const reasoning = getReasoningPart(parts)
  const tools = getToolParts(parts)
  const fallbackSwitches = getFallbackSwitchParts(parts)
  const reply = getMessageText(parts)
  const steps: TimelineStep[] = []

  if (reasoning) {
    steps.push({ key: reasoning.id, kind: "reasoning", content: reasoning })
  }

  for (const tool of tools) {
    steps.push({ key: tool.id, kind: "tool", content: tool })
  }

  // Accumulate failed slots per group so each successive card shows the full failure chain
  const accumulatedFailures = new Map<string, FailedSlotInfo[]>()
  for (const fs of fallbackSwitches) {
    const prev = accumulatedFailures.get(fs.groupID) ?? []
    const entry: FailedSlotInfo = {
      providerID: fs.previousSlot.providerID,
      modelID: fs.previousSlot.modelID,
      statusCode: fs.statusCode,
      resetAt: fs.resetAt ?? undefined,
    }
    const allFailedSlots = [...prev, entry]
    accumulatedFailures.set(fs.groupID, allFailedSlots)
    steps.push({ key: fs.id, kind: "fallback-switch", content: fs, allFailedSlots })
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
    <div className="p-2">
      <Attachments variant="inline">
        {attachments.files.map((f) => (
          <Attachment
            key={f.id}
            data={f as any}
            onRemove={() => attachments.remove(f.id)}
          >
            <AttachmentPreview />
            <AttachmentInfo />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
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
    schedules,
    questionRequests,
    replyQuestion,
    rejectQuestion,
    permissionRequests,
    replyPermission,
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
    modelGroups,
    refreshModelGroups,
    providerTimeouts,
    authExpiredProviders,
    refreshProviderTimeouts,
    sessionRetryStatus,
    createSession,
    updateAgent,
    isChatCentered,
    selectSession,
    selectAgent,
    compact,
    sessions,
    webPreviewOpen,
    toggleWebPreview,
    setWebPreviewUrl,
    openFilePreview,
    setSessionModel,
  } = useOpendoraContext()

  const { userName, userColor } = useUserProfile()
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
  const [openScheduleId, setOpenScheduleId] = useState<string | null>(null)
  const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)
  const [selectedModelID, setSelectedModelID] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [questionViewModes, setQuestionViewModes] = useState<Record<string, "code" | "view">>({})
  const [delegateViewModes, setDelegateViewModes] = useState<Record<string, "code" | "view">>({})
  const [todoViewModes, setTodoViewModes] = useState<Record<string, "code" | "view">>({})
  const [sessionTreeViewModes, setSessionTreeViewModes] = useState<Record<string, "code" | "view">>({})
  const [webfetchViewModes, setWebfetchViewModes] = useState<Record<string, "code" | "view">>({})
  const [expandedContractParts, setExpandedContractParts] = useState<Record<string, boolean>>({})
  const [questionStep, setQuestionStep] = useState(0)
  const [questionSelections, setQuestionSelections] = useState<string[][]>([])

  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [slashCommandIdx, setSlashCommandIdx] = useState(0)

  const slashCommands = useMemo(() => {
    const query = text.startsWith("/") ? text.slice(1).toLowerCase() : ""
    const base = [
      { id: "new", label: "new", description: "Create a new session" },
      { id: "compact", label: "compact", description: "Compact context with a summary" },
      { id: "model", label: "model", description: "Switch model" },
      ...agents.map((a) => ({
        id: `agent:${(a as any)._id}`,
        label: `agent ${a.name}`,
        description: `Switch to ${a.name}`,
      })),
    ]
    if (!query) return base
    return base.filter((c) => c.label.toLowerCase().startsWith(query))
  }, [text, agents])

  const slashMenuOpen =
    text.startsWith("/") &&
    slashCommands.length > 0 &&
    status !== "streaming" &&
    status !== "submitted"

  // Use actual token usage from session (provider-accurate)
  const tokenUsage = useMemo(() => {
    // Use the last completed assistant message's per-call token count.
    // This is the same value isOverflow() uses for compaction decisions, so the
    // display stays consistent with what the backend considers "full".
    // The session-level accumulated total is deliberately NOT used here: it grows
    // unboundedly (every API call adds the full context size again) and gives a
    // meaningless percentage once the session has more than a handful of turns.
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => {
        if (m.info.role !== "assistant") return false
        if ((m.info as any).summary) return false  // skip compaction summaries
        const t = (m.info as any).tokens
        if (!t) return false
        return (t.total ?? 0) > 0 || t.input > 0 || t.output > 0
      })

    if (lastAssistant) {
      const t = (lastAssistant.info as any).tokens as {
        input: number; output: number; reasoning?: number
        cache?: { read: number; write: number }; total?: number
      }
      const total = t.total ?? (t.input + t.output + (t.cache?.read ?? 0) + (t.cache?.write ?? 0))
      return {
        inputTokens: t.input,
        outputTokens: t.output,
        cachedTokens: t.cache?.read ?? 0,
        reasoningTokens: t.reasoning ?? 0,
        totalTokens: total,
      }
    }

    // Fallback: text-length estimate from visible message content only.
    // This misses system prompts and tool results, so it always underestimates.
    let inputTokens = 0
    let outputTokens = 0

    for (const message of messages) {
      if (message.info.role === "user") {
        const text = getMessageText(message.parts)
        inputTokens += Math.ceil(text.length / 4)
      } else if (message.info.role === "assistant") {
        const text = getMessageText(message.parts)
        outputTokens += Math.ceil(text.length / 4)
      }
    }

    return {
      inputTokens,
      outputTokens,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
    }
  }, [messages])

  // Initialize model selector from session's model (preferred) or agent's model (fallback)
  useEffect(() => {
    // First check if session has a model override
    if (selectedSession?.model) {
      const modelParts = selectedSession.model.split(":")
      if (modelParts.length === 2) {
        const [providerID, modelID] = modelParts
        if (providerID === "fallback") {
          setSelectedGroupId(modelID)
          setSelectedProviderID(null)
          setSelectedModelID(null)
        } else {
          setSelectedGroupId(null)
          setSelectedProviderID(providerID)
          setSelectedModelID(modelID)
        }
        return
      }
    }

    // Fall back to agent's model if session has no model override
    const agent = agents.find((a) => (a as any)._id === selectedAgent)
    if (agent?.model?.providerID === "fallback") {
      setSelectedGroupId(agent.model.modelID)
      setSelectedProviderID(null)
      setSelectedModelID(null)
    } else if (agent?.model) {
      setSelectedGroupId(null)
      setSelectedProviderID(agent.model.providerID)
      setSelectedModelID(agent.model.modelID)
    } else {
      setSelectedGroupId(null)
      setSelectedProviderID(null)
      setSelectedModelID(null)
    }
  }, [selectedAgent, agents, selectedSession])

  // Focus input when a session is selected
  useEffect(() => {
    if (selectedSession && inputRef.current) {
      inputRef.current.focus()
    }
  }, [selectedSession])

  // Reset question dock state when the pending question or session changes
  const activeQuestionId = questionRequests[0]?.id
  useEffect(() => {
    const n = questionRequests[0]?.questions.length ?? 0
    setQuestionStep(0)
    setQuestionSelections(Array.from({ length: n }, () => []))
  }, [activeQuestionId, selectedSession?.id])

  // Update session's model when user changes it in chat interface
  const updateSessionModel = useCallback(async (providerID: string, modelID: string) => {
    if (!selectedSession) return
    const modelString = `${providerID}:${modelID}`
    if (selectedSession.model === modelString) return
    await setSessionModel(selectedSession.id, modelString)
  }, [selectedSession, setSessionModel])

  const { modelList, modelsByProvider } = useModelList()

  const selectedGroup = useMemo(
    () => (selectedGroupId ? modelGroups.find((g) => g.id === selectedGroupId) : null),
    [selectedGroupId, modelGroups],
  )

  const selectedModel = useMemo(() => {
    if (selectedGroupId) {
      const group = modelGroups.find((g) => g.id === selectedGroupId)
      const first = group?.models[0]
      if (first) return modelList.find((m) => m.providerID === first.providerID && m.modelID === first.modelID)
    }
    if (selectedProviderID && selectedModelID)
      return modelList.find((m) => m.providerID === selectedProviderID && m.modelID === selectedModelID)
    const firstConnected = connectedProviders[0]
    if (!firstConnected) return undefined
    const defaultModel = defaultModels[firstConnected]
    return modelList.find((m) => m.providerID === firstConnected && m.modelID === defaultModel) ?? modelList[0]
  }, [selectedGroupId, selectedProviderID, selectedModelID, modelList, connectedProviders, defaultModels, modelGroups])

  // Get actual model context limit from provider data
  const modelContextLimit = useMemo(() => {
    if (!selectedModel) return 200000
    const provider = providers.find((p) => p.id === selectedModel.providerID)
    if (!provider) return 200000
    const providerModel = provider.models[selectedModel.modelID]
    if (!providerModel) return 200000
    // Check if the model has limit information
    const modelLimit = (providerModel as any).limit
    if (modelLimit && modelLimit.context) return modelLimit.context
    if (modelLimit && modelLimit.input) return modelLimit.input
    // Fallback to model ID detection
    if (selectedModel.modelID.includes("32k")) return 32000
    if (selectedModel.modelID.includes("128k")) return 128000
    return 200000
  }, [selectedModel, providers])

  const agentDotColor = useMemo(() => {
    const agent = agents.find((a) => (a as any)._id === selectedAgent)
    return getAgentColor((agent as any)?.color).hex
  }, [agents, selectedAgent])

  const userDotColor = useMemo(() => getAgentColor(userColor).hex, [userColor])

  // ─── Session graph edges for the chat side rail ──────────────────────────
  const [sessionEdges, setSessionEdges] = useState<Edge[]>([])
  useEffect(() => {
    if (!selectedSession?.id) { setSessionEdges([]); return }
    let active = true
    opendora.session.graph(selectedSession.id)
      .then((g) => { if (active) setSessionEdges(g?.edges ?? []) })
      .catch(() => { if (active) setSessionEdges([]) })
    return () => { active = false }
  }, [selectedSession?.id])

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
    const scheduleId = searchParams.get("openSchedule")
    if (scheduleId) setOpenScheduleId(scheduleId)
  }, [searchParams])

  useEffect(() => {
    const targetId = scrollToMessageIdRef.current
    if (!targetId || !messages.length) return
    
    // Try to find and scroll to the target message
    const attemptScroll = () => {
      const el = document.getElementById(`msg-${targetId}`)
      if (!el) {
        console.log(`[Scroll] Element msg-${targetId} not found yet`)
        return false
      }
      
      console.log(`[Scroll] Found element msg-${targetId}, scrolling...`)
      // Use instant scroll to override StickToBottom's smooth scroll
      el.scrollIntoView({ behavior: "instant", block: "center" })
      console.log(`[Scroll] Scrolled to msg-${targetId}`)
      
      // Clean up URL after a delay
      setTimeout(() => {
        if (selectedSession?.id) {
          router.replace(buildDashboardUrl(selectedSession.id, null), { scroll: false })
        }
      }, 500)
      
      scrollToMessageIdRef.current = null
      return true
    }
    
    // Wait longer to let StickToBottom finish its scroll first, then override it
    const initialDelay = 300
    let attempts = 0
    const maxAttempts = 8
    const retryDelay = 250
    
    const tryScroll = () => {
      if (attemptScroll()) return
      
      attempts++
      if (attempts < maxAttempts) {
        setTimeout(tryScroll, retryDelay)
      } else {
        console.log(`[Scroll] Failed to find msg-${targetId} after ${maxAttempts} attempts`)
        scrollToMessageIdRef.current = null
      }
    }
    
    // Start trying after initial delay to let StickToBottom settle
    setTimeout(tryScroll, initialDelay)
  }, [messages, router, buildDashboardUrl, selectedSession?.id])

  const handleQuestionAdvance = useCallback((trimmedText: string) => {
    const request = questionRequests[0]
    if (!request) return
    const currentSels = questionSelections[questionStep] ?? []
    const answer = trimmedText ? [...currentSels, trimmedText] : currentSels
    if (answer.length === 0) return
    const total = request.questions.length
    const allAnswers = Array.from({ length: total }, (_, i) =>
      i === questionStep ? answer : (questionSelections[i] ?? [])
    )
    setText("")
    if (questionStep < total - 1) {
      setQuestionSelections(allAnswers)
      setQuestionStep((prev) => prev + 1)
    } else {
      void replyQuestion(request.id, allAnswers)
      setQuestionStep(0)
      setQuestionSelections([])
    }
  }, [questionRequests, questionStep, questionSelections, replyQuestion])

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (questionRequests.length > 0) {
        handleQuestionAdvance(message.text?.trim() ?? "")
        return
      }
      if (!message.text?.trim() && !message.files?.length) return
      const model = selectedGroupId
        ? { providerID: "fallback", modelID: selectedGroupId }
        : selectedModel
          ? { providerID: selectedModel.providerID, modelID: selectedModel.modelID }
          : undefined
      const fallbackGroupID = selectedGroupId ?? undefined
      const content = message.text
      const files = (message.files ?? []).map((f) => ({
        type: "file" as const,
        mime: f.mediaType,
        filename: f.filename,
        url: f.url,
      }))
      setText("")
      const doSend = () => sendMessage(content, { model, fallbackGroupID, agent: selectedAgent, userName: userName || undefined, files: files.length > 0 ? files : undefined })
      if (!selectedSession) {
        createSession().then(doSend)
      } else {
        doSend()
      }
    },
    [sendMessage, selectedModel, selectedGroupId, selectedAgent, selectedSession, createSession, userName, questionRequests, handleQuestionAdvance],
  )

  useEffect(() => {
    setSlashCommandIdx(0)
  }, [text])

  const executeSlashCommand = useCallback(
    (id: string) => {
      setText("")
      if (id === "new") {
        createSession()
      } else if (id === "compact") {
        if (selectedModel) {
          compact({ providerID: selectedModel.providerID, modelID: selectedModel.modelID }).catch(() => {})
        }
      } else if (id === "model") {
        setModelSelectorOpen(true)
      } else if (id.startsWith("agent:")) {
        selectAgent(id.slice(6))
      }
    },
    [createSession, compact, selectAgent, selectedModel],
  )

  const handleTextareaKeyDown = useCallback(
    (e: { key: string; preventDefault: () => void }) => {
      if (!slashMenuOpen) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSlashCommandIdx((i) => Math.min(i + 1, slashCommands.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSlashCommandIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === "Escape") {
        e.preventDefault()
        setText("")
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        const cmd = slashCommands[slashCommandIdx]
        if (cmd) executeSlashCommand(cmd.id)
      }
    },
    [slashMenuOpen, slashCommands, slashCommandIdx, executeSlashCommand],
  )

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      const model = selectedGroupId
        ? { providerID: "fallback", modelID: selectedGroupId }
        : selectedModel
          ? { providerID: selectedModel.providerID, modelID: selectedModel.modelID }
          : undefined
      const fallbackGroupID = selectedGroupId ?? undefined
      if (!selectedSession) {
        createSession().then(() => {
          sendMessage(suggestion, { model, fallbackGroupID, agent: selectedAgent })
        })
        return
      }
      sendMessage(suggestion, { model, fallbackGroupID, agent: selectedAgent })
    },
    [sendMessage, selectedModel, selectedGroupId, selectedAgent, selectedSession, createSession],
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

  // Handle push-to-talk stop — draft-only, never auto-submits
  const handlePushToTalkStop = useCallback(async () => {
    playNotificationSound()
    const transcription = await stopRecording()
    if (transcription) {
      setText((prev) => prev ? `${prev} ${transcription}` : transcription)
    }
  }, [stopRecording, setText])

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

  const handleAudioRecorded = useCallback(async (audioBlob: Blob) => {
    try {
      const { opendora } = await import("@/lib/projectflows")
      const provider =
        settings.stt.provider === "google-gemini" ? "google-gemini"
        : settings.stt.provider === "local-whisper" ? "local-whisper"
        : "openai-whisper"
      const result = await opendora.voice.stt(audioBlob, { provider })
      return result.text || ""
    } catch (error) {
      console.error("STT error:", error)
      const errorMessage = error instanceof Error ? error.message : "Transcription error"
      if (errorMessage.includes("not configured")) {
        if (settings.stt.provider === "local-whisper") {
          toast.error("Local Whisper server not configured. Go to Settings → Voice → Speech-to-Text and enter your server URL.")
        } else if (settings.stt.provider === "google-gemini") {
          toast.error("Google API key not configured. Please connect Google in Settings → Providers.")
        } else {
          toast.error("OpenAI not configured. Please connect OpenAI in Settings → Providers.")
        }
      } else {
        toast.error("Transcription failed")
      }
      return ""
    }
  }, [settings.stt.provider])

  const sessionsById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions])
  const agentsById = useMemo(() => new Map(agents.map((a) => [(a as any)._id, a])), [agents])
  const agentsByName = useMemo(() => new Map(agents.map((a) => [a.name, a])), [agents])
  const schedulesById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules])
  const schedulesBySessionId = useMemo(() => new Map(schedules.filter((s) => s.session_id).map((s) => [s.session_id as string, s])), [schedules])

  const executionState = useMemo(() => {
    if (!selectedSession) return createInitialState()
    return messagesToExecutionState(
      messages,
      selectedSession.id,
      sessionsById,
      agentsById,
      userColor,
    )
  }, [messages, selectedSession, sessionsById, agentsById, userColor])

  // Visible messages (same filter as messages-to-state) — children for ConversationCanvas
  const visibleMessages = useMemo(
    () => messages.filter((m) => !(m.info as { hidden?: boolean }).hidden),
    [messages]
  )

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
        <>
        {(() => {
          const chatParentSession = selectedSession.parentSessionID
            ? sessionsById.get(selectedSession.parentSessionID)
            : undefined
          return chatParentSession ? (
            <ParentSessionBanner
              parentSession={chatParentSession}
              onSelectSession={selectSession}
            />
          ) : null
        })()}
        <ConversationCanvas
          state={executionState}
          sessionKey={selectedSession.id}
          footer={
            (status === "submitted" || (status === "streaming" && (() => {
              let lastAssistant: typeof messages[0] | undefined
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].info.role === "assistant") { lastAssistant = messages[i]; break }
              }
              if (!lastAssistant) return true
              const msgError = (lastAssistant.info as AssistantMessage).error
              return getTimelineSteps(lastAssistant.parts, msgError).length === 0
            })())) ? (
              <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 w-full py-2">
                <div className="relative size-4 mt-[3px]">
                  <div
                    className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                    style={{ borderTopColor: agentDotColor }}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: agentDotColor }}
                  />
                </div>
                <div className="flex items-center h-5">
                  <span className="text-xs text-muted-foreground">Thinking…</span>
                </div>
              </div>
            ) : null
          }
        >
          {visibleMessages.map(({ info, parts }, msgIndex) => {
            if (info.role === "assistant" && (status === "streaming" || status === "submitted")) {
              const msgError = (info as AssistantMessage).error
              if (getTimelineSteps(parts, msgError).length === 0) return null
            }
            const incomingEdge = sessionEdges.find(e => e.to_type === "entry" && e.to_id === info.id)
            const outgoingEdge = sessionEdges.find(e => e.from_type === "entry" && e.from_id === info.id)
            return (
              <MessageRow
                key={info.id}
                info={info}
                parts={parts}
                msgIndex={msgIndex}
                messagesLength={visibleMessages.length}
                incomingEdge={incomingEdge}
                outgoingEdge={outgoingEdge}
                status={status}
                sessions={sessions}
                sessionsById={sessionsById}
                agentsById={agentsById}
                agentsByName={agentsByName}
                schedulesById={schedulesById}
                schedulesBySessionId={schedulesBySessionId}
                selectedSession={selectedSession}
                userDotColor={userDotColor}
                agentDotColor={agentDotColor}
                playingId={playingId}
                isTtsLoading={isTtsLoading}
                isTtsEnabled={isTtsEnabled}
                handleCopy={handleCopy}
                handleSpeak={handleSpeak}
                setOpenScheduleId={setOpenScheduleId}
                handleGoToMessage={handleGoToMessage}
                userName={userName}
                expandedContractParts={expandedContractParts}
                setExpandedContractParts={setExpandedContractParts}
                questionViewModes={questionViewModes}
                setQuestionViewModes={setQuestionViewModes}
                delegateViewModes={delegateViewModes}
                setDelegateViewModes={setDelegateViewModes}
                todoViewModes={todoViewModes}
                setTodoViewModes={setTodoViewModes}
                sessionTreeViewModes={sessionTreeViewModes}
                setSessionTreeViewModes={setSessionTreeViewModes}
                webfetchViewModes={webfetchViewModes}
                setWebfetchViewModes={setWebfetchViewModes}
                questionRequests={questionRequests}
                replyQuestion={replyQuestion}
                rejectQuestion={rejectQuestion}
                permissionRequests={permissionRequests}
                replyPermission={replyPermission}
                selectedAgent={selectedAgent}
                selectedModel={selectedModel}
                selectedGroupId={selectedGroupId}
                modelGroups={modelGroups}
                modelList={modelList}
                sessionRetryStatus={sessionRetryStatus}
                webPreviewOpen={webPreviewOpen}
                toggleWebPreview={toggleWebPreview}
                setWebPreviewUrl={setWebPreviewUrl}
                openFilePreview={openFilePreview}
                selectSession={selectSession}
              />
            )
          })}
        </ConversationCanvas>
        </>
      )}

      <div className="flex flex-col shrink-0 max-h-[80dvh] overflow-hidden pt-4">
        <div className={cn("relative w-full flex flex-col min-h-0 flex-1 px-4 pb-4 transition-all duration-300", isChatCentered && "max-w-3xl mx-auto")}>
          {slashMenuOpen && (
            <div className="absolute bottom-full left-4 right-4 mb-1 z-50 rounded-lg border bg-popover shadow-lg overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b">Commands</div>
              <div className="max-h-60 overflow-y-auto py-1">
                {slashCommands.map((cmd, idx) => (
                  <button
                    key={cmd.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-sm text-left",
                      idx === slashCommandIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      executeSlashCommand(cmd.id)
                    }}
                    onMouseEnter={() => setSlashCommandIdx(idx)}
                  >
                    <span className="font-mono text-xs font-semibold text-foreground shrink-0">/{cmd.label}</span>
                    <span className="text-xs text-muted-foreground">{cmd.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <PromptInput globalDrop multiple onSubmit={handleSubmit} className={questionRequests.length > 0 ? "flex flex-col flex-1 min-h-0" : ""}>
            <PromptInputHeader>
              <AttachmentsDisplay />
            </PromptInputHeader>
            {questionRequests.length > 0 && (() => {
              const request = questionRequests[0]
              const question = request.questions[questionStep]
              const currentSels = questionSelections[questionStep] ?? []
              return (
                <div className="overflow-y-auto min-h-0 flex-1">
                  <div className="px-4 pt-4 pb-2 border-b border-border">
                    <QuestionStep
                      question={question}
                      value={currentSels}
                      customValue=""
                      hideCustomInput
                      onToggle={(label) =>
                        setQuestionSelections((prev) => {
                          const updated = [...prev]
                          const sel = updated[questionStep] ?? []
                          updated[questionStep] = sel.includes(label) ? sel.filter((s) => s !== label) : [...sel, label]
                          return updated
                        })
                      }
                      onPickSingle={(label) =>
                        setQuestionSelections((prev) => {
                          const updated = [...prev]
                          updated[questionStep] = [label]
                          return updated
                        })
                      }
                      onCustomChange={() => {}}
                    />
                  </div>
                </div>
              )
            })()}
            {(questionRequests.length > 0 || permissionRequests.length > 0) && (
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-amber-400 border-b border-border">
                <BellIcon className="size-3 shrink-0" />
                {questionRequests.length > 0 ? "Answer the question above to continue" : "Approve or reject the permission request above to continue"}
              </div>
            )}
            <PromptInputBody>
              <PromptInputTextarea
                ref={inputRef}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                value={text}
                placeholder={selectedSession ? (isRecording ? "Listening..." : isTranscribing ? "Transcribing..." : "Type a message… (/ for commands)") : "Create or select a session to chat"}
                disabled={isRecording}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent side="top">
                    <PromptInputActionAddAttachments />
                    <PromptInputActionAddScreenshot />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <PromptInputButton
                  tooltip="Slash commands"
                  onClick={() => {
                    setText("/")
                    setTimeout(() => inputRef.current?.focus(), 0)
                  }}
                >
                  <SquareSlash className="size-4" />
                </PromptInputButton>
                <SpeechInput
                  key={settings.stt.provider}
                  className="shrink-0"
                  onTranscriptionChange={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))}
                  onAudioRecorded={handleAudioRecorded}
                  forceMode={
                    settings.stt.provider === "disabled"
                      ? "none"
                      : settings.stt.provider === "openai-whisper" || settings.stt.provider === "google-gemini" || settings.stt.provider === "local-whisper"
                        ? "media-recorder"
                        : undefined
                  }
                  maxRecordingTime={
                    settings.stt.provider === "local-whisper"
                      ? 300 // 5 minutes for local Whisper (safe under 1-hour timeout)
                      : settings.stt.provider === "openai-whisper" || settings.stt.provider === "google-gemini"
                        ? 60 // 1 minute for cloud APIs (25MB limit)
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
                        refreshModelGroups().catch(() => {})
                        refreshProviderTimeouts().catch(() => {})
                      }
                    }}
                    open={modelSelectorOpen}
                  >
                    <ModelSelectorTrigger asChild>
                      <PromptInputButton>
                        {selectedGroup ? (
                          <>
                            <ComponentIcon className="size-3 shrink-0" />
                            <ModelSelectorName>{selectedGroup.name}</ModelSelectorName>
                          </>
                        ) : selectedModel?.isFallback
                          ? (() => {
                              const activeSlot = fallbackActiveSlots[selectedModel.modelID]
                              const iconProvider = activeSlot?.providerID ?? "opencode"
                              return <ModelSelectorLogo provider={iconProvider} />
                            })()
                          : selectedModel?.providerID && <ModelSelectorLogo provider={selectedModel.providerID} />
                        }
                        {!selectedGroup && selectedModel?.modelName && <ModelSelectorName>{selectedModel.modelName}</ModelSelectorName>}
                        {selectedModel?.providerID && (() => {
                          const pt = providerTimeouts[selectedModel.providerID]
                          const mcd = pt?.modelCooldowns?.[selectedModel.modelID]
                          const cd = pt?.timedOut ? pt : mcd ? { reason: mcd.reason, resetInSeconds: mcd.resetInSeconds } : null
                          if (!cd) return null
                          return (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <ClockAlertIcon className="size-3.5 text-red-500 shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {cd.reason}
                                  {cd.resetInSeconds != null &&
                                    ` (resets in ${Math.ceil(cd.resetInSeconds / 60)}m)`}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )
                        })()}
                      </PromptInputButton>
                    </ModelSelectorTrigger>
                    <ModelSelectorContent>
                      <ModelSelectorInput placeholder="Search models…" />
                      <ModelSelectorList>
                        <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                        {modelGroups.length > 0 && (
                          <ModelSelectorGroup heading="Fallback Groups">
                            {modelGroups.map((g) => {
                              const active = selectedGroupId === g.id
                              return (
                                <ModelSelectorItem
                                  key={`group:${g.id}`}
                                  value={`group:${g.name} ${g.id}`}
                                  onSelect={() => {
                                    setSelectedGroupId(g.id)
                                    setSelectedProviderID(null)
                                    setSelectedModelID(null)
                                    setModelSelectorOpen(false)
                                    updateSessionModel("fallback", g.id)
                                  }}
                                >
                                  <ComponentIcon className="size-3 shrink-0" />
                                  <ModelSelectorName>{g.name}</ModelSelectorName>
                                  {(() => {
                                    const minReset = g.models.reduce<number | null>((min, m) => {
                                      const pt = providerTimeouts[m.providerID]
                                      const reset = pt?.timedOut
                                        ? pt.resetInSeconds
                                        : (pt?.modelCooldowns?.[m.modelID]?.resetInSeconds ?? null)
                                      if (!reset) return min
                                      return min === null || reset < min ? reset : min
                                    }, null)
                                    if (minReset === null) return null
                                    return (
                                      <span className="ml-auto flex items-center gap-1 text-[10px] text-red-500 shrink-0">
                                        <ClockAlertIcon className="size-3" />
                                        {Math.ceil(minReset / 60)}m
                                      </span>
                                    )
                                  })()}
                                  {active && <CheckIcon className="size-4 shrink-0" />}
                                </ModelSelectorItem>
                              )
                            })}
                          </ModelSelectorGroup>
                        )}
                        {[...modelsByProvider.entries()].map(([providerName, models]) => (
                          <ModelSelectorGroup heading={providerName} key={providerName}>
                            {models.map((m) => {
                              const active =
                                !selectedGroupId &&
                                selectedModel?.providerID === m.providerID &&
                                selectedModel?.modelID === m.modelID
                              return (
                                <ModelSelectorItem
                                  key={`${m.providerID}:${m.modelID}`}
                                  onSelect={() => {
                                    setSelectedProviderID(m.providerID)
                                    setSelectedModelID(m.modelID)
                                    setSelectedGroupId(null)
                                    setModelSelectorOpen(false)
                                    updateSessionModel(m.providerID, m.modelID)
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
                                  {(() => {
                                    const pt = providerTimeouts[m.providerID]
                                    const mcd = pt?.modelCooldowns?.[m.modelID]
                                    const isCooled = pt?.timedOut || !!mcd
                                    if (authExpiredProviders[m.providerID]) return <KeyIcon className="size-3 shrink-0 text-amber-500" />
                                    if (isCooled) {
                                      const resetSecs = pt?.timedOut ? pt.resetInSeconds : (mcd?.resetInSeconds ?? null)
                                      return (
                                        <span className="flex items-center gap-0.5 text-[10px] text-red-500 shrink-0">
                                          <ClockAlertIcon className="size-3" />
                                          {resetSecs ? `${Math.ceil(resetSecs / 60)}m` : ""}
                                        </span>
                                      )
                                    }
                                    return null
                                  })()}
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
              <div className="flex items-center gap-1">
                {selectedModel && selectedSession && (
                  <Context
                    usedTokens={tokenUsage.totalTokens}
                    maxTokens={modelContextLimit}
                    usage={
                      {
                        cachedInputTokens: tokenUsage.cachedTokens,
                        inputTokens: tokenUsage.inputTokens,
                        outputTokens: tokenUsage.outputTokens,
                        reasoningTokens: tokenUsage.reasoningTokens,
                        totalTokens: tokenUsage.totalTokens,
                        inputTokenDetails: {
                          noCacheTokens: tokenUsage.inputTokens - tokenUsage.cachedTokens,
                          cacheReadTokens: tokenUsage.cachedTokens,
                          cacheWriteTokens: 0,
                        },
                        outputTokenDetails: {
                          textTokens: tokenUsage.outputTokens,
                          reasoningTokens: tokenUsage.reasoningTokens,
                        },
                      }
                    }
                    modelId={selectedModel.modelID}
                    providerID={selectedModel.providerID}
                  >
                    <ContextTrigger />
                    <ContextContent>
                      <ContextContentHeader />
                      <ContextContentBody>
                        <ContextInputUsage />
                        <ContextOutputUsage />
                        <ContextReasoningUsage />
                        <ContextCacheUsage />
                        <ContextQuotaUsage className="mt-2 pt-2 border-t border-border/50" />
                      </ContextContentBody>
                      <ContextContentFooter />
                    </ContextContent>
                  </Context>
                )}
                {questionRequests.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void rejectQuestion(questionRequests[0].id)}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                  >
                    Dismiss
                  </button>
                )}
                <PromptInputSubmit
                  status={questionRequests.length > 0 ? undefined : status}
                  onStop={abort}
                  disabled={permissionRequests.length > 0}
                />
              </div>
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>

      <ScheduleDialog
        open={!!openScheduleId && schedules.some(s => s.id === openScheduleId)}
        onOpenChange={(open) => { if (!open) setOpenScheduleId(null) }}
        schedule={schedules.find(s => s.id === openScheduleId)}
      />
    </div>
  )
}
