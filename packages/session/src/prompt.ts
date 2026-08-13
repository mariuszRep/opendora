import path from "path"
import os from "os"
import fs from "fs/promises"
import z from "zod"
import { fn } from "@projectflows/util/fn"
import { Identifier } from "@projectflows/util/id"
import { MessageV2 } from "./message-v2.ts"
import { SessionRevert } from "./revert.ts"
import { Session } from "./session.ts"
import { type Tool as AITool, tool, jsonSchema, type ToolCallOptions, asSchema } from "ai"
import { SessionCompaction } from "./compaction.ts"
import { getConfig } from "./config.ts"
import { InstructionPrompt } from "./instruction.ts"
import MAX_STEPS from "./prompt/max-steps.txt"
import { SessionSummary } from "./summary.ts"
import { NamedError } from "@projectflows/util/error"
import { NotFoundError } from "@projectflows/storage/db"
import { SessionProcessor } from "./processor.ts"
import { SessionStatus } from "./status.ts"
import { Delegation } from "./delegation.ts"
import { LLM } from "./llm.ts"
import { ulid } from "ulid"
import { spawn } from "child_process"
import { $, fileURLToPath, pathToFileURL } from "bun"

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

// Inline defer utility
function defer(fn: () => any) {
  return { [Symbol.dispose]() { fn() } }
}

// Inline iife utility
function iife<T>(fn: () => T): T {
  return fn()
}

const log = {
  clone() { return this as typeof log },
  tag(_k: string, _v: string) { return this as typeof log },
  info(_msg: string, _data?: any) {},
  error(_msg: string, _data?: any) {},
  warn(_msg: string, _data?: any) {},
  time(_msg: string) { return { [Symbol.dispose]() {} } },
}

const Default = {
  warn(_msg: string, _data?: any) {},
}

const STRUCTURED_OUTPUT_DESCRIPTION = `Use this tool to return your final response in the requested structured format.

IMPORTANT:
- You MUST call this tool exactly once at the end of your response
- The input must be valid JSON matching the required schema
- Complete all necessary research and tool calls BEFORE calling this tool
- This tool provides your final answer - no further actions are taken after calling it`


export namespace SessionPrompt {
  // Module-level state map — equivalent to Instance.state()
  type Waiter = {
    resolve(input: MessageV2.WithParts): void
    reject(reason?: any): void
  }

  const _state: Record<
    string,
    {
      abort: AbortController
      callbacks: Waiter[]
      pendingRestarts: Waiter[]
    }
  > = {}

  // Cleanup handler
  async function cleanupState() {
    for (const item of Object.values(_state)) {
      item.abort.abort()
    }
  }

  function state() {
    return _state
  }

  export function assertNotBusy(sessionID: string) {
    const match = state()[sessionID]
    if (match) throw new Session.BusyError(sessionID)
  }

  export type WorkflowMeta = {
    workflowID: string
    workflowRunID: string
    nodeID?: string
    nodeType?: string
    nodeLabel?: string
    attempt?: number
  }

  // In-memory store for extra tools that cannot be serialized to the DB.
  // Keyed by sessionID — only one prompt is active per session at a time.
  // done=true once any extra tool has been called → stops re-injecting and exits the loop.
  // workflowMeta (when set) tags the resulting assistant message so a forced
  // extra-tool turn can serve as a durable, traceable workflow node record.
  const _extraToolsState = new Map<string, { tools: Record<string, AITool>; done: boolean; workflowMeta?: WorkflowMeta }>()

  export function markExtraToolsDone(sessionID: string) {
    const entry = _extraToolsState.get(sessionID)
    if (entry) entry.done = true
  }

