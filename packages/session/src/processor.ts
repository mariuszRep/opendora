/**
 * SessionProcessor — migrated from opencode/src/session/processor.ts
 * Processes LLM stream events and updates message parts.
 *
 * Dependencies injected via getConfig():
 *   config.snapshot — Snapshot service (track/patch)
 *   config.plugin   — Plugin service (trigger hooks)
 *   config.permissionNext — PermissionNext.ask for doom-loop detection
 *   config.agent    — Agent service (getByIdOrName, defaultAgent, get)
 */

import { MessageV2 } from "./message-v2.ts"
import { getConfig } from "./config.ts"
import { SessionRetry } from "./retry.ts"
import { SessionStatus } from "./status.ts"
import { Identifier } from "@projectflows/util/id"
import { LLM } from "./llm.ts"
import { SessionEvents } from "./events.ts"
import { TokenUsage } from "./token-usage.ts"

// Inline iife helper
function iife<T>(fn: () => T): T {
  return fn()
}

// Mirrors ProviderError.OVERFLOW_PATTERNS from @projectflows/provider without a cross-package dep.
const OVERFLOW_PATTERNS: RegExp[] = [
  /prompt is too long/i,
  /input is too long for requested model/i,
  /exceeds the context window/i,
  /input token count.*exceeds the maximum/i,
  /maximum prompt length is \d+/i,
  /reduce the length of the messages/i,
  /maximum context length is \d+ tokens/i,
  /exceeds the limit of \d+/i,
  /exceeds the available context size/i,
  /greater than the context length/i,
  /context window exceeds limit/i,
  /exceeded model token limit/i,
  /context[_ ]length[_ ]exceeded/i,
]

function isOverflowMessage(msg: string): boolean {
  if (OVERFLOW_PATTERNS.some((p) => p.test(msg))) return true
  return /^4(00|13)\s*(status code)?\s*\(no body\)/i.test(msg)
}

/**
 * Map an HTTP status code (and optional message/responseBody) to a semantic error kind string.
 * Mirrors ProviderError.classifyErrorKind() from @projectflows/provider without
 * creating a cross-package dependency from @projectflows/session.
 */
function classifyErrorKind(
  statusCode: number | undefined,
  message?: string,
  providerID?: string,
  responseBody?: string,
): string {
  if (message && isOverflowMessage(message)) return "overflow"
  // OpenCode Zen "No provider available" is a transient router-capacity issue
  // misclassified as 401 auth — override to "server" so it's retryable and fallback-eligible.
  if (statusCode === 401 && providerID?.startsWith("opencode") && responseBody) {
    try {
      const body = JSON.parse(responseBody)
      if (body?.type === "error" && body?.error?.type === "ModelError" && body?.error?.message === "No provider available") {
        return "server"
      }
    } catch {}
  }
  switch (statusCode) {
    case 401:
    case 403:
      return "auth"
    case 404:
      return "not_found"
    case 400:
    case 413:
      return "invalid"
    case 429:
      return "quota"
    case 500:
      return "server"
    case 502:
    case 503:
    case 529:
      return "unavailable"
  }
  return "server"
}

/**
 * Whether an error kind should skip waiting for retry and immediately switch
 * to the next slot in a fallback group. Applies to errors where retrying the
 * same model is definitively pointless.
 */
function shouldSwitchImmediately(kind: string): boolean {
  // Authentication is user-actionable. Never conceal it by switching the run
  // to a different provider/model selected in a fallback group.
  return kind === "quota" || kind === "unavailable" || kind === "not_found"
}

// Inline SessionEvents.Error reference — matches events.ts
const SessionErrorEvent = { type: "session.error" }

export namespace SessionProcessor {
  const DOOM_LOOP_THRESHOLD = 3

  export type Info = Awaited<ReturnType<typeof create>>
  export type Result = Awaited<ReturnType<Info["process"]>>

