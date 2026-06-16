/**
 * SessionCompaction — migrated from opencode/src/session/compaction.ts
 * Handles context-window overflow detection, pruning, and compaction.
 *
 * Dependencies injected via getConfig():
 *   config.config    — Config.get() for compaction settings
 *   config.plugin    — Plugin.trigger for experimental hooks
 *   config.agent     — Agent.get("compaction")
 *   config.provider  — Provider.getModel
 *   config.bus       — Bus.publish for Compacted event
 */

import z from "zod"
import { fn } from "@opendora/util/fn"
import { Identifier } from "@opendora/util/id"
import { MessageV2 } from "./message-v2.ts"
import { getConfig } from "./config.ts"
import { LLM } from "./llm.ts"

// Token.estimate — rough approximation: 1 token ≈ 4 chars
function estimateTokens(text: any): number {
  if (!text) return 0
  const str = typeof text === "string" ? text : JSON.stringify(text)
  return Math.ceil(str.length / 4)
}

const CompactedEvent = { type: "session.compacted" }

export namespace SessionCompaction {
  export const Event = {
    Compacted: CompactedEvent,
  }

  const COMPACTION_BUFFER = 20_000

  export async function isOverflow(input: { tokens: MessageV2.Assistant["tokens"]; model: any }) {
    const cfg = getConfig()
    const configSvc = cfg.config
    if (configSvc) {
      const config = await configSvc.get()
      if (config.compaction?.auto === false) return false
    }
    const rawContext = input.model.limit?.context
    const configSvc2 = cfg.config
    const configVal = configSvc2 ? await configSvc2.get() : null

    // Allow per-model context window overrides in config:
    //   compaction.modelLimits: { "providerID/modelID": { context: 200000 } }
    const modelKey = `${input.model.providerID}/${input.model.id}`
    const configLimit = configVal?.compaction?.modelLimits?.[modelKey]?.context
    const context = configLimit ?? rawContext

    // When the model's context window is unknown (0 or missing), use a conservative
    // 100K fallback rather than disabling the check entirely. This ensures proactive
    // compaction still fires for models whose limits aren't in the database.
    const FALLBACK_CONTEXT = 100_000
    const effectiveContext = (!context || context === 0) ? FALLBACK_CONTEXT : context

    const count =
      input.tokens.total ||
      input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write

    if (!count) return false   // no token data yet — can't determine overflow

    // maxOutputTokens approximation — clamp to OUTPUT_TOKEN_MAX to match what llm.ts actually requests
    const maxOutput = Math.min(input.model.limit?.output ?? COMPACTION_BUFFER, LLM.OUTPUT_TOKEN_MAX)
    const reserved = configVal?.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, maxOutput)
    const usable = input.model.limit?.input
      ? input.model.limit.input - reserved
      : effectiveContext - maxOutput
    return count >= usable
  }

  export const PRUNE_MINIMUM = 20_000
  export const PRUNE_PROTECT = 40_000

  const PRUNE_PROTECTED_TOOLS = ["skill"]

  async function resolveModel(input: {
    model: { providerID: string; modelID: string }
    provider: NonNullable<ReturnType<typeof getConfig>["provider"]>
  }) {
    if (input.model.providerID === "fallback") {
      const slot = await input.provider.resolveFallback?.(input.model.modelID)
      if (!slot) throw new Error("fallback model resolution is not configured")
      return input.provider.getModel(slot.providerID, slot.modelID)
    }
    return input.provider.getModel(input.model.providerID, input.model.modelID)
  }

  export async function prune(input: {
    sessionID: string
    getMessages: (sessionID: string) => Promise<MessageV2.WithParts[]>
    updatePart: (part: any) => Promise<any>
  }) {
    const cfg = getConfig()
    const configSvc = cfg.config
    if (configSvc) {
      const config = await configSvc.get()
      if (config.compaction?.prune === false) return
    }

    const msgs = await input.getMessages(input.sessionID)
    let total = 0
    let pruned = 0
    const toPrune: any[] = []
    let turns = 0

    loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
      const msg = msgs[msgIndex]!
      if (msg.info.role === "user") turns++
      if (turns < 2) continue
      if (msg.info.role === "assistant" && (msg.info as any).summary) break loop
      for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
        const part = msg.parts[partIndex]!
        if (part.type === "tool")
          if (part.state.status === "completed") {
            if (PRUNE_PROTECTED_TOOLS.includes(part.tool)) continue

            if ((part.state as any).time?.compacted) break loop
            const estimate = estimateTokens(part.state.output)
            total += estimate
            if (total > PRUNE_PROTECT) {
              pruned += estimate
              toPrune.push(part)
            }
          }
      }
    }

    if (pruned > PRUNE_MINIMUM) {
      for (const part of toPrune) {
        if (part.state.status === "completed") {
          part.state.time.compacted = Date.now()
          await input.updatePart(part)
        }
      }
    }
  }

  export async function process(input: {
    parentID: string
    messages: MessageV2.WithParts[]
    sessionID: string
    abort: AbortSignal
    auto: boolean
    // Injected Session methods
    updateMessage: (msg: any) => Promise<any>
    updatePart: (part: any) => Promise<any>
    updatePartDelta: (input: any) => Promise<any>
    getUsage: (input: any) => any
    instance: { directory: string; worktree: string }
  }) {
    const cfg = getConfig()
    const agentSvc = cfg.agent
    const providerSvc = cfg.provider

    if (!agentSvc || !providerSvc) {
      console.warn("[session-core] compaction.process: agent or provider not configured")
      return "stop"
    }

    const userMessage = input.messages.findLast((m) => m.info.id === input.parentID)!.info as MessageV2.User
    const agent = await agentSvc.get("compaction")
    if (!agent) {
      console.warn("[session-core] compaction.process: compaction agent not configured")
      return "stop"
    }
    const modelRef = agent.model ?? userMessage.model
    const model = await resolveModel({ model: modelRef, provider: providerSvc })

    const msg = (await input.updateMessage({
      id: Identifier.ascending("message"),
      role: "assistant",
      from: { kind: "agent", id: "compaction" },
      parentID: input.parentID,
      sessionID: input.sessionID,
      mode: "compaction",
      agent: "compaction",
      variant: userMessage.variant,
      summary: true,
      path: {
        cwd: input.instance.directory,
        root: input.instance.worktree,
      },
      cost: 0,
      tokens: {
        output: 0,
        input: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: model.id,
      providerID: model.providerID,
      time: {
        created: Date.now(),
      },
    })) as MessageV2.Assistant

    // Import SessionProcessor dynamically to avoid circular dep
    const { SessionProcessor } = await import("./processor.ts")
    const processor = SessionProcessor.create({
      assistantMessage: msg,
      sessionID: input.sessionID,
      model,
      abort: input.abort,
      updateMessage: input.updateMessage,
      updatePart: input.updatePart,
      updatePartDelta: input.updatePartDelta,
      getUsage: input.getUsage,
      fallbackGroupID: modelRef.providerID === "fallback" ? modelRef.modelID : undefined,
    })

    const pluginSvc = cfg.plugin
    const compacting = pluginSvc
      ? await pluginSvc.trigger(
          "experimental.session.compacting",
          { sessionID: input.sessionID },
          { context: [], prompt: undefined },
        )
      : { context: [], prompt: undefined }

    const defaultPrompt = `Provide a detailed prompt for continuing our conversation above.
Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next.
The summary that you construct will be used so that another agent can read it and continue the work.

When constructing the summary, try to stick to this template:
---
## Goal

[What goal(s) is the user trying to accomplish?]

## Instructions

- [What important instructions did the user give you that are relevant]
- [If there is a plan or spec, include information about it so next agent can continue using it]

## Discoveries

[What notable things were learned during this conversation that would be useful for the next agent to know when continuing the work]

## Accomplished

[What work has been completed, what work is still in progress, and what work is left?]

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]
---`

    const promptText = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")

    const result = await processor.process({
      user: userMessage,
      agent,
      abort: input.abort,
      sessionID: input.sessionID,
      tools: {},
      system: [],
      messages: [
        ...MessageV2.toModelMessages(input.messages, model),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptText,
            },
          ],
        },
      ],
      model,
    })

    // Record token usage for compaction — fire-and-forget, best-effort
    processor.message &&
      void (async () => {
        try {
          const { TokenUsage } = await import("./token-usage.ts")
          const tokens = processor.message.tokens
          await TokenUsage.record({
            sessionID:  input.sessionID,
            agentID:    "compaction",
            projectID:  getConfig().instance?.project?.id,
            providerID: model.providerID,
            modelID:    model.id,
            purpose:    "compaction",
            tokens: {
              input:      tokens.input,
              output:     tokens.output,
              cacheRead:  tokens.cache?.read ?? 0,
              cacheWrite: tokens.cache?.write ?? 0,
              reasoning:  tokens.reasoning ?? 0,
            },
            model,
          })
        } catch { /* never let token tracking break compaction */ }
      })()

    if (result === "compact") {
      // The compaction model itself hit a context overflow — the conversation is
      // too large to summarize. Add an explanatory message and stop to avoid an
      // infinite compaction loop.
      await input.updatePart({
        id: Identifier.ascending("part"),
        messageID: msg.id,
        sessionID: input.sessionID,
        type: "text",
        text: "Context window limit reached during compaction. The conversation is too long for the model to summarize. Please start a new session.",
        synthetic: false,
        time: { start: Date.now(), end: Date.now() },
      })
      msg.finish = "stop"
      msg.time = { ...msg.time, completed: Date.now() }
      await input.updateMessage(msg)
      return "stop"
    }

    if (result === "continue" && input.auto) {
      const continueMsg = await input.updateMessage({
        id: Identifier.ascending("message"),
        role: "user",
        sessionID: input.sessionID,
        time: {
          created: Date.now(),
        },
        agent: userMessage.agent,
        model: userMessage.model,
      })
      await input.updatePart({
        id: Identifier.ascending("part"),
        messageID: continueMsg.id,
        sessionID: input.sessionID,
        type: "text",
        synthetic: true,
        text: "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.",
        time: {
          start: Date.now(),
          end: Date.now(),
        },
      })
    }
    if (processor.message.error) return "stop"
    cfg.bus?.publish(Event.Compacted, { sessionID: input.sessionID })
    return "continue"
  }

  export const create = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      agent: z.string(),
      model: z.object({
        providerID: z.string(),
        modelID: z.string(),
      }),
      auto: z.boolean(),
    }),
    async (input) => {
      const cfg = getConfig()
      const sessionSvc = cfg.session
      if (!sessionSvc) {
        console.warn("[session-core] compaction.create: session not configured")
        return
      }
      const msg = await sessionSvc.updateMessage({
        id: Identifier.ascending("message"),
        role: "user",
        model: input.model,
        sessionID: input.sessionID,
        agent: input.agent,
        time: {
          created: Date.now(),
        },
      })
      await sessionSvc.updatePart({
        id: Identifier.ascending("part"),
        messageID: msg.id,
        sessionID: msg.sessionID,
        type: "compaction",
        auto: input.auto,
      })
    },
  )
}