  export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
    /** ID of the message in the parent session that triggered this prompt (cross-session parent) */
    parentMessageID: Identifier.schema("message").optional(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    agent: z.string().optional(),
    /** Display name of the human sender, stored as structured attribution (never baked into part text) */
    userName: z.string().optional(),
    noReply: z.boolean().optional(),
    noWait: z.boolean().optional(),
    hidden: z.boolean().optional(),
    queued: z.boolean().optional(),
    format: MessageV2.Format.optional(),
    system: z.string().optional(),
    variant: z.string().optional(),
    schedule_id: z.string().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    parts: z.array(
      z.discriminatedUnion("type", [
        MessageV2.TextPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "TextPartInput",
          }),
        MessageV2.FilePart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "FilePartInput",
          }),
        MessageV2.AgentPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "AgentPartInput",
          }),
        MessageV2.SubtaskPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "SubtaskPartInput",
          }),
      ]),
    ),
  })
  export type PromptInput = z.infer<typeof PromptInput>

  export const prompt = fn(PromptInput, async (input) => {
    const session = await Session.get(input.sessionID)
    await SessionRevert.cleanup(session, {
      getMessages: async (sid) => { const r = [] as MessageV2.WithParts[]; for await (const m of MessageV2.stream(sid)) r.push(m); return r },
      clearRevert: Session.clearRevert,
    })

    const message = await createUserMessage(input)
    await Session.touch(input.sessionID)

    if (input.noReply === true) {
      return message
    }

    if (input.noWait === true) {
      // Fire LLM in background — caller does not wait for the response.
      // Layer 1 of delegation delivery: if this message started a delegated
      // child turn, wake its asker as soon as this loop resolves — the happy
      // path, backstopped by the session.status bus listener and boot reconcile
      // (see delegation.ts / delegation-listener.ts) for anything that doesn't
      // go through here (process crash, unhandled rejection, etc).
      loop({ sessionID: input.sessionID })
        .then((finalMsg) => {
          const text = finalMsg.parts.findLast((p) => p.type === "text")?.text ?? ""
          return Delegation.deliver(message.info.id, { ...Delegation.classify(finalMsg.info as any), result: text })
        })
        .catch((err) => {
          log.error("background loop error", { sessionID: input.sessionID, err })
          return Delegation.deliver(message.info.id, {
            state: "error",
            reason: "unhandled-loop-exception",
            result: err instanceof Error ? err.message : String(err),
          }).catch(() => {})
        })
      return message
    }

    return loop({ sessionID: input.sessionID })
  })

  /**
   * Like prompt() but injects extra tools for this turn only.
   * The model is forced to call one of these tools (all other tools are stripped).
   * The loop exits immediately after any extra tool is called.
   * extraTools are kept in-memory and never serialized to the DB.
   */
  export async function promptWithExtraTools(
    input: z.infer<typeof PromptInput>,
    extraTools: Record<string, AITool>,
    workflowMeta?: WorkflowMeta,
  ): Promise<MessageV2.WithParts> {
    _extraToolsState.set(input.sessionID, { tools: extraTools, done: false, workflowMeta })
    try {
      return await prompt(input)
    } finally {
      _extraToolsState.delete(input.sessionID)
    }
  }

  export async function resolvePromptParts(template: string): Promise<PromptInput["parts"]> {
    const cfg = getConfig()
    const parts: PromptInput["parts"] = [
      {
        type: "text",
        text: template,
      },
    ]
    const configMarkdown = cfg.configMarkdown
    if (!configMarkdown) return parts

    const files = (await configMarkdown.files?.(template)) ?? []
    const seen = new Set<string>()
    const worktree = cfg.instance?.worktree ?? process.cwd()
    await Promise.all(
      files.map(async (match: any) => {
        const name = match[1] ?? match
        if (seen.has(name)) return
        seen.add(name)
        const filepath = name.startsWith("~/")
          ? path.join(os.homedir(), name.slice(2))
          : path.resolve(worktree, name)

        const stats = await fs.stat(filepath).catch(() => undefined)
        if (!stats) {
          const agent = await cfg.agent?.get(name)
          if (agent) {
            parts.push({
              type: "agent",
              name: agent.name,
            })
          }
          return
        }

        if (stats.isDirectory()) {
          parts.push({
            type: "file",
            url: pathToFileURL(filepath).href,
            filename: name,
            mime: "application/x-directory",
          })
          return
        }

        parts.push({
          type: "file",
          url: pathToFileURL(filepath).href,
          filename: name,
          mime: "text/plain",
        })
      }),
    )
    return parts
  }

  function start(sessionID: string) {
    const s = state()
    if (s[sessionID]) return
    const controller = new AbortController()
    s[sessionID] = {
      abort: controller,
      callbacks: [],
      pendingRestarts: [],
    }
    return controller.signal
  }

  function resume(sessionID: string) {
    const s = state()
    if (!s[sessionID]) return

    return s[sessionID].abort.signal
  }

  /**
   * `cascade` is opt-in and defaults to false because this same function is
   * also invoked unconditionally on every natural loop exit (see the
   * `defer(() => cancel(sessionID))` in loop() below) — a session going idle
   * because it has nothing left to do right now (e.g. it just fired an async
   * delegation and is waiting to be woken) must NOT cancel that delegation.
   * Only genuine external aborts (the HTTP abort route, agent-target.ts's
   * ctx.abort) should cascade into the sessions this one is waiting on.
   */
  export function cancel(sessionID: string, opts?: { cascade?: boolean }) {
    log.info("cancel", { sessionID, cascade: opts?.cascade })
    if (opts?.cascade) {
      Delegation.cancelSubtree(sessionID).catch((err) => log.error("cancelSubtree failed", { sessionID, err }))
    }
    const s = state()
    const match = s[sessionID]
    if (!match) {
      SessionStatus.set(sessionID, { type: "idle" })
      return
    }
    match.abort.abort()
    for (const cb of match.callbacks) {
      cb.reject(new Error("Session cancelled"))
    }
    const restarts = match.pendingRestarts
    delete s[sessionID]
    SessionStatus.set(sessionID, { type: "idle" })
    if (restarts.length > 0) {
      loop({ sessionID })
        .then((msg) => { for (const r of restarts) r.resolve(msg) })
        .catch((err) => { for (const r of restarts) r.reject(err) })
    }
    return
  }

  export const LoopInput = z.object({
    sessionID: Identifier.schema("session"),
    resume_existing: z.boolean().optional(),
  })

  /** Exported for Delegation's bus-listener backstop — same terminal-message check the loop itself uses. */
  export function isFinalAssistant(info: MessageV2.Info) {
    return (
      info.role === "assistant" &&
      (!!info.error || !!info.time.completed || !!info.finish) &&
      !["tool-calls", "unknown"].includes(info.finish ?? "")
    )
  }

  export function isQueuedUser(msg: MessageV2.WithParts) {
    return msg.info.role === "user" && msg.info.queue?.status === "queued"
  }

  async function hasQueuedUser(sessionID: string) {
    for await (const msg of MessageV2.stream(sessionID)) {
      if (isQueuedUser(msg)) return true
    }
    return false
  }

  /**
   * Finds the most recent (user, final-assistant) pair whose turn has actually
   * concluded — same "should the loop exit" condition as the main loop's own
   * check (lastAssistant.finish set, terminal, and newer than lastUser; lastUser
   * not itself still queued). Used by Delegation's session.status bus-listener
   * backstop, which only knows a sessionID went idle and needs to work out
   * which user message that idle event actually answers, without duplicating
   * the loop's internal scan logic.
   */
  export async function lastCompletedTurn(
    sessionID: string,
  ): Promise<{ userMessageID: string; finalMessage: MessageV2.WithParts } | undefined> {
    const msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
    let lastUser: MessageV2.WithParts | undefined
    let lastUserIndex = -1
    let lastAssistant: MessageV2.WithParts | undefined
    let lastAssistantIndex = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]!
      if (!lastUser && msg.info.role === "user") {
        lastUser = msg
        lastUserIndex = i
      }
      if (!lastAssistant && msg.info.role === "assistant") {
        lastAssistant = msg
        lastAssistantIndex = i
      }
      if (lastUser && lastAssistant) break
    }
    if (!lastUser || !lastAssistant) return undefined
    if (isQueuedUser(lastUser)) return undefined
    if (!isFinalAssistant(lastAssistant.info) || lastAssistantIndex <= lastUserIndex) return undefined
    return { userMessageID: lastUser.info.id, finalMessage: lastAssistant }
  }

  async function activateQueuedMessage(queued: MessageV2.WithParts) {
    if (queued.info.role !== "user" || !queued.info.queue) return undefined

    const next: MessageV2.User = {
      ...queued.info,
      queue: {
        ...queued.info.queue,
        status: "processing",
        activatedAt: Date.now(),
      },
    }
    await Session.updateMessage(next)
    queued.info = next
    return next.id
  }

  async function activateOldestQueuedUser(msgs: MessageV2.WithParts[]) {
    // A force-requested queued message jumps the line and bypasses the
    // isFinalAssistant gate below — see SessionPrompt.requestImmediateActivation.
    const forced = msgs.find((msg) => isQueuedUser(msg) && msg.info.role === "user" && msg.info.queue?.activateRequested)
    if (forced) return activateQueuedMessage(forced)

    const latestAssistant = [...msgs].reverse().find((msg) => msg.info.role === "assistant")?.info
    if (!latestAssistant || !isFinalAssistant(latestAssistant)) return undefined

    const queued = msgs.find(isQueuedUser)
    if (!queued) return undefined

    return activateQueuedMessage(queued)
  }

  /**
   * Force a specific queued user message to be picked up on the loop's next
   * iteration instead of waiting for the current assistant turn to fully finish.
   * Safe because every outer loop iteration already re-reads messages fresh and
   * only starts once the prior iteration's own tool calls/results are resolved —
   * this only changes *when* within that existing cadence the message is allowed in.
   */
  export async function requestImmediateActivation(input: { sessionID: string; messageID: string }) {
    const message = await MessageV2.get({ sessionID: input.sessionID, messageID: input.messageID }).catch(() => undefined)
    if (!message || message.info.role !== "user" || message.info.queue?.status !== "queued") {
      throw new NotFoundError({ message: `Queued message not found: ${input.messageID}` })
    }
    const next: MessageV2.User = {
      ...message.info,
      queue: {
        ...message.info.queue,
        activateRequested: true,
      },
    }
    await Session.updateMessage(next)

    // If the loop already exited before this flag landed, nothing will ever
    // recheck it — kick a fresh loop so the queued message actually drains.
    if (!state()[input.sessionID]) {
      loop({ sessionID: input.sessionID }).catch((err) =>
        log.error("activation loop error", { sessionID: input.sessionID, err }),
      )
    }
  }

  function modelContextForQueuedTurn(msgs: MessageV2.WithParts[], activeQueuedUserID?: string) {
    const active = activeQueuedUserID ? msgs.find((msg) => msg.info.id === activeQueuedUserID) : undefined
    const withoutWaiting = msgs.filter((msg) => !isQueuedUser(msg) && msg.info.id !== activeQueuedUserID)
    if (!active) return withoutWaiting
    return [...withoutWaiting, active]
  }

  export const loop = fn(LoopInput, async (input) => {
    const { sessionID, resume_existing } = input
    const cfg = getConfig()

    const abort = resume_existing ? resume(sessionID) : start(sessionID)
    if (!abort) {
      if (!resume_existing) {
        return new Promise<MessageV2.WithParts>((resolve, reject) => {
          const s = state()[sessionID]
          if (!s) {
            // Race: session freed between start() and here — retry immediately
            loop({ sessionID }).then(resolve).catch(reject)
            return
          }
          s.pendingRestarts.push({ resolve, reject })
        })
      }
      return new Promise<MessageV2.WithParts>((resolve, reject) => {
        const callbacks = state()[sessionID]!.callbacks
        callbacks.push({ resolve, reject })
      })
    }

    using _ = defer(() => cancel(sessionID))

    // Structured output state
    let structuredOutput: unknown | undefined
    let structuredOutputRetries = 0

    let step = 0
    const session = await Session.get(sessionID)
    while (true) {
      SessionStatus.set(sessionID, { type: "busy" })
      log.info("loop", { step, sessionID })
      if (abort.aborted) break
      let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
      const activeQueuedUserID = await activateOldestQueuedUser(msgs)
      msgs = modelContextForQueuedTurn(msgs, activeQueuedUserID)

      let lastUser: MessageV2.User | undefined
      let lastUserIndex = -1
      let lastAssistant: MessageV2.Assistant | undefined
      let lastAssistantIndex = -1
      let lastFinished: MessageV2.Assistant | undefined
      let lastFinishedIndex = -1
      let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]!
        if (!lastUser && msg.info.role === "user") {
          lastUser = msg.info as MessageV2.User
          lastUserIndex = i
        }
        if (!lastAssistant && msg.info.role === "assistant") {
          lastAssistant = msg.info as MessageV2.Assistant
          lastAssistantIndex = i
        }
        if (!lastFinished && msg.info.role === "assistant" && msg.info.finish) {
          lastFinished = msg.info as MessageV2.Assistant
          lastFinishedIndex = i
        }
        if (lastUser && lastFinished) break
        const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
        if (task && !lastFinished) {
          tasks.push(...task)
        }
      }

      if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
      if (
        !activeQueuedUserID &&
        lastAssistant?.finish &&
        !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
        lastAssistantIndex > lastUserIndex
      ) {
        log.info("exiting loop", { sessionID })
        break
      }

      if (!lastUser.model?.providerID || !lastUser.model?.modelID) {
        throw new Error(
          `No valid model in user message for session ${sessionID}. ` +
          `providerID=${String(lastUser.model?.providerID)} modelID=${String(lastUser.model?.modelID)}`,
        )
      }
      const _resolvedModel = lastUser.model.providerID === "fallback"
        ? await (async () => {
            const slot = await cfg.provider?.resolveFallback?.(lastUser.model.modelID)
            if (!slot) throw new Error("fallback model resolution is not configured")
            return cfg.provider!.getModel(slot.providerID, slot.modelID)
          })()
        : null
      const model = _resolvedModel ?? await cfg.provider?.getModel(lastUser.model.providerID, lastUser.model.modelID).catch((e: any) => {
        if (cfg.provider?.ModelNotFoundError?.isInstance?.(e)) {
          const hint = e.data.suggestions?.length ? ` Did you mean: ${e.data.suggestions.join(", ")}?` : ""
          cfg.bus?.publish(Session.Event.Error, {
            sessionID,
            error: new NamedError.Unknown({
              message: `Model not found: ${e.data.providerID}/${e.data.modelID}.${hint}`,
            }).toObject(),
          })
        }
        throw e
      })

      step++
      if (step === 1)
        await ensureTitle({
          session,
          modelID: model.id,
          providerID: model.providerID,
          history: msgs,
        }).catch((error) => {
          log.error("failed to ensure title", { sessionID, error })
        })
      const task = tasks.pop()
      const effectiveDirectory = await Session.effectiveDefaultPath(sessionID)
      const rootDirectory = cfg.instance?.worktree ?? process.cwd()

      // pending subtask
      if (task?.type === "subtask") {
        const taskModel = task.model ? await cfg.provider?.getModel(task.model.providerID, task.model.modelID) : model
        const assistantMessage = (await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "assistant",
          from: { kind: "agent", id: task.agent },
          parentID: lastUser.id,
          sessionID,
          mode: task.agent,
          agent: task.agent,
          variant: lastUser.variant,
          path: {
            cwd: effectiveDirectory,
            root: rootDirectory,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: taskModel.id,
          providerID: taskModel.providerID,
          time: {
            created: Date.now(),
          },
        })) as MessageV2.Assistant
        let part = (await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: assistantMessage.id,
          sessionID: assistantMessage.sessionID,
          type: "tool",
          callID: ulid(),
          tool: `agent__${task.agent}`,
          state: {
            status: "running",
            input: {
              prompt: task.prompt,
              description: task.description,
              subagent_type: task.agent,
              command: task.command,
            },
            time: {
              start: Date.now(),
            },
          },
        })) as MessageV2.ToolPart
        const taskArgs = {
          prompt: task.prompt,
          description: task.description,
          subagent_type: task.agent,
          command: task.command,
        }
        await cfg.plugin?.trigger(
          "tool.execute.before",
          {
            tool: `agent__${task.agent}`,
            sessionID,
            callID: part.id,
          },
          { args: taskArgs },
        )
        let executionError: Error | undefined
        let taskAgent = await cfg.agent?.getByIdOrName?.(task.agent)
        if (!taskAgent) {
          const defaultAgentName = await cfg.agent?.defaultAgent?.()
          taskAgent = defaultAgentName ? await cfg.agent?.get?.(defaultAgentName) : undefined
          if (!taskAgent) {
            throw new Error(`Agent "${task.agent}" not found and default agent is also unavailable`)
          }
          Default.warn("subtask agent not found, using default", {
            requested: task.agent,
            fallback: defaultAgentName,
          })
        }
        // Subtask/slash-command-driven delegation runs through the same durable primitives
        // agent__<name> uses (Session.create + prompt() + Delegation.record/finalizeSync)
        // instead of the retired standalone `task` tool. Always synchronous — the subtask
        // mechanism blocks and attaches its result to `part` inline, so there is no async
        // wake to schedule. No permission `ask()` step: this is a system-synthesized call
        // (a slash command resolving to a subagent), not the model choosing to invoke a
        // tool, matching the old task.ts's bypassAgentCheck path it replaces.
        let result: { title: string; metadata: Record<string, unknown>; output: string } | undefined
        try {
          const childSession = await Session.create({
            title: task.description,
            sessionType: "worker",
            agentID: taskAgent.id,
            ownerID: lastUser.agent,
            ownerKind: "agent",
            parentSessionID: sessionID,
          })
          const childMessageID = Identifier.ascending("message")
          const edgeID = Delegation.record({
            askerSessionID: sessionID,
            askerMessageID: assistantMessage.id,
            childSessionID: childSession.id,
            childMessageID,
            agent: taskAgent.id,
            description: task.description,
            mode: "sync",
            toolCallID: part.callID,
          })
          const childResult = await prompt({
            sessionID: childSession.id,
            agent: taskAgent.id,
            messageID: childMessageID,
            parentMessageID: assistantMessage.id,
            parts: await resolvePromptParts(task.prompt),
          })
          const text = childResult.parts.findLast((p) => p.type === "text")?.text ?? ""
          const childError = childResult.info.role === "assistant" ? childResult.info.error : undefined
          Delegation.finalizeSync(edgeID, { state: childError ? "error" : "completed", result: text })
          result = {
            title: task.description,
            metadata: {
              sessionId: childSession.id,
              agent: taskAgent.id,
              mode: "sync",
              created: true,
              action: "create_session",
            },
            output: text,
          }
        } catch (error: any) {
          executionError = error
          log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
          result = undefined
        }
        const attachments = (result as any)?.attachments?.map((attachment: any) => ({
          ...attachment,
          id: Identifier.ascending("part"),
          sessionID,
          messageID: assistantMessage.id,
        }))
        await cfg.plugin?.trigger(
          "tool.execute.after",
          {
            tool: `agent__${task.agent}`,
            sessionID,
            callID: part.id,
            args: taskArgs,
          },
          result,
        )
        assistantMessage.finish = "tool-calls"
        assistantMessage.time.completed = Date.now()
        await Session.updateMessage(assistantMessage)
        if (result && part.state.status === "running") {
          await Session.updatePart({
            ...part,
            state: {
              status: "completed",
              input: part.state.input,
              title: result.title,
              metadata: result.metadata,
              output: result.output,
              attachments,
              time: {
                ...part.state.time,
                end: Date.now(),
              },
            },
          } satisfies MessageV2.ToolPart)
        }
        if (!result) {
          await Session.updatePart({
            ...part,
            state: {
              status: "error",
              error: executionError ? `Tool execution failed: ${executionError.message}` : "Tool execution failed",
              time: {
                start: part.state.status === "running" ? (part.state as any).time.start : Date.now(),
                end: Date.now(),
              },
              metadata: part.metadata,
              input: part.state.input,
            },
          } satisfies MessageV2.ToolPart)
        }

        if (task.command) {
          const summaryUserMsg: MessageV2.User = {
            id: Identifier.ascending("message"),
            sessionID,
            role: "user",
            time: {
              created: Date.now(),
            },
            agent: lastUser.agent,
            model: lastUser.model,
          }
          await Session.updateMessage(summaryUserMsg)
          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: summaryUserMsg.id,
            sessionID,
            type: "text",
            text: "Summarize the task tool output above and continue with your task.",
            synthetic: true,
          } satisfies MessageV2.TextPart)
        }

        // Check if the tool result has stopAfterReply flag set
        if (result?.metadata?.stopAfterReply === true) {
          log.info("stopAfterReply detected, breaking loop", { agent: task.agent, tool: (task as any).tool })
          break
        }

        continue
      }

      // pending compaction
      if (task?.type === "compaction") {
        const instance = cfg.instance ?? { directory: process.cwd(), worktree: process.cwd(), project: { id: "unknown" } }
        const result = await SessionCompaction.process({
          messages: msgs,
          parentID: lastUser.id,
          abort,
          sessionID,
          auto: task.auto,
          updateMessage: Session.updateMessage,
          updatePart: Session.updatePart,
          updatePartDelta: Session.updatePartDelta,
          getUsage: Session.getUsage,
          instance,
        })
        if (result === "stop") break
        continue
      }

      // context overflow, needs compaction.
      // Measured against both the previous call's provider-reported usage AND the size of
      // what's actually about to be sent — a large tool result added since lastFinished
      // (or a fresh session with no completed call yet) wouldn't show up in lastFinished.tokens
      // alone, and would otherwise sail past this guard straight into a hard provider error.
      if (
        (!lastFinished || lastFinished.summary !== true) &&
        (await SessionCompaction.isOverflow({
          tokens: lastFinished?.tokens,
          model,
          freshMessages: MessageV2.toModelMessages(msgs, model),
        }))
      ) {
        await SessionCompaction.create({
          sessionID,
          agent: lastUser.agent,
          model: lastUser.model,
          auto: true,
        })
        continue
      }

      // normal processing
      let agent = await cfg.agent?.getByIdOrName?.(lastUser.agent)
      if (!agent) {
        const defaultAgentName = await cfg.agent?.defaultAgent?.()
        agent = defaultAgentName ? await cfg.agent?.get?.(defaultAgentName) : undefined
        if (!agent) {
          throw new Error(`Agent "${lastUser.agent}" not found and default agent is also unavailable`)
        }
        Default.warn("agent not found, using default", {
          requested: lastUser.agent,
          fallback: defaultAgentName,
        })
      }
      const maxSteps = agent.steps ?? Infinity
      const isLastStep = step >= maxSteps
      msgs = await insertReminders({
        messages: msgs,
        agent,
        session,
      })

      // Resolve extra tools early so we can use the entry in processor creation below.
      const _extraToolsEntry = _extraToolsState.get(sessionID)

      const processor = SessionProcessor.create({
        assistantMessage: (await Session.updateMessage({
          id: Identifier.ascending("message"),
          parentID: lastUser.id,
          role: "assistant",
          from: { kind: "agent", id: agent.id },
          mode: agent.name,
          agent: agent.id,
          variant: lastUser.variant,
          path: {
            cwd: effectiveDirectory,
            root: rootDirectory,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          ...(_extraToolsEntry?.workflowMeta ? { workflowMeta: _extraToolsEntry.workflowMeta } : {}),
          time: {
            created: Date.now(),
          },
          sessionID,
          // When extra tools are present, the model's tool call should be visible even if
          // the triggering user message is hidden — that turn's own message is the canonical
          // visible record (see runner.ts's agentArgs handling for the workflow-side rationale).
          ...((lastUser.hidden && !_extraToolsEntry) ? { hidden: true } : {}),
        })) as MessageV2.Assistant,
        sessionID: sessionID,
        model,
        abort,
        fallbackGroupID: lastUser.model.providerID === "fallback" ? lastUser.model.modelID : undefined,
        updateMessage: Session.updateMessage,
        updatePart: Session.updatePart,
        updatePartDelta: Session.updatePartDelta,
        getUsage: Session.getUsage,
        summarize: (input: { sessionID: string; messageID: string }) =>
          SessionSummary.summarize(input),
        isOverflow: (input: { tokens: any; model: any }) =>
          SessionCompaction.isOverflow(input),
      })
      using _2 = defer(() => InstructionPrompt.clear(processor.message.id))

      // Check if user explicitly invoked an agent via @ in this turn
      const lastUserMsg = msgs.findLast((m) => m.info.role === "user")
      const bypassAgentCheck = lastUserMsg?.parts.some((p) => p.type === "agent") ?? false

      const tools = await resolveTools({
        agent,
        session,
        model,
        tools: lastUser.tools,
        processor,
        bypassAgentCheck,
        messages: msgs,
      })

      // Inject StructuredOutput tool if JSON schema mode enabled.
      // toolName overrides the tool name (e.g. "workflow_structured" for workflow nodes).
      if (lastUser.format?.type === "json_schema") {
        const structuredToolName = lastUser.format.toolName ?? "StructuredOutput"
        tools[structuredToolName] = createStructuredOutputTool({
          schema: lastUser.format.schema,
          onSuccess(output: unknown) {
            structuredOutput = output
          },
        })
        // Strip every other tool — model must call the structured tool immediately.
        for (const id of Object.keys(tools)) {
          if (id !== structuredToolName && id !== "invalid") {
            delete tools[id]
          }
        }
      }

      // Inject caller-supplied tools (e.g. workflow_decide, workflow_structured).
      // Strip all other tools so the model is forced to call one of these.
      // Skip if already done (tool was called in a prior iteration).
      if (_extraToolsEntry && !_extraToolsEntry.done && Object.keys(_extraToolsEntry.tools).length > 0) {
        for (const id of Object.keys(tools)) {
          if (id !== "invalid") delete tools[id]
        }
        for (const [id, t] of Object.entries(_extraToolsEntry.tools)) {
          tools[id] = t
        }
      }

      if (step === 1) {
        SessionSummary.summarize({
          sessionID: sessionID,
          messageID: lastUser.id,
        })
      }

      // Ephemerally wrap queued user messages with a reminder to stay on track
      if (step > 1 && lastFinished) {
        for (let i = 0; i < msgs.length; i++) {
          const msg = msgs[i]!
          if (msg.info.role !== "user" || i <= lastFinishedIndex) continue
          for (const part of msg.parts) {
            if (part.type !== "text" || part.ignored || part.synthetic) continue
            if (!part.text.trim()) continue
            part.text = [
              "<system-reminder>",
              "The user sent the following message:",
              part.text,
              "",
              "Please address this message and continue with your tasks.",
              "</system-reminder>",
            ].join("\n")
          }
        }
      }

      await cfg.plugin?.trigger("experimental.chat.messages.transform", {}, { messages: msgs })

      // System prompt is now built inside LLM.stream() via SystemPrompt.build()
      // so both the agent loop and the UI preview use identical code.
      // Structured output requires an extra instruction appended after build().
      const format = lastUser.format ?? { type: "text" }
      const structuredToolName = format.type === "json_schema" ? (format.toolName ?? "StructuredOutput") : "StructuredOutput"
      const structuredOutputSystem = format.type === "json_schema"
        ? [`IMPORTANT: The user has requested structured output. You MUST use the \`${structuredToolName}\` tool to provide your final response. Do NOT respond with plain text - you MUST call the \`${structuredToolName}\` tool with your answer formatted according to the schema.`]
        : []

      const systemAdditions = [...structuredOutputSystem]

      const result = await processor.process({
        user: lastUser,
        agent,
        abort,
        sessionID,
        system: systemAdditions.length > 0 ? systemAdditions : undefined,
        messages: [
          ...MessageV2.toModelMessages(msgs, model),
          ...(isLastStep
            ? [
              {
                role: "assistant" as const,
                content: MAX_STEPS,
              },
            ]
            : []),
        ],
        tools,
        model,
        toolChoice: (format.type === "json_schema" || (_extraToolsEntry && !_extraToolsEntry.done)) ? "required" : (format.toolChoice ?? undefined),
      })

      // If structured output was captured, save it and exit
      if (structuredOutput !== undefined) {
        processor.message.structured = structuredOutput
        processor.message.finish = processor.message.finish ?? "stop"
        await Session.updateMessage(processor.message)
        break
      }

      // If extra tools were called this iteration, exit — the tool call IS the result
      if (_extraToolsEntry?.done) break

      const modelFinished = processor.message.finish && !["tool-calls", "unknown"].includes(processor.message.finish)

      if (modelFinished && !processor.message.error) {
        if (format.type === "json_schema") {
          const maxStructuredOutputRetries = format.retryCount ?? 2
          if (structuredOutputRetries < maxStructuredOutputRetries) {
            structuredOutputRetries++
            const nudgeMsg: MessageV2.User = {
              id: Identifier.ascending("message"),
              sessionID,
              role: "user",
              time: { created: Date.now() },
              agent: lastUser.agent,
              model: lastUser.model,
              format,
            }
            await Session.updateMessage(nudgeMsg)
            await Session.updatePart({
              id: Identifier.ascending("part"),
              messageID: nudgeMsg.id,
              sessionID,
              type: "text",
              text: `You did not call the \`${structuredToolName}\` tool. You MUST call it now with your final answer formatted according to the schema — do not respond with plain text.`,
              synthetic: true,
            } satisfies MessageV2.TextPart)
            continue
          }
          processor.message.error = new MessageV2.StructuredOutputError({
            message: "Model did not produce structured output",
            retries: structuredOutputRetries,
          }).toObject()
          await Session.updateMessage(processor.message)
          break
        }
      }

      if (result === "stop") {
        // A step-budget-exhausted turn looks identical to a genuine stop — the
        // MAX_STEPS nudge above tells the model to wrap up, and it dutifully
        // returns finish="stop" with a confident summary. Tag it so downstream
        // consumers (Delegation.classify) can tell "done" from "ran out of steps".
        if (isLastStep && processor.message.finish === "stop" && !processor.message.error) {
          processor.message.finish = "step-limit"
          await Session.updateMessage(processor.message)
        }
        if (await hasQueuedUser(sessionID)) continue
        break
      }
      if (result === "compact") {
        if (lastFinished?.summary === true) {
          // The model overflowed immediately after a compaction — the compacted
          // context is still too large for this model. Stop instead of looping.
          break
        }
        await SessionCompaction.create({
          sessionID,
          agent: lastUser.agent,
          model: lastUser.model,
          auto: true,
        })
      }
      continue
    }
    const cfg2 = getConfig()
    const instance2 = cfg2.instance ?? { directory: process.cwd(), worktree: process.cwd(), project: { id: "unknown" } }
    SessionCompaction.prune({
      sessionID,
      getMessages: (sid) => Session.messages({ sessionID: sid }),
      updatePart: Session.updatePart,
    })
    for await (const item of MessageV2.stream(sessionID)) {
      if (item.info.role === "user") continue
      const queued = state()[sessionID]?.callbacks ?? []
      for (const q of queued) {
        q.resolve(item)
      }
      return item
    }
    throw new Error("Impossible")
  })

  async function lastModel(sessionID: string) {
    const cfg = getConfig()
    // Walk the session chain: worker sessions have no user messages of their own,
    // but their parentSessionID points to the session that spawned them.
    let sid: string | undefined = sessionID
    while (sid) {
      for await (const item of MessageV2.stream(sid)) {
        if (item.info.role === "user" && item.info.model) return item.info.model
      }
      const info: Session.Info | undefined = await Session.get(sid).catch(() => undefined)
      sid = info?.parentSessionID ?? info?.replyToSessionID ?? undefined
    }
    const fallback = await cfg.provider?.defaultModel?.()
    if (!fallback?.providerID || !fallback?.modelID) {
      throw new Error(
        `No default model available for session ${sessionID}. ` +
        `provider=${String(fallback?.providerID)} model=${String(fallback?.modelID)}`,
      )
    }
    return fallback
  }

  /** @internal Exported for testing */
  export async function resolveTools(input: {
    agent: any
    model: any
    session: Session.Info
    tools?: Record<string, boolean>
    processor: any
    bypassAgentCheck: boolean
    messages: MessageV2.WithParts[]
  }) {
    const cfg = getConfig()
    const tools: Record<string, AITool> = {}
    const effectiveDirectory = await Session.effectiveDefaultPath(input.session)
    const worktree = cfg.instance?.worktree ?? process.cwd()

    const context = (args: any, options: ToolCallOptions): any => ({
      sessionID: input.session.id,
      abort: options.abortSignal!,
      messageID: input.processor.message.id,
      callID: options.toolCallId,
      extra: {
        model: input.model,
        bypassAgentCheck: input.bypassAgentCheck,
        directory: effectiveDirectory,
        worktree,
        skillTools: cfg.skillTools ? {
          get: (sid: string) => cfg.skillTools!.get(sid),
          add: (sid: string, toolIds: string[]) => cfg.skillTools!.add(sid, toolIds),
        } : undefined,
        skills: {
          all: () => cfg.skill?.all?.(),
          get: (name: string) => cfg.skill?.get?.(name),
          search: (query: string, registries?: string[]) => cfg.skill?.search?.(query, registries),
          install: (source: string, options?: any) => cfg.skill?.install?.(source, options),
          create: (params: any) => cfg.skill?.create?.(params),
          remove: (name: string) => cfg.skill?.remove?.(name),
          update: (name: string) => cfg.skill?.update?.(name),
          uninstall: (name: string) => cfg.skill?.uninstall?.(name),
          list: () => cfg.skill?.list?.(),
          save: (location: string, content: string) => cfg.skill?.save?.(location, content),
          saveConfig: (name: string, patch: { tools?: string[] }) => cfg.skill?.saveConfig?.(name, patch),
        },
        agents: {
          list: () => cfg.agent?.list?.(),
          get: (id: string) => cfg.agent?.get?.(id),
          getInjection: (id: string) => cfg.agent?.getInjection?.(id),
          create: (id: string, c: any, persona?: string, injection?: string) => cfg.agent?.create?.(id, c, persona, injection),
          update: (id: string, patch: any, persona?: string, injection?: string) => cfg.agent?.update?.(id, patch, persona, injection),
          remove: (id: string) => cfg.agent?.remove?.(id),
        },
        config: {
          get: () => cfg.config?.get(),
          directories: () => cfg.config?.directories(),
        },
        containsPath: (p: string) => cfg.instance?.containsPath?.(p),
        allowedPaths: (input.session as any).path ? [(input.session as any).path as string] : undefined,
        readPath: (input.session as any).readPath as string | undefined,
        session: {
          list: (filter?: any) => Session.list(filter),
          children: (id: string) => Session.children(id),
          get: (id: string) => Session.get(id),
          messages: (id: string | { sessionID?: string }) => {
            const sessionID = typeof id === "string" ? id : id?.sessionID
            if (!sessionID) throw new Error("session.messages requires sessionID (string) or { sessionID: string }")
            return Session.messages({ sessionID })
          },
          create: (opts: any) => Session.create(opts),
          ensureMainSession: (agentID: string) => Session.ensureMainSession(agentID),
          setReplyToSessionID: (opts: any) => Session.setReplyToSessionID(opts),
          getMessage: (messageId: string) => Session.getMessage(messageId),
          reply: (opts: any) => Session.reply(opts),
          pong: (sessionID: string, opts: any) => Session.pong(sessionID, opts),
          setTitle: (sessionId: string, title: string) => Session.setTitle({ sessionID: sessionId, title }),
          setAgentID: (sessionId: string, agentId: string) => Session.setAgentID({ sessionID: sessionId, agentID: agentId }),
          setParentSessionID: (opts: { sessionID: string; parentSessionID: string }) => Session.setParentSessionID(opts),
          setSessionStatus: (sessionId: string, status: string) => Session.setSessionStatus({ sessionID: sessionId, status: status as any }),
          getStatus: async (sessionId: string) => SessionStatus.get(sessionId),
          createNext: (input: any) => Session.createNext(input),
          setCwd: (input: { sessionID: string; cwd: string }) => Session.setCwd(input),
        },
        delegation: {
          record: (input: any) => Delegation.record(input),
          finalizeSync: (edgeID: string, input: any) => Delegation.finalizeSync(edgeID, input),
          countPendingForAsker: (askerSessionID: string) => Delegation.countPendingForAsker(askerSessionID),
        },
        promptCancel: (sessionID: string) => cancel(sessionID, { cascade: true }),
        prompt: (opts: any) => SessionPrompt.prompt(opts),
        resolvePromptParts: (template: string) => resolvePromptParts(template),
        question: cfg.question ? (params: any) => cfg.question!.ask(params) : undefined,
        schedule: cfg.schedule ? {
          list: () => cfg.schedule!.list(),
          get: (id: string) => cfg.schedule!.get(id),
          run: (id: string) => cfg.schedule!.run(id),
          create: (input: any) => cfg.schedule!.create(input),
          update: (id: string, patch: any) => cfg.schedule!.update(id, patch),
          remove: (id: string) => cfg.schedule!.remove(id),
        } : undefined,
        workflow: cfg.workflow ? {
          get: (id: string) => cfg.workflow!.get?.(id),
          availableIds: () => cfg.workflow!.availableIds?.() ?? Promise.resolve([]),
          run: (workflow: any, sessionId: string, input: Record<string, unknown>, directory: string) =>
            cfg.workflow!.run!(workflow, sessionId, input, directory),
          runDetailed: (workflow: any, sessionId: string, input: Record<string, unknown>, directory: string) =>
            cfg.workflow!.runDetailed!(workflow, sessionId, input, directory),
          sandboxRun: (workflow: any, sessionId: string, input: Record<string, unknown>, directory: string, seedCtx?: Record<string, unknown>) =>
            cfg.workflow!.sandboxRun!(workflow, sessionId, input, directory, seedCtx),
        } : undefined,
        emit: (type: string, payload: unknown) => {
          cfg.bus?.publish({ type }, payload)
        },
      },
      agent: input.agent.id ?? input.agent.name,
      messages: input.messages,
      metadata: async (val: { title?: string; metadata?: any }) => {
        const match = input.processor.partFromToolCall(options.toolCallId)
        if (match && match.state.status === "running") {
          await Session.updatePart({
            ...match,
            state: {
              title: val.title,
              metadata: val.metadata,
              status: "running",
              input: args,
              time: {
                start: Date.now(),
              },
            },
          })
        }
      },
      async ask(req: any) {
        const skillToolRules = [...(cfg.skillTools?.get(input.session.id) ?? new Set<string>())]
          .filter(t => !t.startsWith("__skill__:"))
          .map(t => ({ permission: t, pattern: "*", action: "allow" as const }))
        await cfg.permissionNext?.ask({
          ...req,
          sessionID: input.session.id,
          agentID: input.agent.id,
          tool: { messageID: input.processor.message.id, callID: options.toolCallId },
          ruleset: cfg.permissionNext?.merge?.(input.agent.permission, skillToolRules),
        })
      },
    })

    const toolRegistryItems = await cfg.toolRegistry?.get({ modelID: input.model.api.id, providerID: input.model.providerID }, input.agent) ?? {}
    for (const [id, item] of Object.entries(toolRegistryItems as Record<string, any>)) {
      const rawSchema = await import("zod").then(z => {
        try {
          return z.default.toJSONSchema(item.parameters) as any
        } catch {
          return asSchema(item.parameters).jsonSchema
        }
      })
      const schema = cfg.providerTransform?.schema?.(input.model, rawSchema) ?? rawSchema
      tools[id] = tool({
        id: id as any,
        description: item.description,
        inputSchema: jsonSchema(schema as any),
        async execute(args: any, options: any) {
          const ctx = context(args, options)
          await cfg.plugin?.trigger(
            "tool.execute.before",
            {
              tool: id,
              sessionID: ctx.sessionID,
              callID: ctx.callID,
            },
            {
              args,
            },
          )
          const result = await item.execute(args, ctx)
          const output = {
            ...result,
            attachments: result.attachments?.map((attachment: any) => ({
              ...attachment,
              id: Identifier.ascending("part"),
              sessionID: ctx.sessionID,
              messageID: input.processor.message.id,
            })),
          }
          await cfg.plugin?.trigger(
            "tool.execute.after",
            {
              tool: id,
              sessionID: ctx.sessionID,
              callID: ctx.callID,
              args,
            },
            output,
          )
          return output
        },
      })
    }

    const mcpTools = await cfg.mcp?.get?.(
      input.session.id,
      input.agent,
      input.model,
      undefined,
      new AbortController().signal,
    ) ?? {}

    for (const [key, item] of Object.entries(mcpTools as Record<string, any>)) {
      const execute = item.execute
      if (!execute) continue

      const transformed = cfg.providerTransform?.schema?.(input.model, asSchema(item.inputSchema).jsonSchema) ?? asSchema(item.inputSchema).jsonSchema
      item.inputSchema = jsonSchema(transformed as any)
      item.execute = async (args: any, opts: any) => {
        const ctx = context(args, opts)

        await cfg.plugin?.trigger(
          "tool.execute.before",
          {
            tool: key,
            sessionID: ctx.sessionID,
            callID: opts.toolCallId,
          },
          {
            args,
          },
        )

        await ctx.ask({
          permission: key,
          metadata: {},
          patterns: ["*"],
          always: ["*"],
        })

        const result = await execute(args, opts)

        await cfg.plugin?.trigger(
          "tool.execute.after",
          {
            tool: key,
            sessionID: ctx.sessionID,
            callID: opts.toolCallId,
            args,
          },
          result,
        )

        const textParts: string[] = []
        const attachments: any[] = []

        for (const contentItem of result.content) {
          if (contentItem.type === "text") {
            textParts.push(contentItem.text)
          } else if (contentItem.type === "image") {
            attachments.push({
              type: "file",
              mime: contentItem.mimeType,
              url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
            })
          } else if (contentItem.type === "resource") {
            const { resource } = contentItem
            if (resource.text) {
              textParts.push(resource.text)
            }
            if (resource.blob) {
              attachments.push({
                type: "file",
                mime: resource.mimeType ?? "application/octet-stream",
                url: `data:${resource.mimeType ?? "application/octet-stream"};base64,${resource.blob}`,
                filename: resource.uri,
              })
            }
          }
        }

        const truncated = await cfg.truncate?.output?.(textParts.join("\n\n"), {}, input.agent) ?? { content: textParts.join("\n\n"), truncated: false, outputPath: undefined }
        const metadata = {
          ...(result.metadata ?? {}),
          truncated: truncated.truncated,
          ...(truncated.truncated && { outputPath: truncated.outputPath }),
        }

        return {
          title: "",
          metadata,
          output: truncated.content,
          attachments: attachments.map((attachment: any) => ({
            ...attachment,
            id: Identifier.ascending("part"),
            sessionID: ctx.sessionID,
            messageID: input.processor.message.id,
          })),
          content: result.content,
        }
      }
      tools[key] = item
    }

    // Filter by agent tools allowlist, expanded by any tools unlocked via skill_load.
    // An explicit `tools` array (including `[]`) is a restriction; a MISSING `tools` field
    // means "no restriction" — every registered tool stays, matching the UI default
    // ("leave all unchecked to allow all tools") and the system-prompt endpoint's
    // hasToolRestriction semantics.
    {
      const skillUnlocked = cfg.skillTools?.get(input.session.id) ?? new Set<string>()
      const declaredTools = input.agent.tools as string[] | undefined
      if (Array.isArray(declaredTools)) {
        const allowed = new Set([...declaredTools, ...skillUnlocked])
        for (const id of Object.keys(tools)) {
          if (id !== "invalid" && id !== "StructuredOutput" && !allowed.has(id)) {
            delete tools[id]
          }
        }
      }
    }

    return tools
  }

  /** @internal Exported for testing */
  export function createStructuredOutputTool(input: {
    schema: Record<string, any>
    onSuccess: (output: unknown) => void
  }): AITool {
    const { $schema, ...toolSchema } = input.schema

    return tool({
      id: "StructuredOutput" as any,
      description: STRUCTURED_OUTPUT_DESCRIPTION,
      inputSchema: jsonSchema(toolSchema as any),
      async execute(args: any) {
        input.onSuccess(args)
        return {
          output: "Structured output captured successfully.",
          title: "Structured Output",
          metadata: { valid: true },
        }
      },
      toModelOutput(result: any) {
        return {
          type: "text",
          value: result.output,
        }
      },
    })
  }

  async function createUserMessage(input: PromptInput) {
    if (input.messageID) {
      const existing = await MessageV2.get({ sessionID: input.sessionID, messageID: input.messageID }).catch(() => undefined)
      if (existing?.info.role === "user") return existing
    }

    const cfg = getConfig()
    // Resolution order: explicit input.agent -> session.agentID -> defaultAgent
    let agentName = input.agent
    let source = "input.agent"
    if (!agentName) {
      const session = await Session.get(input.sessionID).catch(() => undefined)
      agentName = session?.agentID
      source = "session.agentID"
    }
    if (!agentName) {
      agentName = await cfg.agent?.defaultAgent?.()
      source = "defaultAgent"
    }
    console.log(`[prompt] createUserMessage sessionID=${input.sessionID} resolvedAgent=${agentName} source=${source}`)
    const agent = await (cfg.agent?.getByIdOrName?.(agentName ?? "") ?? cfg.agent?.get?.(agentName ?? ""))
    if (!agent) throw new Error(`Unknown agent: ${input.agent}`)
    console.log(`[prompt] createUserMessage resolved agent.id=${agent.id} agent.name=${agent.name}`)

    const model = input.model ?? agent.model ?? (await lastModel(input.sessionID))
    if (!model?.providerID || !model?.modelID) {
      throw new Error(
        `Could not resolve model for session ${input.sessionID}. ` +
        `providerID=${String(model?.providerID)} modelID=${String(model?.modelID)}`,
      )
    }
    const full =
      !input.variant && agent.variant
        ? await cfg.provider?.getModel(model.providerID, model.modelID).catch(() => undefined)
        : undefined
    const variant = input.variant ?? (agent.variant && full?.variants?.[agent.variant] ? agent.variant : undefined)

    // ── DELEGATION ATTRIBUTION ──
    // If this message has a parentMessageID (cross-session delegation), look up the parent
    // to get the delegating agent's ID and set from.kind='agent' so [agent:name] prefix appears
    let from: MessageV2.Actor | undefined
    if (input.parentMessageID) {
      const parentMsg = await Session.getMessage(input.parentMessageID)
      if (parentMsg && parentMsg.role === "assistant" && parentMsg.from) {
        from = parentMsg.from
      }
    }
    if (!from && input.userName) {
      from = { kind: "user", id: input.userName }
    }

    const info: MessageV2.Info = {
      id: input.messageID ?? Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      ...(from ? { from } : {}),
      tools: input.tools,
      agent: agent.id,
      model,
      system: input.system,
      format: input.format,
      variant,
      ...(input.schedule_id ? { schedule_id: input.schedule_id } : {}),
      ...(input.hidden ? { hidden: true } : {}),
      ...(input.queued
        ? {
          queue: {
            status: "queued" as const,
            submittedAt: Date.now(),
          },
        }
        : {}),
    }
    using _3 = defer(() => InstructionPrompt.clear(info.id))

    type Draft<T> = T extends MessageV2.Part ? Omit<T, "id"> & { id?: string } : never
    const assign = (part: Draft<MessageV2.Part>): MessageV2.Part => ({
      ...part,
      id: part.id ?? Identifier.ascending("part"),
    })

    const parts = await Promise.all(
      input.parts.map(async (part): Promise<Draft<MessageV2.Part>[]> => {
        if (part.type === "file") {
          // MCP resource handling
          if (part.source?.type === "resource") {
            const { clientName, uri } = part.source
            log.info("mcp resource", { clientName, uri, mime: part.mime })

            const pieces: Draft<MessageV2.Part>[] = [
              {
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Reading MCP resource: ${part.filename} (${uri})`,
              },
            ]

            try {
              const resourceContent = await cfg.mcp?.readResource?.(clientName, uri)
              if (!resourceContent) {
                throw new Error(`Resource not found: ${clientName}/${uri}`)
              }

              const contents = Array.isArray(resourceContent.contents)
                ? resourceContent.contents
                : [resourceContent.contents]

              for (const content of contents) {
                if ("text" in content && content.text) {
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: content.text as string,
                  })
                } else if ("blob" in content && content.blob) {
                  const mimeType = "mimeType" in content ? content.mimeType : part.mime
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `[Binary content: ${mimeType}]`,
                  })
                }
              }

              pieces.push({
                ...part,
                messageID: info.id,
                sessionID: input.sessionID,
              })
            } catch (error: unknown) {
              log.error("failed to read MCP resource", { error, clientName, uri })
              const message = error instanceof Error ? error.message : String(error)
              pieces.push({
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Failed to read MCP resource ${part.filename}: ${message}`,
              })
            }

            return pieces
          }
          const url = new URL(part.url)
          switch (url.protocol) {
            case "data:":
              if (part.mime === "text/plain") {
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: Buffer.from(part.url, "base64url").toString(),
                  },
                  {
                    ...part,
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }
              break
            case "file:": {
              log.info("file", { mime: part.mime })
              const filepath = fileURLToPath(part.url)
              const statResult = await fs.stat(filepath).catch(() => undefined)

              if (statResult?.isDirectory()) {
                part.mime = "application/x-directory"
              }

              if (part.mime === "text/plain") {
                let offset: number | undefined = undefined
                let limit: number | undefined = undefined
                const range = {
                  start: url.searchParams.get("start"),
                  end: url.searchParams.get("end"),
                }
                if (range.start != null) {
                  const filePathURI = part.url.split("?")[0]!
                  let start = parseInt(range.start)
                  let end = range.end ? parseInt(range.end) : undefined
                  if (start === end) {
                    const symbols = await cfg.lsp?.documentSymbol?.(filePathURI).catch(() => []) ?? []
                    for (const symbol of symbols) {
                      let symbolRange: any | undefined
                      if ("range" in symbol) {
                        symbolRange = symbol.range
                      } else if ("location" in symbol) {
                        symbolRange = (symbol as any).location.range
                      }
                      if (symbolRange?.start?.line && symbolRange?.start?.line === start) {
                        start = symbolRange.start.line
                        end = symbolRange?.end?.line ?? start
                        break
                      }
                    }
                  }
                  offset = Math.max(start, 1)
                  if (end) {
                    limit = end - (offset - 1)
                  }
                }
                const args = { filePath: filepath, offset, limit }

                const pieces: Draft<MessageV2.Part>[] = [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                ]

                await cfg.readTool?.init?.()
                  .then(async (t: any) => {
                    const model2 = await cfg.provider?.getModel(info.model.providerID, info.model.modelID).catch(() => undefined)
                    const readCtx: any = {
                      sessionID: input.sessionID,
                      abort: new AbortController().signal,
                      agent: input.agent,
                      messageID: info.id,
                      extra: {
                        bypassCwdCheck: true,
                        model: model2,
                        directory: cfg.instance?.directory ?? process.cwd(),
                        worktree: cfg.instance?.worktree ?? process.cwd(),
                      },
                      messages: [],
                      metadata: async () => {},
                      ask: async () => {},
                    }
                    const result = await t.execute(args, readCtx)
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: result.output,
                    })
                    if (result.attachments?.length) {
                      pieces.push(
                        ...result.attachments.map((attachment: any) => ({
                          ...attachment,
                          synthetic: true,
                          filename: attachment.filename ?? part.filename,
                          messageID: info.id,
                          sessionID: input.sessionID,
                        })),
                      )
                    } else {
                      pieces.push({
                        ...part,
                        messageID: info.id,
                        sessionID: input.sessionID,
                      })
                    }
                  })
                  .catch((error: any) => {
                    log.error("failed to read file", { error })
                    const message = error instanceof Error ? error.message : error.toString()
                    cfg.bus?.publish(Session.Event.Error, {
                      sessionID: input.sessionID,
                      error: new NamedError.Unknown({
                        message,
                      }).toObject(),
                    })
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    })
                  })

                return pieces
              }

              if (part.mime === "application/x-directory") {
                const args = { filePath: filepath }
                const listCtx: any = {
                  sessionID: input.sessionID,
                  abort: new AbortController().signal,
                  agent: input.agent,
                  messageID: info.id,
                  extra: { bypassCwdCheck: true },
                  messages: [],
                  metadata: async () => {},
                  ask: async () => {},
                }
                const result = await cfg.readTool?.init?.().then((t: any) => t.execute(args, listCtx))
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: result?.output ?? "",
                  },
                  {
                    ...part,
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }

              cfg.fileTime?.file?.(filepath)
              const fileBytes = await fs.readFile(filepath)
              return [
                {
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  text: `Called the Read tool with the following input: {"filePath":"${filepath}"}`,
                  synthetic: true,
                },
                {
                  id: part.id,
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "file",
                  url: `data:${part.mime};base64,` + fileBytes.toString("base64"),
                  mime: part.mime,
                  filename: part.filename!,
                  source: part.source,
                },
              ]
            }
          }
        }

        if (part.type === "agent") {
          const perm = cfg.permissionNext?.evaluate?.("agent", part.name, agent.permission)
          const hint = perm?.action === "deny" ? " . Invoked by user; guaranteed to exist." : ""
          return [
            {
              ...part,
              messageID: info.id,
              sessionID: input.sessionID,
            },
            {
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text:
                " Use the above message and context to generate a prompt and call agent__" +
                part.name +
                " (action: create_session) to delegate to it" +
                hint,
            },
          ]
        }

        return [
          {
            ...part,
            messageID: info.id,
            sessionID: input.sessionID,
          },
        ]
      }),
    ).then((x) => x.flat().map(assign))

    await cfg.plugin?.trigger(
      "chat.message",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        messageID: input.messageID,
        variant: input.variant,
      },
      {
        message: info,
        parts,
      },
    )

    await Session.updateMessage(info, input.parentMessageID)
    for (const part of parts) {
      await Session.updatePart(part)
    }

    return {
      info,
      parts,
    }
  }

  async function insertReminders(input: { messages: MessageV2.WithParts[]; agent: any; session: Session.Info }) {
    const cfg = getConfig()
    const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
    if (!userMessage) return input.messages

    // Generic agent injection system — always a separate synthetic message after the
    // last user message, never merged into the message itself.
    if (input.agent.config?.enableInjection) {
      const injection = await cfg.agent?.getInjection?.(input.agent.id)
      if (injection) {
        const syntheticID = Identifier.ascending("message")
        const injectionMessage: MessageV2.WithParts = {
          info: {
            id: syntheticID,
            role: "user",
            sessionID: userMessage.info.sessionID,
            time: { created: Date.now() },
            agent: (userMessage.info as any).agent,
            model: (userMessage.info as any).model,
          } as any,
          parts: [
            {
              id: Identifier.ascending("part"),
              messageID: syntheticID,
              sessionID: userMessage.info.sessionID,
              type: "text",
              text: injection,
              synthetic: true,
            } as MessageV2.TextPart,
          ],
        }
        const idx = input.messages.lastIndexOf(userMessage)
        input.messages.splice(idx + 1, 0, injectionMessage)
      }
    }

    // Original logic when experimental plan mode is disabled
    if (!process.env.PROJECTFLOWS_EXPERIMENTAL_PLAN_MODE) {
      return input.messages
    }

    // New plan mode logic when flag is enabled
    const assistantMessage = input.messages.findLast((msg) => msg.info.role === "assistant")

    // Switching from plan mode to build mode
    if (input.agent.name !== "plan" && assistantMessage?.info.agent === "plan") {
      const plan = Session.plan(input.session)
      let exists = false
      try { await fs.access(plan); exists = true } catch {}
      if (exists) {
        const part = await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: userMessage.info.id,
          sessionID: userMessage.info.sessionID,
          type: "text",
          text: `A plan file exists at ${plan}. You should execute on the plan defined within it`,
          synthetic: true,
        })
        userMessage.parts.push(part)
      }
      return input.messages
    }

    // Entering plan mode
    if (input.agent.name === "plan" && assistantMessage?.info.agent !== "plan") {
      const plan = Session.plan(input.session)
      let exists = false
      try { await fs.access(plan); exists = true } catch {}
      if (!exists) await fs.mkdir(path.dirname(plan), { recursive: true })

      const planInfo = exists
        ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.`
        : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`

      userMessage.parts.push({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: planInfo,
        synthetic: true,
      })
      return input.messages
    }
    return input.messages
  }

  export const ShellInput = z.object({
    sessionID: Identifier.schema("session"),
    agent: z.string(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    command: z.string(),
  })
  export type ShellInput = z.infer<typeof ShellInput>
  export async function shell(input: ShellInput) {
    const abort = start(input.sessionID)
    if (!abort) {
      throw new Session.BusyError(input.sessionID)
    }

    using _4 = defer(() => {
      const callbacks = state()[input.sessionID]?.callbacks ?? []
      if (callbacks.length === 0) {
        cancel(input.sessionID)
      } else {
        loop({ sessionID: input.sessionID, resume_existing: true }).catch((error) => {
          log.error("session loop failed to resume after shell command", { sessionID: input.sessionID, error })
        })
      }
    })

    const cfg = getConfig()
    const session = await Session.get(input.sessionID)
    if (session.revert) {
      await SessionRevert.cleanup(session, {
        getMessages: async (sid) => { const r = [] as MessageV2.WithParts[]; for await (const m of MessageV2.stream(sid)) r.push(m); return r },
        clearRevert: Session.clearRevert,
      })
    }
    const agent = await (cfg.agent?.getByIdOrName?.(input.agent) ?? cfg.agent?.get?.(input.agent))
    if (!agent) throw new Error(`Unknown agent: ${input.agent}`)
    const model = input.model ?? agent.model ?? (await lastModel(input.sessionID))
    if (!model?.providerID || !model?.modelID) {
      throw new Error(
        `Could not resolve model for session ${input.sessionID}. ` +
        `providerID=${String(model?.providerID)} modelID=${String(model?.modelID)}`,
      )
    }
    const userMsg: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      role: "user",
      agent: input.agent,
      model: {
        providerID: model.providerID,
        modelID: model.modelID,
      },
    }
    await Session.updateMessage(userMsg)
    const userPart: MessageV2.Part = {
      type: "text",
      id: Identifier.ascending("part"),
      messageID: userMsg.id,
      sessionID: input.sessionID,
      text: "The following tool was executed by the user",
      synthetic: true,
    }
    await Session.updatePart(userPart)

    const cwd = await Session.effectiveDefaultPath(input.sessionID)
    const root = cfg.instance?.worktree ?? process.cwd()
    const msg: MessageV2.Assistant = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      parentID: userMsg.id,
      from: { kind: "agent", id: input.agent },
      mode: input.agent,
      agent: input.agent,
      cost: 0,
      path: {
        cwd,
        root,
      },
      time: {
        created: Date.now(),
      },
      role: "assistant",
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: model.modelID,
      providerID: model.providerID,
    }
    await Session.updateMessage(msg)
    const part: MessageV2.Part = {
      type: "tool",
      id: Identifier.ascending("part"),
      messageID: msg.id,
      sessionID: input.sessionID,
      tool: "bash",
      callID: ulid(),
      state: {
        status: "running",
        time: {
          start: Date.now(),
        },
        input: {
          command: input.command,
        },
      },
    }
    await Session.updatePart(part)
    const shell = cfg.shell?.preferred?.() ?? (process.platform === "win32" ? "cmd.exe" : "/bin/sh")
    const shellName = (
      process.platform === "win32" ? path.win32.basename(shell, ".exe") : path.basename(shell)
    ).toLowerCase()

    const invocations: Record<string, { args: string[] }> = {
      nu: { args: ["-c", input.command] },
      fish: { args: ["-c", input.command] },
      zsh: {
        args: [
          "-c",
          "-l",
          `
            [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
            [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      bash: {
        args: [
          "-c",
          "-l",
          `
            shopt -s expand_aliases
            [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      cmd: { args: ["/c", input.command] },
      powershell: { args: ["-NoProfile", "-Command", input.command] },
      pwsh: { args: ["-NoProfile", "-Command", input.command] },
      "": { args: ["-c", `${input.command}`] },
    }

    const matchingInvocation = invocations[shellName] ?? invocations[""]
    const args = matchingInvocation?.args ?? []

    const shellEnv = await cfg.plugin?.trigger(
      "shell.env",
      { cwd, sessionID: input.sessionID, callID: (part as any).callID },
      { env: {} },
    ) ?? { env: {} }
    const proc = spawn(shell, args, {
      cwd,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...shellEnv.env,
        TERM: "dumb",
      },
    })

    let output = ""

    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        (part.state as any).metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        (part.state as any).metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    let aborted = false
    let exited = false

    const kill = () => cfg.shell?.killTree?.(proc, { exited: () => exited })

    if (abort.aborted) {
      aborted = true
      await kill()
    }

    const abortHandler = () => {
      aborted = true
      void kill()
    }

    abort.addEventListener("abort", abortHandler, { once: true })

    await new Promise<void>((resolve) => {
      proc.on("close", () => {
        exited = true
        abort.removeEventListener("abort", abortHandler)
        resolve()
      })
    })

    if (aborted) {
      output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
    }
    msg.time.completed = Date.now()
    await Session.updateMessage(msg)
    if (part.state.status === "running") {
      (part as any).state = {
        status: "completed",
        time: {
          ...(part.state as any).time,
          end: Date.now(),
        },
        input: part.state.input,
        title: "",
        metadata: {
          output,
          description: "",
        },
        output,
      }
      await Session.updatePart(part)
    }
    return { info: msg, parts: [part] }
  }

  export const CommandInput = z.object({
    messageID: Identifier.schema("message").optional(),
    sessionID: Identifier.schema("session"),
    agent: z.string().optional(),
    model: z.string().optional(),
    arguments: z.string(),
    command: z.string(),
    variant: z.string().optional(),
    parts: z
      .array(
        z.discriminatedUnion("type", [
          MessageV2.FilePart.omit({
            messageID: true,
            sessionID: true,
          }).partial({
            id: true,
          }),
        ]),
      )
      .optional(),
  })
  export type CommandInput = z.infer<typeof CommandInput>
  const bashRegex = /!`([^`]+)`/g
  const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi
  const placeholderRegex = /\$(\d+)/g
  const quoteTrimRegex = /^["']|["']$/g

  export async function command(input: CommandInput) {
    log.info("command", input)
    const cfg = getConfig()
    const commandDef = await cfg.commandDefault?.get(input.command)
    const agentName = commandDef?.agent ?? input.agent ?? (await cfg.agent?.defaultAgent?.())

    const raw = input.arguments.match(argsRegex) ?? []
    const args = raw.map((arg: string) => arg.replace(quoteTrimRegex, ""))

    const templateCommand = await commandDef?.template

    const placeholders = templateCommand?.match(placeholderRegex) ?? []
    let last = 0
    for (const item of placeholders) {
      const value = Number(item.slice(1))
      if (value > last) last = value
    }

    const withArgs = (templateCommand ?? "").replaceAll(placeholderRegex, (_: any, index: any) => {
      const position = Number(index)
      const argIndex = position - 1
      if (argIndex >= args.length) return ""
      if (position === last) return args.slice(argIndex).join(" ")
      return args[argIndex]
    })
    const usesArgumentsPlaceholder = (templateCommand ?? "").includes("$ARGUMENTS")
    let template = withArgs.replaceAll("$ARGUMENTS", input.arguments)

    if (placeholders.length === 0 && !usesArgumentsPlaceholder && input.arguments.trim()) {
      template = template + "\n\n" + input.arguments
    }

    const shellMatches = cfg.configMarkdown?.shell?.(template) ?? []
    if (shellMatches.length > 0) {
      const results = await Promise.all(
        shellMatches.map(async ([, cmd]: [string, string]) => {
          try {
            return await $`${{ raw: cmd }}`.quiet().nothrow().text()
          } catch (error) {
            return `Error executing command: ${error instanceof Error ? error.message : String(error)}`
          }
        }),
      )
      let index = 0
      template = template.replace(bashRegex, () => results[index++])
    }
    template = template.trim()

    const taskModel = await (async () => {
      if (commandDef?.model) {
        return cfg.provider?.parseModel?.(commandDef.model)
      }
      if (commandDef?.agent) {
        const cmdAgent = await cfg.agent?.get?.(commandDef.agent)
        if (cmdAgent?.model) {
          return cmdAgent.model
        }
      }
      if (input.model) return cfg.provider?.parseModel?.(input.model)
      return await lastModel(input.sessionID)
    })()

    try {
      await cfg.provider?.getModel(taskModel.providerID, taskModel.modelID)
    } catch (e: any) {
      if (cfg.provider?.ModelNotFoundError?.isInstance?.(e)) {
        const { providerID, modelID, suggestions } = e.data
        const hint = suggestions?.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""
        cfg.bus?.publish(Session.Event.Error, {
          sessionID: input.sessionID,
          error: new NamedError.Unknown({ message: `Model not found: ${providerID}/${modelID}.${hint}` }).toObject(),
        })
      }
      throw e
    }
    const agent = await (cfg.agent?.getByIdOrName?.(agentName) ?? cfg.agent?.get?.(agentName))
    if (!agent) {
      const available = await cfg.agent?.list?.().then((agents: any[]) => agents.filter((a) => !a.hidden).map((a: any) => a.name)) ?? []
      const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
      const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
      cfg.bus?.publish(Session.Event.Error, {
        sessionID: input.sessionID,
        error: error.toObject(),
      })
      throw error
    }

    const templateParts = await resolvePromptParts(template)
    const isSubtask = (cfg.agent?.isWorkerMode?.(agent.mode) && commandDef?.subtask !== false) || commandDef?.subtask === true
    const parts = isSubtask
      ? [
        {
          type: "subtask" as const,
          agent: agent.id,
          description: commandDef?.description ?? "",
          command: input.command,
          model: {
            providerID: taskModel.providerID,
            modelID: taskModel.modelID,
          },
          prompt: (templateParts.find((y: any) => y.type === "text") as any)?.text ?? "",
        },
      ]
      : [...templateParts, ...(input.parts ?? [])]

    const userAgent = isSubtask ? (input.agent ?? (await cfg.agent?.defaultAgent?.())) : agentName
    const userModel = isSubtask
      ? input.model
        ? cfg.provider?.parseModel?.(input.model)
        : await lastModel(input.sessionID)
      : taskModel

    await cfg.plugin?.trigger(
      "command.execute.before",
      {
        command: input.command,
        sessionID: input.sessionID,
        arguments: input.arguments,
      },
      { parts },
    )

    const result = (await prompt({
      sessionID: input.sessionID,
      messageID: input.messageID,
      model: userModel,
      agent: userAgent,
      parts,
      variant: input.variant,
    })) as MessageV2.WithParts

    cfg.bus?.publish(cfg.commandEvent?.Executed ?? { type: "command.executed" }, {
      name: input.command,
      sessionID: input.sessionID,
      arguments: input.arguments,
      messageID: result.info.id,
    })

    return result
  }

  async function ensureTitle(input: {
    session: Session.Info
    history: MessageV2.WithParts[]
    providerID: string
    modelID: string
  }) {
    const cfg = getConfig()
    log.info("ensureTitle called", { sessionID: input.session.id, title: input.session.title })
    
    if (input.session.parentSessionID) {
      log.info("ensureTitle: skipping child session", { sessionID: input.session.id })
      return
    }
    if (!Session.isDefaultTitle(input.session.title)) {
      log.info("ensureTitle: title already set", { sessionID: input.session.id, title: input.session.title })
      return
    }

    const firstRealUserIdx = input.history.findIndex(
      (m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic),
    )
    if (firstRealUserIdx === -1) {
      log.info("ensureTitle: no real user message found", { sessionID: input.session.id })
      return
    }

    // A session can receive several user messages before its first loop turn
    // (for example, while messages are queued). As long as it retains its
    // generated default title, use the earliest real user message to name it.
    const contextMessages = input.history.slice(0, firstRealUserIdx + 1)
    const firstRealUser = contextMessages[firstRealUserIdx]!

    const subtaskParts = firstRealUser.parts.filter((p) => p.type === "subtask") as MessageV2.SubtaskPart[]
    const hasOnlySubtaskParts = subtaskParts.length > 0 && firstRealUser.parts.every((p) => p.type === "subtask")

    const agent = await cfg.agent?.get?.("title")
    if (!agent) {
      log.warn("ensureTitle: title agent not found", { sessionID: input.session.id })
      return
    }
    log.info("ensureTitle: title agent found", { sessionID: input.session.id, agentModel: agent.model })
    const model = await iife(async () => {
      if (agent.model) {
        if (agent.model.providerID === "fallback") {
          const slot = await cfg.provider?.resolveFallback?.(agent.model.modelID)
          if (!slot) throw new Error("fallback model resolution is not configured")
          return await cfg.provider?.getModel(slot.providerID, slot.modelID)
        }
        return await cfg.provider?.getModel(agent.model.providerID, agent.model.modelID)
      }
      return (
        (await cfg.provider?.getSmallModel?.(input.providerID)) ??
        (await cfg.provider?.getModel(input.providerID, input.modelID))
      )
    })
    const result = await LLM.stream({
      agent,
      user: firstRealUser.info as MessageV2.User,
      system: [],
      small: true,
      tools: {},
      model,
      abort: new AbortController().signal,
      sessionID: input.session.id,
      retries: 2,
      messages: [
        {
          role: "user",
          content: "Generate a title for this conversation:\n",
        },
        ...(hasOnlySubtaskParts
          ? [{ role: "user" as const, content: subtaskParts.map((p) => p.prompt).join("\n") }]
          : MessageV2.toModelMessages(contextMessages, model)),
      ],
    })
    const text = await result.text.catch((err: any) => {
      log.error("failed to generate title", { sessionID: input.session.id, error: err })
      return null
    })
    result.usage.then(async (usage) => {
      const { TokenUsage } = await import("./token-usage.ts")
      await TokenUsage.record({
        sessionID:  input.session.id,
        providerID: model.providerID,
        modelID:    model.id,
        purpose:    "title",
        tokens:     { input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0, cacheRead: usage.cachedInputTokens ?? 0, cacheWrite: 0, reasoning: 0 },
        model,
        headers:    (await result.response.catch(() => null))?.headers ?? undefined,
      })
    }).catch(() => {})
    
    if (text) {
      log.info("ensureTitle: generated text", { sessionID: input.session.id, text })
      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
        .split("\n")
        .map((line: string) => line.trim())
        .find((line: string) => line.length > 0)
      
      if (!cleaned) {
        log.warn("ensureTitle: no cleaned title found", { sessionID: input.session.id })
        return
      }

      const title = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
      log.info("ensureTitle: setting title", { sessionID: input.session.id, title })
      const result = await Session.setTitle({ sessionID: input.session.id, title })
      log.info("ensureTitle: title set successfully", { sessionID: input.session.id, title })
      return result
    } else {
      log.warn("ensureTitle: no text generated", { sessionID: input.session.id })
    }
  }
}
