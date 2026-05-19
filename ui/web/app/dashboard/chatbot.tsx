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
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
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
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"

import { QuestionTool, QuestionStep } from "@/components/questions/question-tool"
import { PermissionTool } from "@/components/permissions/permission-tool"
import type { AssistantMessage, UserMessage, Part, ReasoningPart, TextPart, ToolPart, FallbackSwitchPart } from "@/lib/opendora"
import { opendora } from "@/lib/opendora"
import { useUserProfile } from "@/hooks/use-user-profile"
import { ScheduleDialog } from "@/components/sessions/schedule-dialog"
import { useNotifications } from "@/hooks/use-notifications"
import { NotificationBell, NotificationPanel } from "@/components/notifications/notification-bell"
import { useVoiceSettings, formatHotkey } from "@/hooks/use-voice-settings"
import { useTextToSpeech } from "@/hooks/use-text-to-speech"
import { useVoiceRecorder } from "@/hooks/use-voice-recorder"
import { usePushToTalk } from "@/hooks/use-push-to-talk"
import { DelegateToolContent, isDelegateTool, getDelegateToolTitle } from "@/components/ai-elements/delegate-tool"
import { TodoToolContent, isTodoTool, getTodoToolTitle } from "@/components/ai-elements/todo-tool"
import { SessionTreeToolContent, isSessionTreeTool, getSessionTreeToolTitle } from "@/components/ai-elements/session-tree-tool"
import { WebFetchToolContent, isWebFetchTool, getWebFetchToolTitle, getWebFetchUrl } from "@/components/ai-elements/webfetch-tool"
import { isSkillLoadTool, getSkillLoadToolTitle, getSkillLoadDefinition } from "@/components/ai-elements/skill-load-tool"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getAgentColor } from "@/lib/agent-colors"
import { BellIcon, CheckIcon, ClockAlertIcon, CopyIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, FileIcon, Link2Icon, PanelRightIcon, SquareSlash, Volume2Icon, VolumeXIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

const suggestions = [
  "What files are in this project?",
  "Explain the project structure",
  "What does this codebase do?",
  "How do I get started?",
]

function getTextParts(parts: Part[]): TextPart[] {
  return parts.filter((p): p is TextPart => p.type === "text" && !p.synthetic && !p.hidden)
}


function getHiddenParts(parts: Part[]): TextPart[] {
  return parts.filter((p): p is TextPart => p.type === "text" && !!p.hidden)
}

function getReasoningPart(parts: Part[]): ReasoningPart | undefined {
  return parts.find((p): p is ReasoningPart => p.type === "reasoning")
}

function getToolParts(parts: Part[]): ToolPart[] {
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

type FilePart = { type: "file"; id: string; sessionID: string; messageID: string; url: string; mime?: string; filename?: string }
function getFileParts(parts: Part[]): FilePart[] {
  return parts.filter((p): p is FilePart => p.type === "file")
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

function toToolState(status: ToolPart["state"]["status"], hasPermissionRequest?: boolean) {
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

type TimelineStep =
  | { key: string; kind: "reasoning"; content: ReasoningPart }
  | { key: string; kind: "tool"; content: ToolPart }
  | { key: string; kind: "fallback-switch"; content: FallbackSwitchPart }
  | { key: string; kind: "reply"; content?: string; error?: AssistantMessage["error"] }

function getTimelineSteps(parts: Part[], error?: AssistantMessage["error"]): TimelineStep[] {
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

  for (const fs of fallbackSwitches) {
    steps.push({ key: fs.id, kind: "fallback-switch", content: fs })
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
    refreshProviderTimeouts,
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
  } = useOpendoraContext()

  const { userName, userColor } = useUserProfile()
  const { settings } = useVoiceSettings()
  const { speak, playingId, isLoading: isTtsLoading, isEnabled: isTtsEnabled, error: ttsError } = useTextToSpeech()
  const { notifications, unreadCount, addNotification, markRead, markAllRead, removeNotification, clearAll } = useNotifications()

  useEffect(() => {
    if (ttsError) toast.error(`TTS: ${ttsError}`)
  }, [ttsError])

  // Listen for provider timeout/recovery events and add notifications
  useEffect(() => {
    const unsubscribe = opendora.events.subscribe((event) => {
      switch (event.type) {
        case "provider.timeout": {
          const props = (event as any).properties
          addNotification({
            type: "provider_timeout",
            title: `${props.providerID} timed out`,
            message: props.reason,
            providerID: props.providerID,
          })
          break
        }
        case "provider.recovered": {
          const props = (event as any).properties
          addNotification({
            type: "provider_recovered",
            title: `${props.providerID} recovered`,
            message: "Provider is now available",
            providerID: props.providerID,
          })
          break
        }
      }
    })
    return unsubscribe
  }, [addNotification])

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
    // First try to use session tokens
    if (selectedSession?.tokens && (selectedSession.tokens.input > 0 || selectedSession.tokens.output > 0)) {
      return {
        inputTokens: selectedSession.tokens.input,
        outputTokens: selectedSession.tokens.output,
        cachedTokens: selectedSession.tokens.cacheRead,
        reasoningTokens: 0, // Backend doesn't track reasoning separately yet
        totalTokens: selectedSession.tokens.input + selectedSession.tokens.output,
      }
    }

    // Fallback: estimate tokens from messages
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
  }, [selectedSession, messages])

  useEffect(() => {
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
  }, [selectedAgent, agents])

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

  const userDotColor = useMemo(() => getAgentColor(userColor).hex, [userColor])


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
      const content = userName ? `user: ${userName}\n\n${message.text}` : message.text
      const files = (message.files ?? []).map((f) => ({
        type: "file" as const,
        mime: f.mediaType,
        filename: f.filename,
        url: f.url,
      }))
      setText("")
      const doSend = () => sendMessage(content, { model, fallbackGroupID, agent: selectedAgent, files: files.length > 0 ? files : undefined })
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
      const model = selectedGroupId
        ? { providerID: "fallback", modelID: selectedGroupId }
        : selectedModel
          ? { providerID: selectedModel.providerID, modelID: selectedModel.modelID }
          : undefined
      const fallbackGroupID = selectedGroupId ?? undefined

      // We'll identify the next assistant message by its position
      const attributed = userName ? `user: ${userName}\n\n${transcription}` : transcription
      const doSend = () => {
        sendMessage(attributed, { model, fallbackGroupID, agent: selectedAgent })
        // The next assistant message will be at position currentMessageCount + 1
        // We'll track this in the useEffect below
      }

      if (!selectedSession) {
        createSession().then(() => doSend())
      } else {
        doSend()
      }
    }
  }, [stopRecording, sendMessage, selectedModel, selectedGroupId, selectedAgent, selectedSession, createSession, messages.length, userName])

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
      const { opendora } = await import("@/lib/opendora")
      const provider = settings.stt.provider === "google-gemini" ? "google-gemini" : "openai-whisper"
      const result = await opendora.voice.stt(audioBlob, { provider })
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
  }, [settings.stt.provider])

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
        <Conversation key={selectedSession.id}>
          <ConversationContent className={cn(isChatCentered && "max-w-3xl mx-auto w-full")}>
            {messages.map(({ info, parts }, msgIndex) => {
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
              const parentSession = msgParentSessionID ? sessions.find((s) => s.id === msgParentSessionID) : undefined
              const parentAgentId = parentSession?.agentID
              const parentAgent = parentAgentId
                ? agents.find((a) => (a as any)._id === parentAgentId || a.name === parentAgentId)
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
              // Fallback for messages created before schedule_id tracking: match by prompt text
              // against schedules targeting this session.
              const msgSchedule = msgScheduleId
                ? schedules.find(s => s.id === msgScheduleId)
                : info.role === "user"
                  ? schedules.find(s => s.session_id === selectedSession?.id && s.prompt.trim() === content.trim())
                  : isSchedulerAssistant
                    ? schedules.find(s => s.session_id === selectedSession?.id)
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
                              className="relative mt-1 w-full"
                              style={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
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
                                    {step.kind === "fallback-switch" ? (
                                      <div className="flex flex-col gap-1 rounded-lg border border-amber-200/70 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-950/20 px-3 py-2 text-xs my-0.5">
                                        <div className="font-medium text-amber-700 dark:text-amber-400">
                                          ⚡ Model switched
                                        </div>
                                        <div className="flex flex-col gap-0.5 text-muted-foreground">
                                          <div className="flex items-center gap-1.5">
                                            <span className="line-through text-red-500/80">{step.content.previousSlot.providerID}/{step.content.previousSlot.modelID}</span>
                                            <span className="text-[10px]">rate limited{step.content.statusCode ? ` (${step.content.statusCode})` : ""}</span>
                                          </div>
                                          {step.content.resetAt ? (
                                            <span className="text-[10px]">back {formatResetAt(step.content.resetAt)}</span>
                                          ) : null}
                                        </div>
                                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                          <span>→</span>
                                          <span>{step.content.newSlot.providerID}/{step.content.newSlot.modelID}</span>
                                        </div>
                                      </div>
                                    ) : null}
                                    {step.kind === "tool" ? (() => {
                                      const tool = step.content
                                      // Guard: legacy sessions stored state as a string ("result"/"call"); normalize to object
                                      const toolState = typeof tool.state === "object" && tool.state !== null ? tool.state : {} as typeof tool.state
                                      const input = "input" in toolState ? toolState.input : undefined
                                      const output = "output" in toolState ? formatToolPayload((toolState as any).output) : undefined
                                      const error = "error" in toolState ? formatToolPayload((toolState as any).error) : undefined
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
                                        <Tool defaultOpen={!!questionRequest || isDelegateToolCall || isTodoToolCall || isSessionTreeToolCall || isWebFetchToolCall || isSkillLoadToolCall}>
                                          <ToolHeader
                                            state={state}
                                            title={isDelegateToolCall ? getDelegateToolTitle(tool) : isTodoToolCall ? getTodoToolTitle(tool) : isSessionTreeToolCall ? getSessionTreeToolTitle(tool) : isWebFetchToolCall ? getWebFetchToolTitle(tool) : isSkillLoadToolCall ? getSkillLoadToolTitle(tool) : tool.tool}
                                            toolName={tool.tool}
                                            type="dynamic-tool"
                                            viewMode={questionRequest ? currentViewMode : isDelegateToolCall ? currentDelegateViewMode : isTodoToolCall ? currentTodoViewMode : isSessionTreeToolCall ? currentSessionTreeViewMode : isWebFetchToolCall ? currentWebFetchViewMode : undefined}
                                            onViewChange={questionRequest ? handleViewModeChange : isDelegateToolCall ? handleDelegateViewModeChange : isTodoToolCall ? handleTodoViewModeChange : isSessionTreeToolCall ? handleSessionTreeViewModeChange : isWebFetchToolCall ? handleWebFetchViewModeChange : undefined}
                                            hasView={!!questionRequest || isDelegateToolCall || isTodoToolCall || isSessionTreeToolCall || isWebFetchToolCall}
                                            actions={webFetchActions}
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
                                            ) : (
                                              toolInput
                                            )}
                                            {!isDelegateToolCall && !isTodoToolCall && !isSessionTreeToolCall && !isWebFetchToolCall && !questionRequest && (output || error) ? (
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
                                  const toolState = typeof tool.state === "object" && tool.state !== null ? tool.state : {} as typeof tool.state
                                  const input = "input" in toolState ? toolState.input : undefined
                                  const output = "output" in toolState ? formatToolPayload((toolState as any).output) : undefined
                                  const error = "error" in toolState ? formatToolPayload((toolState as any).error) : undefined
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
                                      defaultOpen={!!questionRequest || isDelegateToolCall || isTodoToolCall || isSessionTreeToolCall || isWebFetchToolCall || isSkillLoadToolCall}
                                      key={tool.id}
                                    >
                                      <ToolHeader
                                        state={state}
                                        title={isDelegateToolCall ? getDelegateToolTitle(tool) : isTodoToolCall ? getTodoToolTitle(tool) : isSessionTreeToolCall ? getSessionTreeToolTitle(tool) : isWebFetchToolCall ? getWebFetchToolTitle(tool) : isSkillLoadToolCall ? getSkillLoadToolTitle(tool) : tool.tool}
                                        toolName={tool.tool}
                                        type="dynamic-tool"
                                        viewMode={questionRequest ? currentViewMode : isDelegateToolCall ? currentDelegateViewMode : isTodoToolCall ? currentTodoViewMode : isSessionTreeToolCall ? currentSessionTreeViewMode : isWebFetchToolCall ? currentWebFetchViewMode : undefined}
                                        onViewChange={questionRequest ? handleViewModeChange : isDelegateToolCall ? handleDelegateViewModeChange : isTodoToolCall ? handleTodoViewModeChange : isSessionTreeToolCall ? handleSessionTreeViewModeChange : isWebFetchToolCall ? handleWebFetchViewModeChange : undefined}
                                        hasView={!!questionRequest || isDelegateToolCall || isTodoToolCall || isSessionTreeToolCall || isWebFetchToolCall}
                                        actions={webFetchActions}
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
                                        ) : (
                                          toolInput
                                        )}
                                        {!isDelegateToolCall && !isTodoToolCall && !isSessionTreeToolCall && !isWebFetchToolCall && !questionRequest && !isPermissionTool && (output || error) ? (
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
                        {info.role === "assistant" ? (
                          <MessageActions
                            className="relative mt-1 w-full"
                            style={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
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
          })}
          {(status === "submitted" || (status === "streaming" && (() => {
            const last = messages[messages.length - 1]
            return !last || last.info.role === "user" || (last.info.role === "assistant" && last.parts.length === 0)
          })())) && (
            <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 w-full">
              <div className="relative size-4 mt-[3px]">
                <div
                  className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: agentDotColor }}
                />
              </div>
              <div className="flex items-center gap-2 h-5">
                <div className="relative size-4 shrink-0">
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
                <span className="text-xs text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <div className="grid shrink-0 gap-4 pt-4">
        <div className={cn("relative w-full px-4 pb-4 transition-all duration-300", isChatCentered && "max-w-3xl mx-auto")}>
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
          <PromptInput globalDrop multiple onSubmit={handleSubmit}>
            <PromptInputHeader>
              <AttachmentsDisplay />
            </PromptInputHeader>
            {questionRequests.length > 0 && (() => {
              const request = questionRequests[0]
              const question = request.questions[questionStep]
              const currentSels = questionSelections[questionStep] ?? []
              return (
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
                      : settings.stt.provider === "openai-whisper" || settings.stt.provider === "google-gemini"
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
                        refreshModelGroups().catch(() => {})
                        refreshProviderTimeouts().catch(() => {})
                      }
                    }}
                    open={modelSelectorOpen}
                  >
                    <ModelSelectorTrigger asChild>
                      <PromptInputButton>
                        {selectedGroup ? (
                          <ModelSelectorName>{selectedGroup.name}</ModelSelectorName>
                        ) : selectedModel?.isFallback
                          ? (() => {
                              const activeSlot = fallbackActiveSlots[selectedModel.modelID]
                              const iconProvider = activeSlot?.providerID ?? "opencode"
                              return <ModelSelectorLogo provider={iconProvider} />
                            })()
                          : selectedModel?.providerID && <ModelSelectorLogo provider={selectedModel.providerID} />
                        }
                        {!selectedGroup && selectedModel?.modelName && <ModelSelectorName>{selectedModel.modelName}</ModelSelectorName>}
                        {selectedModel?.providerID && providerTimeouts[selectedModel.providerID]?.timedOut && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <ClockAlertIcon className="size-3.5 text-red-500 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Provider timed out: {providerTimeouts[selectedModel.providerID].reason}
                                {providerTimeouts[selectedModel.providerID].resetInSeconds != null &&
                                  ` (resets in ${Math.ceil(providerTimeouts[selectedModel.providerID].resetInSeconds! / 60)}m)`}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
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
                                    updateAgentModel("fallback", g.id)
                                  }}
                                >
                                  <ModelSelectorName>{g.name}</ModelSelectorName>
                                  {active ? <CheckIcon className="ml-auto size-4" /> : <div className="ml-auto size-4" />}
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
                                  {providerTimeouts[m.providerID]?.timedOut && (
                                    <ClockAlertIcon className="size-3 text-red-500 shrink-0" />
                                  )}
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

                {/* Notification bell */}
                <NotificationBell unreadCount={unreadCount}>
                  <NotificationPanel
                    notifications={notifications}
                    onMarkRead={markRead}
                    onMarkAllRead={markAllRead}
                    onRemove={removeNotification}
                    onClearAll={clearAll}
                  />
                </NotificationBell>

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
                  >
                    <ContextTrigger />
                    <ContextContent>
                      <ContextContentHeader />
                      <ContextContentBody>
                        <ContextInputUsage />
                        <ContextOutputUsage />
                        <ContextReasoningUsage />
                        <ContextCacheUsage />
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
          
          {/* Hotkey hint */}
          {settings.pushToTalk.enabled && settings.pushToTalk.hotkey && (
            <p className="text-center text-xs text-muted-foreground px-4 pb-2">
              Hold <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">{formatHotkey(settings.pushToTalk.hotkey)}</kbd> to record and send with voice reply
            </p>
          )}
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
