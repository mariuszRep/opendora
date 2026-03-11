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
import type { AssistantMessage, Part, ReasoningPart, TextPart, ToolPart } from "@/lib/opendora"
import { useVoiceSettings } from "@/hooks/use-voice-settings"
import { useTextToSpeech } from "@/hooks/use-text-to-speech"
import { CheckIcon, CopyIcon, Volume2Icon, VolumeXIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"

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
    createSession,
  } = useOpendoraContext()

  const { settings } = useVoiceSettings()
  const { speak, playingId, isLoading: isTtsLoading, isEnabled: isTtsEnabled } = useTextToSpeech()

  const [text, setText] = useState("")
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [selectedProviderID, setSelectedProviderID] = useState<string | null>(null)
  const [selectedModelID, setSelectedModelID] = useState<string | null>(null)

  useEffect(() => {
    const agent = agents.find((a) => a.name === selectedAgent)
    if (agent?.model) {
      setSelectedProviderID(agent.model.providerID)
      setSelectedModelID(agent.model.modelID)
    } else {
      setSelectedProviderID(null)
      setSelectedModelID(null)
    }
  }, [selectedAgent, agents])

  const modelList = useMemo(
    () =>
      providers
        .filter((p) => connectedProviders.includes(p.id))
        .flatMap((p) =>
          Object.values(p.models).map((m) => ({
            providerID: p.id,
            providerName: p.name,
            modelID: m.id,
            modelName: (m as { name?: string }).name ?? m.id,
          })),
        ),
    [providers, connectedProviders],
  )

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
          <ConversationContent>
            {messages.map(({ info, parts }) => {
              const content = getMessageText(parts)
              const reasoning = getReasoningPart(parts)
              const tools = getToolParts(parts)
              const msgError = info.role === "assistant" ? (info as AssistantMessage).error : undefined
              return (
                <MessageBranch defaultBranch={0} key={info.id}>
                  <MessageBranchContent>
                    <Message className="group/message" from={info.role === "user" ? "user" : "assistant"} key={info.id}>
                      <div>
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
                          <MessageContent>
                            <p className="text-destructive text-sm">
                              {String((msgError.data as { message?: string })?.message ?? msgError.name)}
                            </p>
                          </MessageContent>
                        ) : (
                          <MessageContent>
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
                              return (
                                <Tool
                                  defaultOpen={
                                    tool.tool === "question" || state === "output-available" || state === "output-error"
                                  }
                                  key={tool.id}
                                >
                                  <ToolHeader
                                    state={state}
                                    title={tool.tool}
                                    toolName={tool.tool}
                                    type="dynamic-tool"
                                  />
                                  <ToolContent>
                                    {questionRequest ? (
                                      <QuestionTool
                                        answered={answered}
                                        json={toolInput}
                                        onReject={rejectQuestion}
                                        onReply={replyQuestion}
                                        request={questionRequest}
                                      />
                                    ) : (
                                      toolInput
                                    )}
                                    {output || error ? (
                                      <ToolOutput errorText={error} output={output} />
                                    ) : null}
                                  </ToolContent>
                                </Tool>
                              )
                            })}
                            {content ? <MessageResponse>{content}</MessageResponse> : null}
                          </MessageContent>
                        )}
                        {info.role === "assistant" && content ? (
                          <MessageActions className="pointer-events-none invisible mt-1 justify-start opacity-0 transition-opacity group-hover/message:visible group-hover/message:pointer-events-auto group-hover/message:opacity-100">
                            <MessageAction
                              label="Copy"
                              onClick={() => handleCopy(content)}
                              tooltip="Copy to clipboard"
                              variant="outline"
                            >
                              <CopyIcon className="size-4" />
                            </MessageAction>
                            {isTtsEnabled && (
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
                          </MessageActions>
                        ) : null}
                      </div>
                    </Message>
                  </MessageBranchContent>
                </MessageBranch>
              )
            })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <div className="grid shrink-0 gap-4 pt-4">
        <div className="w-full px-4 pb-4">
          <PromptInput globalDrop multiple onSubmit={handleSubmit}>
            <PromptInputHeader>
              <AttachmentsDisplay />
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea
                onChange={(e) => setText(e.target.value)}
                value={text}
                placeholder={selectedSession ? "Type a message…" : "Create or select a session to chat"}
                disabled={questionRequests.length > 0}
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
                        {selectedModel?.providerID && <ModelSelectorLogo provider={selectedModel.providerID} />}
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
                                  }}
                                  value={`${m.providerID}:${m.modelID}`}
                                >
                                  <ModelSelectorLogo provider={m.providerID} />
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
        </div>
      </div>
    </div>
  )
}
