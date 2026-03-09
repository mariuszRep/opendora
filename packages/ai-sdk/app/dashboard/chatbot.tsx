"use client"

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input"

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageBranch,
  MessageBranchContent,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
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
import type { AssistantMessage, Part, ReasoningPart, TextPart } from "@/lib/opendora"
import { CheckIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

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

function getMessageText(parts: Part[]): string {
  return getTextParts(parts).map((p) => p.text).join("")
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
              const msgError = info.role === "assistant" ? (info as AssistantMessage).error : undefined
              return (
                <MessageBranch defaultBranch={0} key={info.id}>
                  <MessageBranchContent>
                    <Message from={info.role === "user" ? "user" : "assistant"} key={info.id}>
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
                            <MessageResponse>{content}</MessageResponse>
                          </MessageContent>
                        )}
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
              <PromptInputSubmit status={status} onStop={abort} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  )
}
