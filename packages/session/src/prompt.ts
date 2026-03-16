import path from "path"
import os from "os"
import fs from "fs/promises"
import z from "zod"
import { fn } from "@opendora/util/fn"
import { MessageV2 } from "./message-v2.ts"

// Inline Identifier — matches opencode's id/id.ts prefixes via startsWith
const Identifier = {
  schema(prefix: string) {
    return z.string()
  },
  ascending(prefix: string): string {
    const now = Date.now()
    return `${prefix}_${now.toString(16).padStart(12, "0")}${Math.random().toString(36).slice(2, 14)}`
  },
  descending(prefix: string, id?: string): string {
    if (id) return id
    const now = Date.now()
    const flipped = (0xffffffffffff - now).toString(16).padStart(12, "0")
    return `${prefix}_${flipped}${Math.random().toString(36).slice(2, 14)}`
  },
}
import { SessionRevert } from "./revert.ts"
import { Session } from "./session.ts"
import { type Tool as AITool, tool, jsonSchema, type ToolCallOptions, asSchema } from "ai"
import { SessionCompaction } from "./compaction.ts"
import { getConfig } from "./config.ts"
import { SystemPrompt } from "./system.ts"
import { InstructionPrompt } from "./instruction.ts"
import MAX_STEPS from "./prompt/max-steps.txt"
import { SessionSummary } from "./summary.ts"
import { NamedError } from "@opendora/util/error"
import { SessionProcessor } from "./processor.ts"
import { SessionStatus } from "./status.ts"
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

const STRUCTURED_OUTPUT_SYSTEM_PROMPT = `IMPORTANT: The user has requested structured output. You MUST use the StructuredOutput tool to provide your final response. Do NOT respond with plain text - you MUST call the StructuredOutput tool with your answer formatted according to the schema.`

