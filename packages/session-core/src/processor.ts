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

// Inline Identifier helper
const Identifier = {
  ascending(prefix: string): string {
    const now = Date.now()
    return `${prefix}_${now.toString(16).padStart(12, "0")}${Math.random().toString(36).slice(2, 14)}`
  },
}

// Inline iife helper
function iife<T>(fn: () => T): T {
  return fn()
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
      async process(streamInput: any) {
        needsCompaction = false
        const cfg = getConfig()
        const configSvc = cfg.config
        const shouldBreak = configSvc
          ? !(await configSvc.get().then((c: any) => c.experimental?.continue_loop_on_deny === true).catch(() => false))
          : true

        while (true) {
          try {
            let currentText: MessageV2.TextPart | undefined
            let reasoningMap: Record<string, MessageV2.ReasoningPart> = {}

            // streamInput must have .fullStream
            const stream = streamInput
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
                        let agent = await agentSvc.getByIdOrName(input.assistantMessage.agent)
                        if (!agent) {
                          const defaultAgentName = await agentSvc.defaultAgent()
                          agent = await agentSvc.get(defaultAgentName)
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
                    if (permissionNext) {
                      if (
                        value.error instanceof permissionNext.RejectedError ||
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
                  input.assistantMessage.finish = value.finishReason
                  input.assistantMessage.cost += usage.cost
                  input.assistantMessage.tokens = usage.tokens

                  const snapshotSvc = getConfig().snapshot
                  const stepSnapshot = snapshotSvc ? await snapshotSvc.track() : undefined

                  await input.updatePart({
                    id: Identifier.ascending("part"),
                    reason: value.finishReason,
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

                  if (input.isOverflow && await input.isOverflow({ tokens: usage.tokens, model: input.model })) {
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
          } catch (e: any) {
            console.error("[session-core] processor error:", e)
            const error = MessageV2.fromError(e, { providerID: input.model.providerID })
            if (MessageV2.ContextOverflowError.isInstance(error)) {
              // TODO: Handle context overflow error
            }
            const retry = SessionRetry.retryable(error)
            if (retry !== undefined) {
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
            input.assistantMessage.error = error
            const bus = getConfig().bus
            bus?.publish(SessionErrorEvent, {
              sessionID: input.assistantMessage.sessionID,
              error: input.assistantMessage.error,
            })
            SessionStatus.set(input.sessionID, { type: "idle" })
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