  export function create(input: {
    assistantMessage: MessageV2.Assistant
    sessionID: string
    model: any // Provider.Model
    abort: AbortSignal
    // These are passed to allow processor to call Session methods without circular dep
    updateMessage: (msg: any) => Promise<any>
    updatePart: (part: any) => Promise<any>
    updatePartDelta: (input: any) => Promise<any>
    getUsage: (input: any) => any
    summarize?: (input: { sessionID: string; messageID: string }) => void
    isOverflow?: (input: { tokens: any; model: any }) => Promise<boolean>
    fallbackGroupID?: string
  }) {
    const toolcalls: Record<string, MessageV2.ToolPart> = {}
    let snapshot: string | undefined
    let blocked = false
    let attempt = 0
    let needsCompaction = false

    const result = {
      get message() {
        return input.assistantMessage
      },
      partFromToolCall(toolCallID: string) {
        return toolcalls[toolCallID]
      },
      async process(streamInput: LLM.StreamInput) {
        needsCompaction = false
        const cfg = getConfig()
        const configSvc = cfg.config
        const shouldBreak = configSvc
          ? !(await configSvc
              .get()
              .then((c: any) => c.experimental?.continue_loop_on_deny === true)
              .catch(() => false))
          : true

        while (true) {
          let capturedTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
          try {
            let currentText: MessageV2.TextPart | undefined
            let reasoningMap: Record<string, MessageV2.ReasoningPart> = {}

            const stream = await LLM.stream(streamInput)
            for await (const value of stream.fullStream) {
              input.abort.throwIfAborted()
              switch (value.type) {
                case "start":
                  SessionStatus.set(input.sessionID, { type: "busy" })
                  break

                case "reasoning-start":
                  if (value.id in reasoningMap) {
                    continue
                  }
                  const reasoningPart = {
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "reasoning" as const,
                    text: "",
                    time: {
                      start: Date.now(),
                    },
                    metadata: value.providerMetadata,
                  }
                  reasoningMap[value.id] = reasoningPart as any
                  await input.updatePart(reasoningPart)
                  break

                case "reasoning-delta":
                  if (value.id in reasoningMap) {
                    const part = reasoningMap[value.id]
                    ;(part as any).text += value.text
                    if (value.providerMetadata) (part as any).metadata = value.providerMetadata
                    await input.updatePartDelta({
                      sessionID: (part as any).sessionID,
                      messageID: (part as any).messageID,
                      partID: (part as any).id,
                      field: "text",
                      delta: value.text,
                    })
                  }
                  break

                case "reasoning-end":
                  if (value.id in reasoningMap) {
                    const part = reasoningMap[value.id]
                    ;(part as any).text = ((part as any).text as string).trimEnd()
                    ;(part as any).time = {
                      ...(part as any).time,
                      end: Date.now(),
                    }
                    if (value.providerMetadata) (part as any).metadata = value.providerMetadata
                    await input.updatePart(part)
                    delete reasoningMap[value.id]
                  }
                  break

                case "tool-input-start": {
                  const part = await input.updatePart({
                    id: toolcalls[value.id]?.id ?? Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "tool",
                    tool: value.toolName,
                    callID: value.id,
                    state: {
                      status: "pending",
                      input: {},
                      raw: "",
                    },
                  })
                  toolcalls[value.id] = part as MessageV2.ToolPart
                  break
                }

                case "tool-input-delta":
                  break

                case "tool-input-end":
                  break

                case "tool-call": {
                  const match = toolcalls[value.toolCallId]
                  if (match) {
                    const part = await input.updatePart({
                      ...match,
                      tool: value.toolName,
                      state: {
                        status: "running",
                        input: value.input,
                        time: {
                          start: Date.now(),
                        },
                      },
                      metadata: value.providerMetadata,
                    })
                    toolcalls[value.toolCallId] = part as MessageV2.ToolPart

                    const parts = await MessageV2.parts(input.assistantMessage.id)
                    const lastThree = parts.slice(-DOOM_LOOP_THRESHOLD)

                    if (
                      lastThree.length === DOOM_LOOP_THRESHOLD &&
                      lastThree.every(
                        (p) =>
                          p.type === "tool" &&
                          p.tool === value.toolName &&
                          p.state.status !== "pending" &&
                          JSON.stringify(p.state.input) === JSON.stringify(value.input),
                      )
                    ) {
                      // Doom loop detection — ask for permission via injected service
                      const permissionNext = getConfig().permissionNext
                      const agentSvc = getConfig().agent
                      if (permissionNext && agentSvc) {
                        let agent = await agentSvc.getByIdOrName?.(input.assistantMessage.agent)
                        if (!agent) {
                          const defaultAgentName = await agentSvc.defaultAgent?.()
                          agent = defaultAgentName ? await agentSvc.get(defaultAgentName) : undefined
                        }
                        if (agent) {
                          await permissionNext.ask({
                            permission: "doom_loop",
                            patterns: [value.toolName],
                            sessionID: input.assistantMessage.sessionID,
                            metadata: {
                              tool: value.toolName,
                              input: value.input,
                            },
                            always: [value.toolName],
                            ruleset: agent.permission,
                          })
                        }
                      }
                    }
                  }
                  break
                }

                case "tool-result": {
                  const match = toolcalls[value.toolCallId]
                  if (match && match.state.status === "running") {
                    await input.updatePart({
                      ...match,
                      state: {
                        status: "completed",
                        input: value.input ?? match.state.input,
                        output: value.output.output,
                        metadata: value.output.metadata,
                        title: value.output.title,
                        time: {
                          start: match.state.time.start,
                          end: Date.now(),
                        },
                        attachments: value.output.attachments,
                      },
                    })
                    delete toolcalls[value.toolCallId]
                  }
                  break
                }

                case "tool-error": {
                  const match = toolcalls[value.toolCallId]
                  if (match && match.state.status === "running") {
                    await input.updatePart({
                      ...match,
                      state: {
                        status: "error",
                        input: value.input ?? match.state.input,
                        error: (value.error as any).toString(),
                        time: {
                          start: match.state.time.start,
                          end: Date.now(),
                        },
                      },
                    })

                    const permissionNext = getConfig().permissionNext
                    const question = getConfig().question
                    if (permissionNext || question) {
                      if (
                        (permissionNext && value.error instanceof permissionNext.RejectedError) ||
                        (question && value.error instanceof question.RejectedError) ||
                        (value.error as any)?.name === "RejectedError" ||
                        (value.error as any)?.name === "QuestionRejectedError"
                      ) {
                        blocked = shouldBreak
                      }
                    }
                    delete toolcalls[value.toolCallId]
                  }
                  break
                }

                case "error":
                  throw value.error

                case "start-step": {
                  const snapshotSvc = getConfig().snapshot
                  snapshot = snapshotSvc ? await snapshotSvc.track() : undefined
                  await input.updatePart({
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.sessionID,
                    snapshot,
                    type: "step-start",
                  })
                  break
                }

                case "finish-step": {
                  const usage = input.getUsage({
                    model: input.model,
                    usage: value.usage,
                    metadata: value.providerMetadata,
                  })
                  const rawFinishReason = value.finishReason as any
                  const finishReason: string =
                    (typeof rawFinishReason === "object" && rawFinishReason !== null
                      ? rawFinishReason.unified
                      : rawFinishReason) ?? "unknown"
                  input.assistantMessage.finish = finishReason
                  input.assistantMessage.cost += usage.cost
                  input.assistantMessage.tokens = usage.tokens
                  capturedTokens.input += usage.tokens.input
                  capturedTokens.output += usage.tokens.output
                  capturedTokens.cacheRead += usage.tokens.cache.read
                  capturedTokens.cacheWrite += usage.tokens.cache.write
                  capturedTokens.reasoning += usage.tokens.reasoning

                  const snapshotSvc = getConfig().snapshot
                  const stepSnapshot = snapshotSvc ? await snapshotSvc.track() : undefined

                  await input.updatePart({
                    id: Identifier.ascending("part"),
                    reason: finishReason,
                    snapshot: stepSnapshot,
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "step-finish",
                    tokens: usage.tokens,
                    cost: usage.cost,
                  })
                  await input.updateMessage(input.assistantMessage)

                  if (snapshot && snapshotSvc) {
                    const patch = await snapshotSvc.patch(snapshot)
                    if (patch.files.length) {
                      await input.updatePart({
                        id: Identifier.ascending("part"),
                        messageID: input.assistantMessage.id,
                        sessionID: input.sessionID,
                        type: "patch",
                        hash: patch.hash,
                        files: patch.files,
                      })
                    }
                    snapshot = undefined
                  }

                  if (input.summarize) {
                    input.summarize({
                      sessionID: input.sessionID,
                      messageID: input.assistantMessage.parentID!,
                    })
                  }

                  if (input.isOverflow && (await input.isOverflow({ tokens: usage.tokens, model: input.model }))) {
                    needsCompaction = true
                  }
                  break
                }

                case "text-start":
                  currentText = {
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "text",
                    text: "",
                    time: {
                      start: Date.now(),
                    },
                    metadata: value.providerMetadata,
                  } as any
                  await input.updatePart(currentText)
                  break

                case "text-delta":
                  if (currentText) {
                    ;(currentText as any).text += value.text
                    if (value.providerMetadata) (currentText as any).metadata = value.providerMetadata
                    await input.updatePartDelta({
                      sessionID: (currentText as any).sessionID,
                      messageID: (currentText as any).messageID,
                      partID: (currentText as any).id,
                      field: "text",
                      delta: value.text,
                    })
                  }
                  break

                case "text-end":
                  if (currentText) {
                    ;(currentText as any).text = ((currentText as any).text as string).trimEnd()
                    const pluginSvc = getConfig().plugin
                    if (pluginSvc) {
                      const textOutput = await pluginSvc.trigger(
                        "experimental.text.complete",
                        {
                          sessionID: input.sessionID,
                          messageID: input.assistantMessage.id,
                          partID: (currentText as any).id,
                        },
                        { text: (currentText as any).text },
                      )
                      ;(currentText as any).text = textOutput.text
                    }
                    ;(currentText as any).time = {
                      start: Date.now(),
                      end: Date.now(),
                    }
                    if (value.providerMetadata) (currentText as any).metadata = value.providerMetadata
                    await input.updatePart(currentText)
                  }
                  currentText = undefined
                  break

                case "finish":
                  break

                default:
                  continue
              }
              if (needsCompaction) break
            }
            try {
              const responseHeaders = (await stream.response.catch(() => null))?.headers
              await TokenUsage.record({
                sessionID: input.sessionID,
                agentID: (input.assistantMessage as any).agent ?? undefined,
                projectID: getConfig().instance?.project?.id,
                providerID: streamInput.model.providerID,
                modelID: streamInput.model.id,
                purpose: "chat",
                tokens: capturedTokens,
                model: streamInput.model,
                headers: responseHeaders ?? undefined,
              })
            } catch {
              /* never let token tracking break the main flow */
            }
          } catch (e: any) {
            // Suppress AbortError — user-initiated cancellation is not an error
            if (e instanceof DOMException && e.name === "AbortError") {
              input.assistantMessage.time.completed = Date.now()
              await input.updateMessage(input.assistantMessage)
              SessionStatus.set(input.sessionID, { type: "idle" })
              return "stop"
            }
            console.error("[session-core] processor error:", e)
            const error = MessageV2.fromError(e, { providerID: input.model.providerID })
            const retry = SessionRetry.retryable(error)
            const statusCode = (error as any)?.data?.statusCode as number | undefined
            const apiError = error.name === "APIError" ? (error as any) : null
            const errorMessage = (error as any)?.data?.message ?? String(error)
            const errorKind =
              error.name === "ProviderAuthenticationRequiredError" ? "auth" : classifyErrorKind(statusCode, errorMessage, streamInput.model.providerID, apiError?.data?.responseBody)

            if (errorKind === "overflow") {
              // Context overflow: trigger compaction instead of treating as a hard error.
              // The proactive isOverflow check in prompt.ts catches most cases; this handles
              // the rare case where the API rejects a request we didn't expect to overflow
              // (e.g. large cache writes push the real token count past the limit).
              needsCompaction = true
              SessionStatus.set(input.sessionID, { type: "idle" })
              // Fall through to cleanup — needsCompaction=true causes "compact" return
            } else {
              // For quota errors, record token usage (partial usage counts toward the cap)
              if (errorKind === "quota") {
                TokenUsage.record({
                  sessionID: input.sessionID,
                  agentID: (input.assistantMessage as any).agent ?? undefined,
                  projectID: getConfig().instance?.project?.id,
                  providerID: streamInput.model.providerID,
                  modelID: streamInput.model.id,
                  purpose: "chat",
                  tokens: capturedTokens,
                  model: streamInput.model,
                  headers: apiError?.data?.responseHeaders ?? undefined,
                }).catch(() => {})
              }

              // Skip same-model retry and switch slots immediately for errors where
              // retrying the same upstream is definitively pointless.
              const switchImmediately = input.fallbackGroupID && shouldSwitchImmediately(errorKind)
              if (retry !== undefined && !switchImmediately && attempt < SessionRetry.MAX_RETRY_ATTEMPTS) {
                attempt++
                const delay = SessionRetry.delay(attempt, error.name === "APIError" ? (error as any) : undefined)
                SessionStatus.set(input.sessionID, {
                  type: "retry",
                  attempt,
                  message: retry,
                  next: Date.now() + delay,
                })
                await SessionRetry.sleep(delay, input.abort).catch(() => {})
                continue
              }

              // Report quota errors to the provider-level timeout tracker regardless of fallback
              if (errorKind === "quota") {
                await getConfig()
                  .provider?.reportProviderTimeout?.(
                    streamInput.model.providerID,
                    streamInput.model.id,
                    errorMessage,
                    apiError?.data?.responseHeaders,
                    apiError?.data?.responseBody,
                    errorKind,
                  )
                  .catch(() => {})
              }

              // Fallback group: try next slot before hard-failing.
              if (input.fallbackGroupID && errorKind !== "auth") {
                const currentSlot = { providerID: streamInput.model.providerID, modelID: streamInput.model.id }
                const result = await getConfig()
                  .provider?.reportFallbackError?.(
                    input.fallbackGroupID,
                    currentSlot,
                    statusCode,
                    errorMessage,
                    apiError?.data?.responseHeaders,
                    apiError?.data?.responseBody,
                    errorKind,
                  )
                  .catch(() => undefined)

                const nextSlot = result?.nextSlot ?? (result && "providerID" in result ? result : null)
                if (nextSlot && "providerID" in nextSlot) {
                  const slot = nextSlot as { providerID: string; modelID: string }
                  const nextModel = await getConfig().provider?.getModel(slot.providerID, slot.modelID)
                  if (nextModel) {
                    streamInput = { ...streamInput, model: nextModel }
                    input.model = nextModel
                    getConfig().bus?.publish(SessionEvents.FallbackSwitched, {
                      sessionID: input.sessionID,
                      groupID: input.fallbackGroupID,
                      previousSlot: currentSlot,
                      newSlot: nextSlot,
                    })
                    await input.updatePart({
                      id: Identifier.ascending("part"),
                      sessionID: input.sessionID,
                      messageID: input.assistantMessage.id,
                      type: "fallback-switch",
                      previousSlot: currentSlot,
                      newSlot: nextSlot,
                      groupID: input.fallbackGroupID,
                      errorKind,
                      resetAt: result?.resetAt ?? null,
                      statusCode,
                      time: { created: Date.now() },
                    })
                    attempt = 0
                    continue
                  }
                }
              }

              input.assistantMessage.error = error
              const bus = getConfig().bus
              bus?.publish(SessionErrorEvent, {
                sessionID: input.assistantMessage.sessionID,
                error: input.assistantMessage.error,
              })
              SessionStatus.set(input.sessionID, { type: "idle" })
            }
          }

          // Cleanup unfinished snapshot
          const snapshotSvc = getConfig().snapshot
          if (snapshot && snapshotSvc) {
            const patch = await snapshotSvc.patch(snapshot)
            if (patch.files.length) {
              await input.updatePart({
                id: Identifier.ascending("part"),
                messageID: input.assistantMessage.id,
                sessionID: input.sessionID,
                type: "patch",
                hash: patch.hash,
                files: patch.files,
              })
            }
            snapshot = undefined
          }

          // Mark any still-pending tool parts as errored
          const p = await MessageV2.parts(input.assistantMessage.id)
          for (const part of p) {
            if (part.type === "tool" && part.state.status !== "completed" && part.state.status !== "error") {
              await input.updatePart({
                ...part,
                state: {
                  ...part.state,
                  status: "error",
                  error: "Tool execution aborted",
                  time: {
                    start: Date.now(),
                    end: Date.now(),
                  },
                },
              })
            }
          }

          input.assistantMessage.time.completed = Date.now()
          await input.updateMessage(input.assistantMessage)
          if (needsCompaction) return "compact"
          if (blocked) return "stop"
          if (input.assistantMessage.error) return "stop"
          return "continue"
        }
      },
    }
    return result
  }
}