export namespace SessionPrompt {
  // Module-level state map — equivalent to Instance.state()
  const _state: Record<
    string,
    {
      abort: AbortController
      callbacks: {
        resolve(input: MessageV2.WithParts): void
        reject(reason?: any): void
      }[]
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

  export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    tools: z
      .record(z.string(), z.boolean())
      .optional()
      .describe(
        "@deprecated tools and permissions have been merged, you can set permissions on the session itself now",
      ),
    format: MessageV2.Format.optional(),
    system: z.string().optional(),
    variant: z.string().optional(),
    /** Set when the prompt is injected by a tool call in another session */
    parentSessionID: z.string().optional(),
    /** The message ID in parentSessionID that contains the tool call injecting this message */
    parentMessageID: z.string().optional(),
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
    await SessionRevert.cleanup(session)

    const message = await createUserMessage(input)
    await Session.touch(input.sessionID)

    // backwards compatibility for allowing `tools` to be specified when prompting
    const cfg = getConfig()
    const permissions: any[] = []
    for (const [t, enabled] of Object.entries(input.tools ?? {})) {
      permissions.push({
        permission: t,
        action: enabled ? "allow" : "deny",
        pattern: "*",
      })
    }
    if (permissions.length > 0) {
      session.permission = permissions
      await Session.setPermission({ sessionID: session.id, permission: permissions })
    }

    if (input.noReply === true) {
      return message
    }

    return loop({ sessionID: input.sessionID })
  })

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
    }
    return controller.signal
  }

  function resume(sessionID: string) {
    const s = state()
    if (!s[sessionID]) return

    return s[sessionID].abort.signal
  }

  export function cancel(sessionID: string) {
    log.info("cancel", { sessionID })
    const s = state()
    const match = s[sessionID]
    if (!match) {
      SessionStatus.set(sessionID, { type: "idle" })
      return
    }
    match.abort.abort()
    delete s[sessionID]
    SessionStatus.set(sessionID, { type: "idle" })
    return
  }

  export const LoopInput = z.object({
    sessionID: Identifier.schema("session"),
    resume_existing: z.boolean().optional(),
  })
  export const loop = fn(LoopInput, async (input) => {
    const { sessionID, resume_existing } = input
    const cfg = getConfig()

    const abort = resume_existing ? resume(sessionID) : start(sessionID)
    if (!abort) {
      return new Promise<MessageV2.WithParts>((resolve, reject) => {
        const callbacks = state()[sessionID].callbacks
        callbacks.push({ resolve, reject })
      })
    }

    using _ = defer(() => cancel(sessionID))

    // Structured output state
    let structuredOutput: unknown | undefined

    let step = 0
    const session = await Session.get(sessionID)
    while (true) {
      SessionStatus.set(sessionID, { type: "busy" })
      log.info("loop", { step, sessionID })
      if (abort.aborted) break
      let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

      let lastUser: MessageV2.User | undefined
      let lastAssistant: MessageV2.Assistant | undefined
      let lastFinished: MessageV2.Assistant | undefined
      let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (!lastUser && msg.info.role === "user") lastUser = msg.info as MessageV2.User
        if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info as MessageV2.Assistant
        if (!lastFinished && msg.info.role === "assistant" && msg.info.finish)
          lastFinished = msg.info as MessageV2.Assistant
        if (lastUser && lastFinished) break
        const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
        if (task && !lastFinished) {
          tasks.push(...task)
        }
      }

      if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
      if (
        lastAssistant?.finish &&
        !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
        lastUser.id < lastAssistant.id
      ) {
        log.info("exiting loop", { sessionID })
        break
      }

      step++
      if (step === 1)
        ensureTitle({
          session,
          modelID: lastUser.model.modelID,
          providerID: lastUser.model.providerID,
          history: msgs,
        })

      const model = await cfg.provider?.getModel(lastUser.model.providerID, lastUser.model.modelID).catch((e: any) => {
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
      const task = tasks.pop()

      // pending subtask
      if (task?.type === "subtask") {
        const taskTool = await cfg.taskTool?.init?.()
        const taskModel = task.model ? await cfg.provider?.getModel(task.model.providerID, task.model.modelID) : model
        const assistantMessage = (await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "assistant",
          parentID: lastUser.id,
          sessionID,
          mode: task.agent,
          agent: task.agent,
          variant: lastUser.variant,
          path: {
            cwd: cfg.instance?.directory ?? process.cwd(),
            root: cfg.instance?.worktree ?? process.cwd(),
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
          tool: cfg.taskTool?.id ?? "task",
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
            tool: "task",
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
        const taskCtx: any = {
          agent: task.agent,
          messageID: assistantMessage.id,
          sessionID: sessionID,
          abort,
          callID: part.callID,
          extra: { bypassAgentCheck: true },
          messages: msgs,
          async metadata(metaInput: any) {
            await Session.updatePart({
              ...part,
              type: "tool",
              state: {
                ...part.state,
                ...metaInput,
              },
            } satisfies MessageV2.ToolPart)
          },
          async ask(req: any) {
            await cfg.permissionNext?.ask({
              ...req,
              sessionID: sessionID,
              ruleset: cfg.permissionNext?.merge?.(taskAgent.permission, session.permission ?? []),
            })
          },
        }
        const result = await taskTool?.execute?.(taskArgs, taskCtx).catch((error: any) => {
          executionError = error
          log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
          return undefined
        })
        const attachments = result?.attachments?.map((attachment: any) => ({
          ...attachment,
          id: Identifier.ascending("part"),
          sessionID,
          messageID: assistantMessage.id,
        }))
        await cfg.plugin?.trigger(
          "tool.execute.after",
          {
            tool: "task",
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

      // context overflow, needs compaction
      if (
        lastFinished &&
        lastFinished.summary !== true &&
        (await SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model }))
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

      const processor = SessionProcessor.create({
        assistantMessage: (await Session.updateMessage({
          id: Identifier.ascending("message"),
          parentID: lastUser.id,
          role: "assistant",
          mode: agent.name,
          agent: agent.id,
          variant: lastUser.variant,
          path: {
            cwd: cfg.instance?.directory ?? process.cwd(),
            root: cfg.instance?.worktree ?? process.cwd(),
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
          time: {
            created: Date.now(),
          },
          sessionID,
        })) as MessageV2.Assistant,
        sessionID: sessionID,
        model,
        abort,
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

      // Inject StructuredOutput tool if JSON schema mode enabled
      if (lastUser.format?.type === "json_schema") {
        tools["StructuredOutput"] = createStructuredOutputTool({
          schema: lastUser.format.schema,
          onSuccess(output: unknown) {
            structuredOutput = output
          },
        })
      }

      if (step === 1) {
        SessionSummary.summarize({
          sessionID: sessionID,
          messageID: lastUser.id,
        })
      }

      // Ephemerally wrap queued user messages with a reminder to stay on track
      if (step > 1 && lastFinished) {
        for (const msg of msgs) {
          if (msg.info.role !== "user" || msg.info.id <= lastFinished.id) continue
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

      // Build system prompt
      const system = [...(await SystemPrompt.environment(model)), ...(await InstructionPrompt.system())]
      const format = lastUser.format ?? { type: "text" }
      if (format.type === "json_schema") {
        system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)
      }

      const result = await processor.process({
        user: lastUser,
        agent,
        abort,
        sessionID,
        system,
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
        toolChoice: format.type === "json_schema" ? "required" : undefined,
      })

      // If structured output was captured, save it and exit
      if (structuredOutput !== undefined) {
        processor.message.structured = structuredOutput
        processor.message.finish = processor.message.finish ?? "stop"
        await Session.updateMessage(processor.message)
        break
      }

      const modelFinished = processor.message.finish && !["tool-calls", "unknown"].includes(processor.message.finish)

      if (modelFinished && !processor.message.error) {
        if (format.type === "json_schema") {
          processor.message.error = new MessageV2.StructuredOutputError({
            message: "Model did not produce structured output",
            retries: 0,
          }).toObject()
          await Session.updateMessage(processor.message)
          break
        }
      }

      if (result === "stop") break
      if (result === "compact") {
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
    for await (const item of MessageV2.stream(sessionID)) {
      if (item.info.role === "user" && item.info.model) return item.info.model
    }
    return cfg.provider?.defaultModel?.()
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

    const context = (args: any, options: ToolCallOptions): any => ({
      sessionID: input.session.id,
      abort: options.abortSignal!,
      messageID: input.processor.message.id,
      callID: options.toolCallId,
      extra: {
        model: input.model,
        bypassAgentCheck: input.bypassAgentCheck,
        directory: cfg.instance?.directory ?? process.cwd(),
        worktree: cfg.instance?.worktree ?? process.cwd(),
        skills: {
          all: () => cfg.skill?.all?.(),
          get: (name: string) => cfg.skill?.get?.(name),
        },
        agents: {
          list: () => cfg.agent?.list?.(),
          get: (id: string) => cfg.agent?.get?.(id),
          create: (id: string, c: any, persona?: string, injection?: string) => cfg.agent?.create?.(id, c, persona, injection),
          update: (id: string, patch: any, persona?: string, injection?: string) => cfg.agent?.update?.(id, patch, persona, injection),
          remove: (id: string) => cfg.agent?.remove?.(id),
        },
        config: {
          get: () => cfg.config?.get(),
          directories: () => cfg.config?.directories(),
        },
        containsPath: (p: string) => cfg.instance?.containsPath?.(p),
      },
      agent: input.agent.name,
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
        await cfg.permissionNext?.ask({
          ...req,
          sessionID: input.session.id,
          tool: { messageID: input.processor.message.id, callID: options.toolCallId },
          ruleset: cfg.permissionNext?.merge?.(input.agent.permission, input.session.permission ?? []),
        })
      },
    })

    const toolRegistryItems = await cfg.toolRegistry?.get({ modelID: input.model.api.id, providerID: input.model.providerID }, input.agent) ?? {}
    for (const [id, item] of Object.entries(toolRegistryItems as Record<string, any>)) {
      const schema = cfg.providerTransform?.schema?.(input.model, (await import("zod").then(z => z.default.toJSONSchema(item.parameters))) ) ?? {}
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
      input.session.permission,
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

    // Filter by agent tools allowlist
    if (input.agent.tools) {
      if (input.agent.tools.length > 0) {
        const allowed = new Set(input.agent.tools)
        for (const id of Object.keys(tools)) {
          if (id !== "invalid" && !allowed.has(id)) {
            delete tools[id]
          }
        }
      } else {
        // Empty tools array means no tools allowed (except "invalid")
        for (const id of Object.keys(tools)) {
          if (id !== "invalid") {
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
    const cfg = getConfig()
    const agentName = input.agent ?? await cfg.agent?.defaultAgent?.()
    const agent = await cfg.agent?.get?.(agentName)
    if (!agent) throw new Error(`Unknown agent: ${input.agent}`)

    const model = input.model ?? agent.model ?? (await lastModel(input.sessionID))
    const full =
      !input.variant && agent.variant
        ? await cfg.provider?.getModel(model.providerID, model.modelID).catch(() => undefined)
        : undefined
    const variant = input.variant ?? (agent.variant && full?.variants?.[agent.variant] ? agent.variant : undefined)

    const info: MessageV2.Info = {
      id: input.messageID ?? Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      tools: input.tools,
      agent: agent.id,
      model,
      system: input.system,
      format: input.format,
      variant,
      ...(input.parentSessionID && {
        parentSessionID: input.parentSessionID,
        parentMessageID: input.parentMessageID,
      }),
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
                  const filePathURI = part.url.split("?")[0]
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
                    const model2 = await cfg.provider?.getModel(info.model.providerID, info.model.modelID)
                    const readCtx: any = {
                      sessionID: input.sessionID,
                      abort: new AbortController().signal,
                      agent: input.agent!,
                      messageID: info.id,
                      extra: { bypassCwdCheck: true, model: model2 },
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
                  agent: input.agent!,
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
          const perm = cfg.permissionNext?.evaluate?.("task", part.name, agent.permission)
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
                " Use the above message and context to generate a prompt and call the task tool with subagent: " +
                part.name +
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

    await Session.updateMessage(info)
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

    // Generic agent injection system
    if (input.agent.config?.enableInjection) {
      const injection = await cfg.agent?.getInjection?.(input.agent.id)
      if (injection) {
        userMessage.parts.push({
          id: Identifier.ascending("part"),
          messageID: userMessage.info.id,
          sessionID: userMessage.info.sessionID,
          type: "text",
          text: injection,
          synthetic: true,
        })
      }
    }

    // Original logic when experimental plan mode is disabled
    if (!process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE) {
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
      await SessionRevert.cleanup(session)
    }
    const agent = await cfg.agent?.get?.(input.agent)
    if (!agent) throw new Error(`Unknown agent: ${input.agent}`)
    const model = input.model ?? agent.model ?? (await lastModel(input.sessionID))
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

    const msg: MessageV2.Assistant = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      parentID: userMsg.id,
      mode: input.agent,
      agent: input.agent,
      cost: 0,
      path: {
        cwd: cfg.instance?.directory ?? process.cwd(),
        root: cfg.instance?.worktree ?? process.cwd(),
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
    const args = matchingInvocation?.args

    const cwd = cfg.instance?.directory ?? process.cwd()
    const shellEnv = await cfg.plugin?.trigger(
      "shell.env",
      { cwd, sessionID: input.sessionID, callID: (part as any).callID },
      { env: {} },
    ) ?? { env: {} }
    const proc = spawn(shell, args, {
      cwd,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
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
    const agent = await cfg.agent?.get?.(agentName)
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
          prompt: templateParts.find((y: any) => y.type === "text")?.text ?? "",
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
    if (input.session.parentID) return
    if (!Session.isDefaultTitle(input.session.title)) return

    const firstRealUserIdx = input.history.findIndex(
      (m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic),
    )
    if (firstRealUserIdx === -1) return

    const isFirst =
      input.history.filter((m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic))
        .length === 1
    if (!isFirst) return

    const contextMessages = input.history.slice(0, firstRealUserIdx + 1)
    const firstRealUser = contextMessages[firstRealUserIdx]

    const subtaskParts = firstRealUser.parts.filter((p) => p.type === "subtask") as MessageV2.SubtaskPart[]
    const hasOnlySubtaskParts = subtaskParts.length > 0 && firstRealUser.parts.every((p) => p.type === "subtask")

    const agent = await cfg.agent?.get?.("title")
    if (!agent) return
    const model = await iife(async () => {
      if (agent.model) return await cfg.provider?.getModel(agent.model.providerID, agent.model.modelID)
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
    const text = await result.text.catch((err: any) => log.error("failed to generate title", { error: err }))
    if (text) {
      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
        .split("\n")
        .map((line: string) => line.trim())
        .find((line: string) => line.length > 0)
      if (!cleaned) return

      const title = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
      return Session.setTitle({ sessionID: input.session.id, title })
    }
  }
}
